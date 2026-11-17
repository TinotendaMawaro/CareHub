-- CareHub baseline 7/7: budgets, expenses, notifications, wall, leave, storage, realtime, grants.

-- ---------------------------------------------------------------------------
-- Participant plans and budgets
-- ---------------------------------------------------------------------------
create table public.support_categories (
  category_no  int primary key,
  name         text not null,
  budget_group text not null default 'Core' check (budget_group in ('Core','Capacity Building','Capital'))
);
insert into public.support_categories (category_no, name, budget_group) values
 (1,'Daily activities','Core'),(2,'Transport','Core'),(3,'Consumables','Core'),
 (4,'Social and community participation','Core'),(5,'Assistive technology','Capital'),
 (6,'Home modifications','Capital'),(7,'Support coordination','Capacity Building'),
 (8,'Improved living arrangements','Capacity Building'),
 (9,'Increased social and community participation','Capacity Building'),
 (10,'Finding and keeping a job','Capacity Building'),(11,'Improved relationships','Capacity Building'),
 (12,'Improved health and wellbeing','Capacity Building'),(13,'Improved learning','Capacity Building'),
 (14,'Improved life choices','Capacity Building'),(15,'Improved daily living','Capacity Building');

alter table public.support_items
  add constraint support_items_category_fk foreign key (support_category) references public.support_categories(category_no);

