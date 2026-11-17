-- CareHub: Payroll settings, pay periods and timesheets
-- Run after pricing/scheduling Phase 0

create table if not exists public.settings_payroll (
  id                   uuid primary key default gen_random_uuid(),
  fortnight_anchor     date not null,
  timezone             text not null default 'Australia/Sydney',
  variance_flag_minutes int not null default 15,
  ordinary_hours_flag  numeric(6,2) not null default 76,
  cancellation_billable_percent numeric(6,2) not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id)
);

insert into public.settings_payroll (fortnight_anchor) values (date_trunc('week', now())::date)
on conflict (id) do nothing;

create table if not exists public.pay_periods (
  id           uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end   date not null,
  status       text not null default 'open' check (status in ('open','closed','paid')),
  created_at   timestamptz not null default now(),
  unique (period_start)
);

create table if not exists public.timesheets (
  id            uuid primary key default gen_random_uuid(),
  pay_period_id uuid not null references public.pay_periods(id) on delete cascade,
  caregiver_id  uuid not null references public.caregivers(id) on delete cascade,
  status        text not null default 'draft' check (status in ('draft','submitted','approved','rejected','exported','paid')),
  submitted_at  timestamptz,
  approved_at   timestamptz,
  approved_by   uuid references auth.users(id) on delete set null,
  reject_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (pay_period_id, caregiver_id)
);

create table if not exists public.timesheet_adjustments (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.timesheets(id) on delete cascade,
  shift_id     uuid references public.shifts(id) on delete set null,
  kind         text not null check (kind in ('unpaid_break','travel_time','allowance','correction')),
  hours        numeric(6,2) not null default 0,
  amount       numeric(10,2) not null default 0,
  reason       text not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create or replace function public.period_for(anchor date, dt date)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'start', anchor + ((date_part('doy', dt)::int - 1) / 14) * 14 * interval '1 day',
    'end',   anchor + ((date_part('doy', dt)::int - 1) / 14 + 1) * 14 * interval '1 day' - interval '1 day'
  );
$$;

create or replace function public.period_for(dt date)
returns jsonb language sql stable as $$
  declare a date;
  begin
    select fortnight_anchor into a from public.settings_payroll limit 1;
    return public.period_for(coalesce(a, date_trunc('week', now())::date), dt);
  end;
$$;

create or replace function public.ensure_pay_periods()
returns void language plpgsql as $$
declare
  a date;
  p record;
  start_d date;
  end_d date;
begin
  select fortnight_anchor into a from public.settings_payroll limit 1;
  if a is null then a := date_trunc('week', now())::date; end if;

  for start_d in select generate_series(date_trunc('week', now())::date, start_d + interval '1 year', interval '14 day')::date loop
    end_d := start_d + interval '13 day';
    insert into public.pay_periods (period_start, period_end)
    values (start_d, end_d)
    on conflict (period_start) do nothing;
  end loop;
end;
$$;

-- Auto-create timesheets for active workers for open pay periods
create or replace function public.ensure_timesheets_for_period(p_period_id uuid)
returns void language plpgsql as $$
declare
  p record;
begin
  for p in select c.id as caregiver_id from public.caregivers c where coalesce(c.contract_status, 'Active') = 'Active' loop
    insert into public.timesheets (pay_period_id, caregiver_id)
    values (p_period_id, p.caregiver_id)
    on conflict (pay_period_id, caregiver_id) do nothing;
  end loop;
end;
$$;

-- Views
create or replace view public.timesheet_lines as
with selected_period as (
  select pp.id, pp.period_start, pp.period_end
  from public.pay_periods pp
  where pp.status = 'open'
  limit 1
)
select
  ts.id as timesheet_id,
  ss.shift_id,
  ss.seg_start,
  ss.seg_end,
  ss.item_number,
  ss.units,
  ss.bill_rate,
  ss.pay_rate,
  ss.bill_amount,
  ss.pay_amount
from public.timesheets ts
join selected_period sp on sp.id = ts.pay_period_id
join public.shifts s on s.caregiver_id = ts.caregiver_id
join public.shift_segments ss on ss.shift_id = s.id
where ts.pay_period_id = sp.id
  and ss.seg_start >= sp.period_start
  and ss.seg_end <= sp.period_end + interval '1 day'
  and s.deleted = false;

create or replace view public.timesheet_totals as
select
  ts.id as timesheet_id,
  ts.caregiver_id,
  ts.pay_period_id,
  ts.status,
  count(distinct tl.shift_id) filter (where s.status = 'Completed') as completed_shifts,
  count(distinct tl.shift_id) filter (where s.status = 'In Progress') as in_progress_shifts,
  count(distinct tl.shift_id) filter (where s.status in ('Scheduled','Late','No Show')) as pending_shifts,
  coalesce(sum(tl.pay_amount) filter (where s.status = 'Completed'), 0) as gross_pay_segments,
  coalesce(sum(ta.amount), 0) as adjustments,
  coalesce(sum(tl.pay_amount) filter (where s.status = 'Completed'), 0) + coalesce(sum(ta.amount), 0) as total_gross
from public.timesheets ts
left join public.timesheet_lines tl on tl.timesheet_id = ts.id
left join public.shifts s on s.id = tl.shift_id
left join public.timesheet_adjustments ta on ta.timesheet_id = ts.id
group by ts.id, ts.caregiver_id, ts.pay_period_id, ts.status;

-- RLS
alter table if exists public.settings_payroll enable row level security;
alter table if exists public.pay_periods enable row level security;
alter table if exists public.timesheets enable row level security;
alter table if exists public.timesheet_adjustments enable row level security;

create policy settings_payroll_admin on public.settings_payroll for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_payroll_read on public.settings_payroll for select to authenticated using (true);

create policy pay_periods_read on public.pay_periods for select to authenticated using (true);
create policy pay_periods_admin on public.pay_periods for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy timesheets_read on public.timesheets for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid());
create policy timesheets_admin on public.timesheets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy timesheets_worker_update on public.timesheets for update to authenticated
  using (caregiver_id = auth.uid() and status in ('draft','rejected'))
  with check (caregiver_id = auth.uid());

create policy timesheet_adjustments_admin on public.timesheet_adjustments for all to authenticated using (public.is_admin()) with check (public.is_admin());
