-- CareHub: shift lock/approval, paid cancellations, scheduled_start/end migration
-- Run after budgets/plans migration

alter table public.shifts
  add column if not exists cancel_pay boolean not null default false,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

create index if not exists shifts_start_idx on public.shifts (scheduled_start);
create index if not exists shifts_unassigned_idx on public.shifts (scheduled_start) where caregiver_id is null;

create or replace function public.lock_approved_shift()
returns trigger language plpgsql as $$
begin
  if old.approved_at is not null and new.approved_at is not null and (
       new.scheduled_start is distinct from old.scheduled_start or
       new.scheduled_end   is distinct from old.scheduled_end   or
       new.caregiver_id    is distinct from old.caregiver_id    or
       new.cost_code_id    is distinct from old.cost_code_id    or
       new.actual_start    is distinct from old.actual_start    or
       new.actual_end      is distinct from old.actual_end) then
    raise exception 'Shift is approved and locked. Remove approval first.';
  end if;
  return new;
end $$;

drop trigger if exists shifts_lock_approved on public.shifts;
create trigger shifts_lock_approved before update on public.shifts
  for each row execute function public.lock_approved_shift();

-- Helper: ensure pay periods exist for the next year
create or replace function public.ensure_pay_periods_scheduled()
returns void language plpgsql as $$
declare
  a date;
  d date;
begin
  select fortnight_anchor into a from public.settings_payroll limit 1;
  if a is null then return; end if;

  for d in select generate_series(date_trunc('week', now())::date, a + interval '1 year', interval '14 day')::date loop
    insert into public.pay_periods (period_start, period_end)
    values (d, d + interval '13 day')
    on conflict (period_start) do nothing;
  end loop;
end;
$$;