create table public.participant_plans (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients on delete cascade,
  ndis_number       text,
  management_type   text not null default 'self_managed' check (management_type in ('ndia','plan_managed','self_managed')),
  plan_manager_name text,
  start_date        date not null,
  end_date          date not null,
  status            text not null default 'active' check (status in ('draft','active','ended')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.plan_budgets (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.participant_plans on delete cascade,
  category_no int not null references public.support_categories(category_no),
  allocated   numeric(12,2) not null default 0 check (allocated >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (plan_id, category_no)
);

create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients on delete cascade,
  plan_id          uuid references public.participant_plans on delete set null,
  category_no      int references public.support_categories(category_no),
  shift_id         uuid references public.shifts on delete set null,
  caregiver_id     uuid references public.caregivers on delete set null,
  kind             text not null check (kind in ('transport_km','activity_cost','consumables','purchase','other')),
  description      text not null,
  incurred_on      date not null default current_date,
  amount           numeric(10,2) not null check (amount >= 0),
  reimburse_worker boolean not null default false,
  receipt_url      text,
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by       uuid references auth.users on delete set null,
  created_at       timestamptz not null default now()
);

create table public.budget_adjustments (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.participant_plans on delete cascade,
  category_no int references public.support_categories(category_no),
  amount      numeric(12,2) not null,
  reason      text not null,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

-- Money is derived, never stored twice: approved shifts are "spent", booked ones "committed".
create view public.budget_ledger with (security_invoker = true) as
select ss.id as source_id, 'shift_segment'::text as source_table, ss.shift_id, ss.client_id, si.support_category as category_no,
       pp.id as plan_id,
       case when s.approved_at is not null then 'spent' else 'committed' end as state,
       ss.bill_amount as amount, ss.seg_start::date as occurred_on
from public.shift_segments ss
join public.shifts s on s.id = ss.shift_id and not s.deleted and s.status <> 'Cancelled'
join public.support_items si on si.item_number = ss.item_number
join public.participant_plans pp on pp.client_id = ss.client_id and pp.status = 'active'
  and ss.seg_start::date between pp.start_date and pp.end_date
union all
select e.id, 'expense', e.shift_id, e.client_id, e.category_no, e.plan_id,
       case when e.status = 'approved' then 'spent' else 'committed' end, e.amount, e.incurred_on
from public.expenses e where e.status <> 'rejected' and e.plan_id is not null
union all
select ba.id, 'budget_adjustment', null, null, ba.category_no, ba.plan_id, 'spent', ba.amount, ba.created_at::date
from public.budget_adjustments ba;

create view public.budget_summary with (security_invoker = true) as
select pb.plan_id, pb.category_no, sc.name, sc.budget_group, pb.allocated,
       coalesce(sum(l.amount) filter (where l.state = 'spent'), 0)     as spent,
       coalesce(sum(l.amount) filter (where l.state = 'committed'), 0) as committed,
       pb.allocated - coalesce(sum(l.amount), 0)                       as remaining,
       case when pb.allocated > 0 then round(coalesce(sum(l.amount), 0) / pb.allocated * 100, 2) else 0 end as percent_used
from public.plan_budgets pb
join public.support_categories sc on sc.category_no = pb.category_no
left join public.budget_ledger l on l.plan_id = pb.plan_id and l.category_no = pb.category_no
group by pb.plan_id, pb.category_no, sc.name, sc.budget_group, pb.allocated;

-- ---------------------------------------------------------------------------
-- Misc operational tables
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null,
  message     text not null,
  type        text not null default 'system',
  data        jsonb not null default '{}'::jsonb,
  read        boolean not null default false,
  "timestamp" timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, "timestamp" desc);

create table public.wall_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   text not null,
  author_name text not null,
  content     text not null check (length(trim(content)) > 0),
  priority    text not null default 'normal',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.time_off_requests (
  id           uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers on delete cascade,
  start_date   date not null,
  end_date     date not null,
  reason       text,
  status       text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  requested_at timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid references auth.users on delete set null,
  check (end_date >= start_date)
);

create table public.care_plans (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients on delete cascade,
  title       text not null,
  description text,
  goals       jsonb not null default '[]'::jsonb,
  tasks       jsonb not null default '[]'::jsonb,
  start_date  date not null,
  end_date    date,
  status      text not null default 'Active',
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  modified_by uuid references auth.users on delete set null,
  modified_at timestamptz
);

create table public.mileage (
  id            uuid primary key default gen_random_uuid(),
  caregiver_id  uuid not null references public.caregivers on delete cascade,
  client_id     uuid references public.clients on delete set null,
  shift_id      uuid references public.shifts on delete set null,
  distance      numeric(10,2) not null check (distance >= 0),
  unit          text not null default 'km',
  date          date not null,
  purpose       text,
  vehicle_type  text,
  created_at    timestamptz not null default now(),
  modified_at   timestamptz
);

-- Notify a worker when they are put on a shift or their shift is rejected.
create or replace function public.trg_notify_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; s public.shifts%rowtype;
begin
  select user_id into uid from public.caregivers where id = new.caregiver_id;
  if uid is null then return null; end if;
  select * into s from public.shifts where id = new.shift_id;
  insert into public.notifications (user_id, title, message, type, data)
  values (uid, 'New shift',
          'You have a shift on ' || to_char(s.start_time at time zone public.org_tz(), 'Dy DD Mon HH24:MI'),
          'shift', jsonb_build_object('shift_id', new.shift_id));
  return null;
end $$;
create trigger shift_workers_notify after insert on public.shift_workers
  for each row execute function public.trg_notify_assignment();

create or replace function public.trg_notify_rejection()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status = 'rejected' and old.approval_status is distinct from 'rejected' then
    insert into public.notifications (user_id, title, message, type, data)
    select c.user_id, 'Shift needs attention', coalesce(new.reject_reason, 'Please review this shift.'), 'approval',
           jsonb_build_object('shift_id', new.id)
    from public.shift_workers sw join public.caregivers c on c.id = sw.caregiver_id
    where sw.shift_id = new.id and c.user_id is not null;
  end if;
  return null;
end $$;
create trigger shifts_notify_rejection after update of approval_status on public.shifts
  for each row execute function public.trg_notify_rejection();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.support_categories  enable row level security;
alter table public.participant_plans   enable row level security;
alter table public.plan_budgets        enable row level security;
alter table public.expenses            enable row level security;
alter table public.budget_adjustments  enable row level security;
alter table public.notifications       enable row level security;
alter table public.wall_posts          enable row level security;
alter table public.time_off_requests   enable row level security;
alter table public.care_plans          enable row level security;
alter table public.mileage             enable row level security;

create policy support_categories_read on public.support_categories for select to authenticated using (true);
create policy support_categories_write on public.support_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy participant_plans_office on public.participant_plans for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy plan_budgets_office on public.plan_budgets for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy budget_adjustments_office on public.budget_adjustments for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy expenses_read on public.expenses for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_office() or (caregiver_id = public.current_caregiver_id() and status = 'pending'
              and public.can_see_client(client_id)));
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy expenses_delete on public.expenses for delete to authenticated using (public.is_office());

create policy notifications_own on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_office_insert on public.notifications for insert to authenticated
  with check (public.is_office());

create policy wall_posts_read on public.wall_posts for select to authenticated using (true);
create policy wall_posts_write on public.wall_posts for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy time_off_read on public.time_off_requests for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy time_off_insert on public.time_off_requests for insert to authenticated
  with check (caregiver_id = public.current_caregiver_id() and status = 'Pending');
create policy time_off_office on public.time_off_requests for update to authenticated
  using (public.is_office()) with check (public.is_office());

create policy care_plans_read on public.care_plans for select to authenticated using (public.can_see_client(client_id));
create policy care_plans_write on public.care_plans for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy mileage_read on public.mileage for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy mileage_insert on public.mileage for insert to authenticated
  with check (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy mileage_update on public.mileage for update to authenticated
  using (public.is_office()) with check (public.is_office());

-- ---------------------------------------------------------------------------
-- Storage. Buckets: branding (logo), avatars, onboarding (worker documents),
-- incident-photos, documents (office only). Private buckets use {user id}/... paths.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public) values
    ('branding', 'branding', true), ('avatars', 'avatars', true),
    ('onboarding', 'onboarding', false), ('incident-photos', 'incident-photos', false),
    ('documents', 'documents', false)
  on conflict (id) do update set public = excluded.public;

  execute $p$create policy branding_read on storage.objects for select using (bucket_id = 'branding')$p$;
  execute $p$create policy branding_write on storage.objects for all to authenticated
             using (bucket_id = 'branding' and public.is_admin()) with check (bucket_id = 'branding' and public.is_admin())$p$;
  execute $p$create policy avatars_read on storage.objects for select using (bucket_id = 'avatars')$p$;
  execute $p$create policy avatars_write on storage.objects for all to authenticated
             using (bucket_id = 'avatars' and (public.is_office() or (storage.foldername(name))[1] = auth.uid()::text))
             with check (bucket_id = 'avatars' and (public.is_office() or (storage.foldername(name))[1] = auth.uid()::text))$p$;
  execute $p$create policy private_buckets_owner on storage.objects for all to authenticated
             using (bucket_id in ('onboarding','incident-photos') and (public.is_office() or (storage.foldername(name))[1] = auth.uid()::text))
             with check (bucket_id in ('onboarding','incident-photos') and (public.is_office() or (storage.foldername(name))[1] = auth.uid()::text))$p$;
  execute $p$create policy documents_office on storage.objects for all to authenticated
             using (bucket_id = 'documents' and public.is_office()) with check (bucket_id = 'documents' and public.is_office())$p$;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['shifts','shift_workers','shift_clients','shift_notes','incidents','notifications',
                           'chat_messages','chat_members','chat_channels','wall_posts','timesheets','invoices',
                           'onboarding_tasks','locations','time_off_requests']
  loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing is callable anonymously. RPCs enforce their own role checks.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant  execute on functions to authenticated, service_role;
grant select on public.organisation_public to anon;
