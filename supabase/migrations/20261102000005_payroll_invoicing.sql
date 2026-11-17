-- CareHub baseline 5/7: pay periods, timesheets, invoices, Xero export view.

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------
create table public.settings_payroll (
  id                            boolean primary key default true check (id),
  fortnight_anchor              date not null default date '2026-01-05',
  period_days                   int  not null default 14 check (period_days in (7, 14, 28)),
  timezone                      text not null default 'Australia/Sydney',
  variance_flag_minutes         int  not null default 15,
  ordinary_hours_flag           numeric(6,2) not null default 76,
  cancellation_billable_percent numeric(6,2) not null default 0 check (cancellation_billable_percent between 0 and 100),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
insert into public.settings_payroll default values;

create table public.pay_periods (
  id           uuid primary key default gen_random_uuid(),
  period_start date not null unique,
  period_end   date not null,
  status       text not null default 'open' check (status in ('open','closed','paid')),
  created_at   timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.timesheets (
  id            uuid primary key default gen_random_uuid(),
  pay_period_id uuid not null references public.pay_periods on delete cascade,
  caregiver_id  uuid not null references public.caregivers on delete cascade,
  status        text not null default 'draft'
                  check (status in ('draft','submitted','approved','rejected','exported','paid')),
  submitted_at  timestamptz,
  approved_at   timestamptz,
  approved_by   uuid references auth.users on delete set null,
  reject_reason text,
  exported_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (pay_period_id, caregiver_id)
);

create table public.timesheet_adjustments (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.timesheets on delete cascade,
  shift_id     uuid references public.shifts on delete set null,
  kind         text not null check (kind in ('unpaid_break','travel_time','allowance','correction')),
  hours        numeric(6,2) not null default 0,
  amount       numeric(10,2) not null default 0,
  reason       text not null,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now()
);

-- Generate pay periods covering [p_from, p_to] on the configured cadence.
create or replace function public.ensure_pay_periods(p_from date default current_date - 60,
                                                     p_to date default current_date + 120)
returns int language plpgsql security definer set search_path = public as $$
declare a date; n int; d date; cnt int := 0; first_start date;
begin
  select fortnight_anchor, period_days into a, n from public.settings_payroll;
  first_start := a + floor((p_from - a)::numeric / n)::int * n;
  d := first_start;
  while d <= p_to loop
    insert into public.pay_periods (period_start, period_end) values (d, d + n - 1)
      on conflict (period_start) do nothing;
    if found then cnt := cnt + 1; end if;
    d := d + n;
  end loop;
  return cnt;
end $$;

create or replace function public.ensure_timesheets(p_period uuid)
returns int language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  perform public.require_office();
  with ins as (
    insert into public.timesheets (pay_period_id, caregiver_id)
    select p_period, c.id from public.caregivers c where c.contract_status = 'Active'
    on conflict do nothing returning 1)
  select count(*) into cnt from ins;
  return cnt;
end $$;

-- Per-timesheet roll-up. security_invoker so RLS applies to whoever is querying.
create view public.timesheet_totals with (security_invoker = true) as
select
  ts.id as timesheet_id, ts.caregiver_id, ts.pay_period_id, ts.status,
  coalesce(x.approved_shifts, 0)  as completed_shifts,
  coalesce(x.in_progress, 0)      as in_progress_shifts,
  coalesce(x.pending, 0)          as pending_shifts,
  coalesce(x.approved_hours, 0)   as approved_hours,
  coalesce(x.gross, 0)            as gross_pay_segments,
  coalesce(a.adj, 0)              as adjustments,
  coalesce(x.gross, 0) + coalesce(a.adj, 0) as total_gross
from public.timesheets ts
join public.pay_periods pp on pp.id = ts.pay_period_id
left join lateral (
  select count(*) filter (where s.approved_at is not null)                              as approved_shifts,
         count(*) filter (where s.status = 'In Progress')                               as in_progress,
         count(*) filter (where s.approved_at is null and s.status = 'Completed')       as pending,
         sum(sw.approved_hours) filter (where s.approved_at is not null)                as approved_hours,
         sum(sw.pay_amount)     filter (where s.approved_at is not null)                as gross
  from public.shift_workers sw join public.shifts s on s.id = sw.shift_id
  where sw.caregiver_id = ts.caregiver_id and not s.deleted
    and s.date between pp.period_start and pp.period_end
    and (s.status <> 'Cancelled' or s.cancel_pay)
) x on true
left join lateral (
  select sum(amount) as adj from public.timesheet_adjustments ta where ta.timesheet_id = ts.id
) a on true;

create or replace function public.shift_in_locked_timesheet(p_shift uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shifts s
    join public.shift_workers sw on sw.shift_id = s.id
    join public.timesheets ts on ts.caregiver_id = sw.caregiver_id
    join public.pay_periods pp on pp.id = ts.pay_period_id
    where s.id = p_shift and s.date between pp.period_start and pp.period_end
      and ts.status in ('approved','exported','paid'))
$$;

create or replace function public.submit_timesheet(p_ts uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.timesheets%rowtype;
begin
  select * into t from public.timesheets where id = p_ts for update;
  if not found then raise exception 'not_found: timesheet does not exist'; end if;
  if not (public.is_office() or t.caregiver_id = public.current_caregiver_id()) then
    raise exception 'forbidden: not your timesheet' using errcode = '42501';
  end if;
  if t.status not in ('draft','rejected') then
    raise exception 'invalid: this timesheet is already %', t.status;
  end if;
  update public.timesheets set status = 'submitted', submitted_at = now(), reject_reason = null, updated_at = now()
   where id = p_ts;
end $$;

create or replace function public.approve_timesheet(p_ts uuid, p_approve_shifts boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare t public.timesheets%rowtype; pp public.pay_periods%rowtype; r record; pend int;
begin
  perform public.require_office();
  select * into t from public.timesheets where id = p_ts for update;
  if not found then raise exception 'not_found: timesheet does not exist'; end if;
  if t.status in ('approved','exported','paid') then return; end if;
  select * into pp from public.pay_periods where id = t.pay_period_id;

  if p_approve_shifts then
    for r in select s.id from public.shift_workers sw join public.shifts s on s.id = sw.shift_id
             where sw.caregiver_id = t.caregiver_id and not s.deleted and s.status = 'Completed'
               and s.approved_at is null and s.date between pp.period_start and pp.period_end loop
      perform public.approve_shift(r.id);
    end loop;
  end if;

  select pending_shifts + in_progress_shifts into pend from public.timesheet_totals where timesheet_id = p_ts;
  if pend > 0 then
    raise exception 'pending_shifts: % shift(s) in this period are not approved yet', pend;
  end if;
  update public.timesheets set status = 'approved', approved_at = now(), approved_by = auth.uid(),
         reject_reason = null, updated_at = now() where id = p_ts;
end $$;

create or replace function public.reject_timesheet(p_ts uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_office();
  if coalesce(trim(p_reason), '') = '' then raise exception 'invalid: give a reason so the worker knows what to fix'; end if;
  update public.timesheets set status = 'rejected', reject_reason = p_reason, updated_at = now()
   where id = p_ts and status in ('submitted','approved');
  if not found then raise exception 'invalid: only submitted or approved timesheets can be rejected'; end if;
end $$;

create or replace function public.reopen_timesheet(p_ts uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_office();
  update public.timesheets set status = 'draft', approved_at = null, approved_by = null, updated_at = now()
   where id = p_ts and status = 'approved';
  if not found then raise exception 'invalid: only an approved timesheet (not yet exported) can be reopened'; end if;
end $$;

alter table public.settings_payroll       enable row level security;
alter table public.pay_periods            enable row level security;
alter table public.timesheets             enable row level security;
alter table public.timesheet_adjustments  enable row level security;

create policy settings_payroll_read  on public.settings_payroll for select to authenticated using (public.is_office());
create policy settings_payroll_write on public.settings_payroll for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy pay_periods_read  on public.pay_periods for select to authenticated using (true);
create policy pay_periods_write on public.pay_periods for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy timesheets_read on public.timesheets for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy timesheets_write on public.timesheets for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy timesheet_adjustments_read on public.timesheet_adjustments for select to authenticated
  using (public.is_office() or exists (select 1 from public.timesheets t
         where t.id = timesheet_id and t.caregiver_id = public.current_caregiver_id()));
create policy timesheet_adjustments_write on public.timesheet_adjustments for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- ---------------------------------------------------------------------------
-- Invoicing
-- ---------------------------------------------------------------------------
create sequence public.invoice_number_seq start 1;

create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique,
  client_id    uuid not null references public.clients on delete restrict,
  period_start date not null,
  period_end   date not null,
  issue_date   date not null default current_date,
  due_date     date not null,
  status       text not null default 'draft' check (status in ('draft','approved','sent','paid','void')),
  subtotal     numeric(12,2) not null default 0,
  gst_amount   numeric(12,2) not null default 0,
  total        numeric(12,2) not null default 0,
  reference    text,
  notes        text,
  external_id  text,
  exported_at  timestamptz,
  paid_at      timestamptz,
  voided_at    timestamptz,
  void_reason  text,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now()
);
create index invoices_client_idx on public.invoices (client_id, issue_date desc);

create table public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices on delete cascade,
  shift_id    uuid references public.shifts on delete set null,
  segment_id  uuid,
  item_number text,
  description text not null,
  quantity    numeric(10,2) not null,
  unit_price  numeric(10,2) not null,
  amount      numeric(12,2) not null
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

alter table public.shift_segments
  add constraint shift_segments_invoice_line_fk
  foreign key (invoice_line_id) references public.invoice_lines(id) on delete set null;

create or replace function public.generate_invoices(p_from date, p_to date, p_client_ids uuid[] default null)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  o public.organisation%rowtype; cancel_pct numeric; tz text; c record; inv uuid; ids uuid[] := '{}';
  seg record; line uuid; v_sub numeric; v_gst numeric; amt numeric; price numeric; nm text;
begin
  perform public.require_office();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'invalid: choose a valid date range'; end if;
  select * into o from public.organisation limit 1;
  select cancellation_billable_percent into cancel_pct from public.settings_payroll;
  tz := o.timezone;

  for c in
    select distinct ss.client_id from public.shift_segments ss join public.shifts s on s.id = ss.shift_id
    where ss.invoice_line_id is null and s.approved_at is not null and not s.deleted
      and (s.status <> 'Cancelled' or (s.cancel_pay and cancel_pct > 0))
      and (ss.seg_start at time zone tz)::date between p_from and p_to
      and (p_client_ids is null or ss.client_id = any (p_client_ids))
  loop
    insert into public.invoices (number, client_id, period_start, period_end, due_date, created_by)
    values (o.invoice_prefix || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0'),
            c.client_id, p_from, p_to, current_date + o.invoice_terms_days, auth.uid())
    returning id into inv;

    v_sub := 0;
    for seg in
      select ss.*, s.status, si.name as item_name from public.shift_segments ss
      join public.shifts s on s.id = ss.shift_id join public.support_items si on si.item_number = ss.item_number
      where ss.client_id = c.client_id and ss.invoice_line_id is null and s.approved_at is not null and not s.deleted
        and (s.status <> 'Cancelled' or (s.cancel_pay and cancel_pct > 0))
        and (ss.seg_start at time zone tz)::date between p_from and p_to
      order by ss.seg_start
    loop
      price := case when seg.status = 'Cancelled' then round(seg.bill_rate * cancel_pct / 100, 2) else seg.bill_rate end;
      amt := round(seg.units * price, 2);
      nm := to_char(seg.seg_start at time zone tz, 'DD Mon YYYY HH24:MI') || '-' ||
            to_char(seg.seg_end at time zone tz, 'HH24:MI') || ' ' || seg.item_name ||
            case when seg.status = 'Cancelled' then ' (short-notice cancellation)' else '' end;
      insert into public.invoice_lines (invoice_id, shift_id, segment_id, item_number, description, quantity, unit_price, amount)
      values (inv, seg.shift_id, seg.id, seg.item_number, nm, seg.units, price, amt) returning id into line;
      update public.shift_segments set invoice_line_id = line where id = seg.id;
      v_sub := v_sub + amt;
    end loop;

    v_gst := round(v_sub * o.gst_rate, 2);
    update public.invoices set subtotal = v_sub, gst_amount = v_gst, total = v_sub + v_gst where id = inv;
    ids := ids || inv;
  end loop;
  return ids;
end $$;

create or replace function public.set_invoice_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare i public.invoices%rowtype;
begin
  perform public.require_office();
  select * into i from public.invoices where id = p_id for update;
  if not found then raise exception 'not_found: invoice does not exist'; end if;
  if not ((i.status = 'draft' and p_status in ('approved'))
       or (i.status = 'approved' and p_status in ('sent','draft'))
       or (i.status in ('approved','sent') and p_status = 'paid')
       or (i.status = 'sent' and p_status = 'approved')) then
    raise exception 'invalid: cannot move an invoice from % to %', i.status, p_status;
  end if;
  update public.invoices set status = p_status,
         paid_at = case when p_status = 'paid' then now() else paid_at end where id = p_id;
end $$;

create or replace function public.void_invoice(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare i public.invoices%rowtype;
begin
  perform public.require_office();
  if coalesce(trim(p_reason), '') = '' then raise exception 'invalid: give a reason for voiding'; end if;
  select * into i from public.invoices where id = p_id for update;
  if not found then raise exception 'not_found: invoice does not exist'; end if;
  if i.status = 'void' then return; end if;
  if i.status = 'paid' then raise exception 'invalid: a paid invoice cannot be voided'; end if;
  update public.shift_segments set invoice_line_id = null
   where invoice_line_id in (select id from public.invoice_lines where invoice_id = p_id);
  update public.invoices set status = 'void', voided_at = now(), void_reason = p_reason where id = p_id;
end $$;

create or replace function public.mark_invoices_exported(p_ids uuid[], p_external text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_office();
  with u as (update public.invoices set exported_at = now(), external_id = coalesce(p_external, external_id)
              where id = any (p_ids) and status in ('approved','sent','paid') returning 1)
  select count(*) into n from u;
  return n;
end $$;

-- One row per invoice line in the shape Xero's "Sales invoice import" CSV expects.
create view public.xero_invoice_export with (security_invoker = true) as
select i.id as invoice_id,
       trim(c.first_name || ' ' || c.last_name)                       as contact_name,
       c.email                                                       as email_address,
       i.number                                                      as invoice_number,
       coalesce(i.reference, c.ndis_number)                          as reference,
       i.issue_date                                                  as invoice_date,
       i.due_date                                                    as due_date,
       l.item_number                                                 as inventory_item_code,
       l.description                                                 as description,
       l.quantity                                                    as quantity,
       l.unit_price                                                  as unit_amount,
       (select xero_account_code from public.organisation)           as account_code,
       (select xero_tax_type from public.organisation)               as tax_type,
       (select currency from public.organisation)                    as currency
from public.invoices i
join public.clients c on c.id = i.client_id
join public.invoice_lines l on l.invoice_id = i.id
where i.status in ('approved','sent','paid')
order by i.number, l.description;

alter table public.invoices       enable row level security;
alter table public.invoice_lines  enable row level security;
create policy invoices_office on public.invoices for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy invoice_lines_office on public.invoice_lines for all to authenticated
  using (public.is_office()) with check (public.is_office());
