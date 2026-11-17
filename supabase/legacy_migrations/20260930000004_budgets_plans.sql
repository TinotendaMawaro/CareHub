-- CareHub: Participant plans, budgets and funding
-- Run after payroll/timesheets migration

create table if not exists public.support_categories (
  category_no int primary key,
  name        text not null,
  budget_group text not null default 'Core' check (budget_group in ('Core','Capacity Building','Capital'))
);

insert into public.support_categories (category_no, name, budget_group) values
(1, 'Daily activities', 'Core'),
(2, 'Transport', 'Core'),
(3, 'Consumables', 'Core'),
(4, 'Social and community participation', 'Core'),
(5, 'Assistive technology', 'Capital'),
(6, 'Home modifications', 'Capital'),
(7, 'Support coordination', 'Capacity Building'),
(8, 'Improved living arrangements', 'Capacity Building'),
(9, 'Increased social and community participation', 'Capacity Building'),
(10, 'Finding and keeping a job', 'Capacity Building'),
(11, 'Improved relationships', 'Capacity Building'),
(12, 'Improved health and wellbeing', 'Capacity Building'),
(13, 'Improved learning', 'Capacity Building'),
(14, 'Improved life choices', 'Capacity Building'),
(15, 'Improved daily living', 'Capacity Building')
on conflict (category_no) do nothing;

create table if not exists public.participant_plans (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  ndis_number         text,
  management_type     text not null default 'self_managed' check (management_type in ('ndia','plan_managed','self_managed')),
  plan_manager_name   text,
  start_date          date not null,
  end_date            date not null,
  status              text not null default 'active' check (status in ('draft','active','ended')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.plan_budgets (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.participant_plans(id) on delete cascade,
  category_no int not null references public.support_categories(category_no),
  allocated   numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (plan_id, category_no)
);

create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  plan_id        uuid references public.participant_plans(id) on delete set null,
  category_no    int references public.support_categories(category_no),
  shift_id       uuid references public.shifts(id) on delete set null,
  caregiver_id   uuid references public.caregivers(id) on delete set null,
  kind           text not null check (kind in ('transport_km','activity_cost','consumables','purchase','other')),
  description    text not null,
  incurred_on    date not null default now(),
  amount         numeric(10,2) not null,
  reimburse_worker boolean not null default false,
  receipt_url    text,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.budget_adjustments (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.participant_plans(id) on delete cascade,
  category_no int references public.support_categories(category_no),
  amount      numeric(12,2) not null,
  reason      text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Ledger view: never materialise money in more than one place
create or replace view public.budget_ledger as
with plans as (
  select pp.id as plan_id, pp.client_id, pp.start_date, pp.end_date
  from public.participant_plans pp
  where pp.status = 'active'
)
select
  ss.id as source_id,
  'shift_segment' as source_table,
  ss.shift_id,
  s.client_id,
  s.caregiver_id,
  left(ss.item_number, 2)::int as category_no,
  pl.plan_id,
  case
    when s.status = 'Completed' then 'spent'
    when s.status in ('Scheduled','Late','In Progress') then 'committed'
    else 'cancelled'
  end as state,
  ss.bill_amount as amount,
  ss.seg_start as occurred_on
from public.shift_segments ss
join public.shifts s on s.id = ss.shift_id
join plans pl on pl.client_id = s.client_id
  and ss.seg_start::date >= pl.start_date
  and ss.seg_start::date <= pl.end_date

union all

select
  e.id,
  'expense',
  e.shift_id,
  e.client_id,
  e.caregiver_id,
  e.category_no,
  e.plan_id,
  case when e.status = 'approved' then 'spent' else 'committed' end,
  e.amount,
  e.incurred_on
from public.expenses e
join plans pl on pl.client_id = e.client_id
  and e.incurred_on >= pl.start_date
  and e.incurred_on <= pl.end_date

union all

select
  ba.id,
  'budget_adjustment',
  null,
  null,
  null,
  ba.category_no,
  ba.plan_id,
  'spent',
  ba.amount,
  ba.created_at::date
from public.budget_adjustments ba
join plans pl on pl.id = ba.plan_id;

create or replace view public.budget_summary as
with plan_categories as (
  select pb.plan_id, pb.category_no, sc.name, sc.budget_group, pb.allocated
  from public.plan_budgets pb
  join public.support_categories sc on sc.category_no = pb.category_no
),
ledger as (
  select plan_id, category_no, state, amount
  from public.budget_ledger
)
select
  pc.plan_id,
  pc.category_no,
  pc.name,
  pc.budget_group,
  pc.allocated,
  coalesce(sum(l.amount) filter (where l.state = 'spent'), 0) as spent,
  coalesce(sum(l.amount) filter (where l.state = 'committed'), 0) as committed,
  pc.allocated - coalesce(sum(l.amount) filter (where l.state in ('spent','committed')), 0) as remaining,
  case when pc.allocated > 0 then round(coalesce(sum(l.amount) filter (where l.state in ('spent','committed')), 0) / pc.allocated * 100, 2) else 0 end as percent_used
from plan_categories pc
left join ledger l on l.plan_id = pc.plan_id and l.category_no = pc.category_no
group by pc.plan_id, pc.category_no, pc.name, pc.budget_group, pc.allocated;

-- RLS
alter table if exists public.support_categories enable row level security;
alter table if exists public.participant_plans enable row level security;
alter table if exists public.plan_budgets enable row level security;
alter table if exists public.expenses enable row level security;
alter table if exists public.budget_adjustments enable row level security;

create policy support_categories_read on public.support_categories for select to authenticated using (true);
create policy support_categories_admin on public.support_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy participant_plans_read on public.participant_plans for select to authenticated
  using (public.is_admin() or exists (select 1 from public.clients c where c.id = client_id and auth.uid() = any (c.assigned_caregivers)));
create policy participant_plans_admin on public.participant_plans for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy plan_budgets_read on public.plan_budgets for select to authenticated
  using (exists (select 1 from public.participant_plans pp where pp.id = plan_id and (public.is_admin() or exists (select 1 from public.clients c where c.id = pp.client_id and auth.uid() = any (c.assigned_caregivers)))));
create policy plan_budgets_admin on public.plan_budgets for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy expenses_read on public.expenses for select to authenticated
  using (public.is_admin() or exists (select 1 from public.clients c where c.id = client_id and auth.uid() = any (c.assigned_caregivers)));
create policy expenses_write on public.expenses for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy budget_adjustments_admin on public.budget_adjustments for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.pay_periods, public.timesheets, public.timesheet_adjustments, public.participant_plans, public.plan_budgets, public.expenses, public.budget_adjustments;
