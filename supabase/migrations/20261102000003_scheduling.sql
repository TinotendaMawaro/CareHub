-- CareHub baseline 3/7: shifts, participants-per-shift, workers-per-shift,
-- recurrence, splitting, geofenced clock in/out, notes, incidents, approval.
--
-- Model
--   shifts          one block of work (a "morning", an "afternoon", a "sleepover")
--   shift_clients   participants supported in that block (1..N, e.g. 1:4 in a SIL home)
--   shift_workers   support workers on that block (1..N, e.g. 2 workers on one participant)
--   shifts.client_id / caregiver_id are the *primary* participant/worker kept for the
--   existing dashboard screens; the junction tables are the source of truth and a trigger
--   keeps the two in step.

create table public.shift_series (
  id          uuid primary key default gen_random_uuid(),
  rule        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

create table public.shifts (
  id                  uuid primary key default gen_random_uuid(),
  series_id           uuid references public.shift_series on delete set null,
  split_from          uuid references public.shifts on delete set null,
  client_id           uuid not null references public.clients on delete cascade,
  caregiver_id        uuid references public.caregivers on delete set null,
  site_id             uuid references public.sites on delete set null,
  service_type        text not null default 'ndis' check (service_type in ('aged_care','ndis','intercompany','other')),
  date                date not null,
  start_time          timestamptz not null,
  end_time            timestamptz not null,
  support_family      text references public.support_families(family_key) on update cascade,
  item_number         text references public.support_items(item_number) on update cascade,
  is_sleepover        boolean not null default false,
  ratio               text not null default '1:1' check (ratio ~ '^[1-9]:[1-9]$'),
  required_workers    int not null default 1 check (required_workers >= 1),
  geofence_required   boolean,
  status              text not null default 'Scheduled'
                        check (status in ('Scheduled','In Progress','Completed','Late','No Show','Cancelled')),
  shift_publish_state text check (shift_publish_state in ('offered','viewed','accepted','declined')),
  clock_in_time       timestamptz,
  clock_out_time      timestamptz,
  hours_worked        numeric(7,2),
  pricing_warning     text,
  notes               text,
  allow_overlap       boolean not null default false,
  deleted             boolean not null default false,
  cancel_pay          boolean not null default false,
  cancel_reason       text,
  cancelled_at        timestamptz,
  approval_status     text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  approved_at         timestamptz,
  approved_by         uuid references auth.users on delete set null,
  reject_reason       text,
  created_by          uuid references auth.users on delete set null,
  created_at          timestamptz not null default now(),
  modified_by         uuid references auth.users on delete set null,
  modified_at         timestamptz,
  constraint shifts_time_order check (end_time > start_time)
);
create index shifts_start_idx        on public.shifts (start_time) where not deleted;
create index shifts_client_idx       on public.shifts (client_id, start_time);
create index shifts_caregiver_idx    on public.shifts (caregiver_id, start_time) where not deleted;
create index shifts_series_idx       on public.shifts (series_id, start_time);
create index shifts_unassigned_idx   on public.shifts (start_time) where caregiver_id is null and not deleted;
create index shifts_approval_idx     on public.shifts (approval_status) where not deleted;

create table public.shift_clients (
  shift_id   uuid not null references public.shifts on delete cascade,
  client_id  uuid not null references public.clients on delete cascade,
  primary key (shift_id, client_id)
);
create index shift_clients_client_idx on public.shift_clients (client_id);

create table public.shift_workers (
  shift_id        uuid not null references public.shifts on delete cascade,
  caregiver_id    uuid not null references public.caregivers on delete cascade,
  role            text not null default 'support' check (role in ('primary','support','trainee')),
  clock_in_time   timestamptz,
  clock_in_lat    double precision,
  clock_in_lng    double precision,
  clock_in_distance_m   int,
  clock_out_time  timestamptz,
  clock_out_lat   double precision,
  clock_out_lng   double precision,
  clock_out_distance_m  int,
  break_minutes   int not null default 0 check (break_minutes >= 0),
  hours_worked    numeric(7,2),
  edited_by       uuid references auth.users on delete set null,
  approved_hours  numeric(7,2),
  pay_amount      numeric(10,2),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  primary key (shift_id, caregiver_id)
);
create index shift_workers_caregiver_idx on public.shift_workers (caregiver_id, shift_id);

-- Billing lines: one per (shift, participant, time band). Frozen rate at resolve time.
create table public.shift_segments (
  id            uuid primary key default gen_random_uuid(),
  shift_id      uuid not null references public.shifts on delete cascade,
  client_id     uuid not null references public.clients on delete cascade,
  item_number   text not null references public.support_items(item_number) on update cascade,
  band          text,
  seg_start     timestamptz not null,
  seg_end       timestamptz not null,
  units         numeric(8,2) not null,
  bill_rate     numeric(10,2) not null,
  bill_amount   numeric(10,2) generated always as (round(units * bill_rate, 2)) stored,
  invoice_line_id uuid
);
create index shift_segments_shift_idx on public.shift_segments (shift_id);
create index shift_segments_client_idx on public.shift_segments (client_id, seg_start);

create table public.shift_offers (
  id            uuid primary key default gen_random_uuid(),
  shift_id      uuid not null references public.shifts on delete cascade,
  offered_by    uuid references auth.users on delete set null,
  caregiver_id  uuid references public.caregivers on delete cascade,
  state         text not null default 'offered',
  offered_at    timestamptz not null default now(),
  responded_at  timestamptz
);

create table public.activity_log (
  id          bigint generated always as identity primary key,
  shift_id    uuid references public.shifts on delete set null,
  action      text not null,
  reason      text,
  user_id     uuid references auth.users on delete set null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.shift_notes (
  id            uuid primary key default gen_random_uuid(),
  shift_id      uuid references public.shifts on delete cascade,
  client_id     uuid not null references public.clients on delete cascade,
  caregiver_id  uuid not null references public.caregivers on delete cascade,
  note          text not null check (length(trim(note)) > 0),
  category      text not null default 'general'
                  check (category in ('general','medication','mood','meal','activity','health','handover')),
  follow_up     boolean not null default false,
  "timestamp"   timestamptz not null default now(),
  status        text not null default 'Open'
);
create index shift_notes_shift_idx  on public.shift_notes (shift_id);
create index shift_notes_client_idx on public.shift_notes (client_id, "timestamp" desc);

create table public.incidents (
  id               uuid primary key default gen_random_uuid(),
  shift_id         uuid references public.shifts on delete set null,
  client_id        uuid references public.clients on delete set null,
  caregiver_id     uuid not null references public.caregivers on delete cascade,
  date             date not null default current_date,
  time             time,
  description      text not null,
  incident_type    text not null,
  status           text not null default 'Reported'
                     check (status in ('Reported','Resolved','Unresolved','Investigation')),
  actions_taken    text,
  involved_parties text,
  photo_urls       text[] not null default '{}',
  severity         text check (severity in ('Low','Medium','High')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index incidents_date_idx on public.incidents (date desc);

create table public.locations (
  id           bigint generated always as identity primary key,
  caregiver_id uuid not null references public.caregivers on delete cascade,
  lat          double precision not null,
  lng          double precision not null,
  accuracy     numeric,
  "timestamp"  timestamptz not null default now()
);
create index locations_caregiver_ts_idx on public.locations (caregiver_id, "timestamp" desc);

-- ---------------------------------------------------------------------------
-- Visibility helpers (SECURITY DEFINER: avoids RLS recursion between tables)
-- ---------------------------------------------------------------------------
create or replace function public.is_worker_on(p_shift uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shift_workers sw
                 where sw.shift_id = p_shift and sw.caregiver_id = public.current_caregiver_id())
$$;

-- A worker may see participants on their shifts (last 90 days onward) and their standing team.
create or replace function public.can_see_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_office()
      or exists (select 1 from public.shift_clients sc
                 join public.shifts s on s.id = sc.shift_id
                 join public.shift_workers sw on sw.shift_id = s.id
                 where sc.client_id = p_client and not s.deleted
                   and sw.caregiver_id = public.current_caregiver_id()
                   and s.end_time > now() - interval '90 days')
      or exists (select 1 from public.client_caregivers cc
                 where cc.client_id = p_client and cc.unassigned_at is null
                   and cc.caregiver_id = public.current_caregiver_id())
$$;

create or replace function public.shift_is_locked(p_shift uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select approved_at is not null from public.shifts where id = p_shift), false)
$$;

-- ---------------------------------------------------------------------------
-- Segment resolution (billing). Replaces the invalid trigger in the old migration.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_segments(p_shift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s       public.shifts%rowtype;
  c       record;
  seg     record;
  v_item  text;
  v_rate  numeric;
  v_warn  text;
  v_state text;
begin
  select * into s from public.shifts where id = p_shift;
  if not found then return; end if;

  if exists (select 1 from public.shift_segments where shift_id = p_shift and invoice_line_id is not null) then
    raise exception 'shift_invoiced: this shift has already been invoiced and cannot be repriced'
      using errcode = 'P0001';
  end if;
  delete from public.shift_segments where shift_id = p_shift;

  for c in select cl.id, cl.price_region, coalesce(cl.state, (select state from public.organisation limit 1)) as state
           from public.shift_clients sc join public.clients cl on cl.id = sc.client_id
           where sc.shift_id = p_shift loop
    if s.is_sleepover then
      v_item := coalesce(s.item_number, public.pick_item(s.support_family, 'any', s.ratio, true));
      if v_item is null then
        v_warn := coalesce(v_warn || '; ', '') || 'no sleepover price-guide item for ' || coalesce(s.support_family, 'this shift');
        continue;
      end if;
      v_rate := public.item_rate(v_item, c.price_region);
      insert into public.shift_segments (shift_id, client_id, item_number, band, seg_start, seg_end, units, bill_rate)
      values (p_shift, c.id, v_item, 'any', s.start_time, s.end_time, 1, v_rate);
    elsif s.item_number is not null then
      -- An explicit cost code bills the whole shift under that code (no band splitting).
      v_rate := public.item_rate(s.item_number, c.price_region);
      insert into public.shift_segments (shift_id, client_id, item_number, band, seg_start, seg_end, units, bill_rate)
      values (p_shift, c.id, s.item_number, 'fixed', s.start_time, s.end_time,
              round(extract(epoch from (s.end_time - s.start_time)) / 3600.0, 2), v_rate);
    else
      for seg in select * from public.band_segments(s.start_time, s.end_time, c.state) loop
        v_item := coalesce(s.item_number, public.pick_item(s.support_family, seg.band, s.ratio, false));
        if v_item is null then
          v_warn := coalesce(v_warn || '; ', '') || 'no price-guide item for ' || coalesce(s.support_family, 'no family') || ' / ' || seg.band;
          continue;
        end if;
        v_rate := public.item_rate(v_item, c.price_region);
        insert into public.shift_segments (shift_id, client_id, item_number, band, seg_start, seg_end, units, bill_rate)
        values (p_shift, c.id, v_item, seg.band, seg.seg_start, seg.seg_end,
                round(extract(epoch from (seg.seg_end - seg.seg_start)) / 3600.0, 2), v_rate);
      end loop;
    end if;
  end loop;

  if s.item_number is null and s.support_family is null then
    v_warn := 'choose a support family or a cost code to price this shift';
  end if;
  update public.shifts set pricing_warning = v_warn where id = p_shift and pricing_warning is distinct from v_warn;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.trg_shift_before()
returns trigger language plpgsql as $$
begin
  new.date := (new.start_time at time zone public.org_tz())::date;
  if tg_op = 'UPDATE' then
    new.modified_at := now();
    new.modified_by := coalesce(auth.uid(), new.modified_by);
    if old.approved_at is not null and new.approved_at is not null and (
         new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time or
         new.item_number is distinct from old.item_number or new.support_family is distinct from old.support_family or
         new.is_sleepover is distinct from old.is_sleepover or new.client_id is distinct from old.client_id) then
      raise exception 'shift_locked: this shift is approved. Remove the approval to edit it.' using errcode = 'P0001';
    end if;
  else
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end $$;
create trigger shifts_before before insert or update on public.shifts
  for each row execute function public.trg_shift_before();

-- Keep the primary participant/worker columns and the junction tables in step.
create or replace function public.trg_shift_sync_primary()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.shift_clients (shift_id, client_id) values (new.id, new.client_id)
    on conflict do nothing;
  if tg_op = 'UPDATE' and old.client_id is distinct from new.client_id then
    delete from public.shift_clients where shift_id = new.id and client_id = old.client_id;
  end if;

  if new.caregiver_id is not null then
    insert into public.shift_workers (shift_id, caregiver_id, role) values (new.id, new.caregiver_id, 'primary')
      on conflict do nothing;
  end if;
  if tg_op = 'UPDATE' and old.caregiver_id is not null and old.caregiver_id is distinct from new.caregiver_id then
    delete from public.shift_workers
     where shift_id = new.id and caregiver_id = old.caregiver_id and clock_in_time is null;
  end if;
  return null;
end $$;
create trigger shifts_sync_primary after insert or update of client_id, caregiver_id on public.shifts
  for each row execute function public.trg_shift_sync_primary();

create or replace function public.trg_shift_reprice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.resolve_segments(new.id);
  return null;
end $$;
create trigger shifts_reprice after insert or update of support_family, item_number, start_time, end_time, is_sleepover, ratio
  on public.shifts for each row execute function public.trg_shift_reprice();

-- shift_clients changes reprice, and are blocked on approved shifts.
create or replace function public.trg_shift_clients_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_shift uuid := coalesce(new.shift_id, old.shift_id);
begin
  if pg_trigger_depth() = 1 and public.shift_is_locked(v_shift) then
    raise exception 'shift_locked: this shift is approved. Remove the approval to edit it.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shifts where id = v_shift) then
    perform public.resolve_segments(v_shift);
  end if;
  return null;
end $$;
create trigger shift_clients_change after insert or delete on public.shift_clients
  for each row execute function public.trg_shift_clients_change();

-- Worker rows: derive hours, mirror state onto the shift, set primary on first assignment.
create or replace function public.refresh_shift_state(p_shift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record; w record; v_status text;
begin
  select * into s from public.shifts where id = p_shift;
  if not found then return; end if;
  select count(*) as total, count(clock_in_time) as ins, count(clock_out_time) as outs,
         min(clock_in_time) as first_in, max(clock_out_time) as last_out,
         sum(hours_worked) as hrs
    into w from public.shift_workers where shift_id = p_shift;

  v_status := case
    when s.status = 'Cancelled'            then 'Cancelled'
    when w.total > 0 and w.outs = w.total  then 'Completed'
    when w.ins > 0                         then 'In Progress'
    when w.total = 0                       then 'Scheduled'
    when now() >= s.end_time               then 'No Show'
    when now() >= s.start_time             then 'Late'
    else 'Scheduled' end;

  update public.shifts set
      status = v_status,
      clock_in_time = w.first_in,
      clock_out_time = case when w.total > 0 and w.outs = w.total then w.last_out end,
      hours_worked = w.hrs
   where id = p_shift
     and (status, clock_in_time, clock_out_time, hours_worked)
         is distinct from (v_status, w.first_in,
                           case when w.total > 0 and w.outs = w.total then w.last_out end, w.hrs);
end $$;

create or replace function public.trg_shift_workers_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.approved_at is not null and new.approved_at is not null and pg_trigger_depth() = 1 and (
       new.clock_in_time is distinct from old.clock_in_time or new.clock_out_time is distinct from old.clock_out_time
       or new.break_minutes is distinct from old.break_minutes) then
    raise exception 'shift_locked: this shift is approved. Remove the approval to edit it.' using errcode = 'P0001';
  end if;
  if new.clock_in_time is not null and new.clock_out_time is not null then
    if new.clock_out_time <= new.clock_in_time then
      raise exception 'invalid_times: clock out must be after clock in' using errcode = 'P0001';
    end if;
    new.hours_worked := round(greatest(extract(epoch from (new.clock_out_time - new.clock_in_time)) / 3600.0
                                       - new.break_minutes / 60.0, 0), 2);
  else
    new.hours_worked := null;
  end if;
  return new;
end $$;
create trigger shift_workers_before before insert or update on public.shift_workers
  for each row execute function public.trg_shift_workers_before();

create or replace function public.trg_shift_workers_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_shift uuid := coalesce(new.shift_id, old.shift_id);
begin
  if tg_op = 'INSERT' then
    update public.shifts set caregiver_id = new.caregiver_id
     where id = new.shift_id and caregiver_id is null;
  elsif tg_op = 'DELETE' then
    update public.shifts set caregiver_id = (select caregiver_id from public.shift_workers
                                             where shift_id = old.shift_id order by created_at limit 1)
     where id = old.shift_id and caregiver_id = old.caregiver_id;
  end if;
  perform public.refresh_shift_state(v_shift);
  return null;
end $$;
create trigger shift_workers_after after insert or update or delete on public.shift_workers
  for each row execute function public.trg_shift_workers_after();

-- Move Scheduled -> Late -> No Show as time passes. Call from pg_cron or the dashboard.
create or replace function public.sync_shift_statuses()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with upd as (
    update public.shifts s set status = case when now() >= s.end_time then 'No Show' else 'Late' end
     where not s.deleted and s.status in ('Scheduled','Late')
       and exists (select 1 from public.shift_workers w where w.shift_id = s.id)
       and now() >= s.start_time
       and s.status is distinct from case when now() >= s.end_time then 'No Show' else 'Late' end
    returning 1)
  select count(*) into n from upd;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.shift_series  enable row level security;
alter table public.shifts        enable row level security;
alter table public.shift_clients enable row level security;
alter table public.shift_workers enable row level security;
alter table public.shift_segments enable row level security;
alter table public.shift_offers  enable row level security;
alter table public.activity_log  enable row level security;
alter table public.shift_notes   enable row level security;
alter table public.incidents     enable row level security;
alter table public.locations     enable row level security;

create policy clients_read on public.clients for select to authenticated using (public.can_see_client(id));

create policy shift_series_office on public.shift_series for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy shifts_read on public.shifts for select to authenticated
  using (public.is_office() or public.is_worker_on(id)
         or (shift_publish_state = 'offered' and caregiver_id is null and not deleted));
create policy shifts_office_write on public.shifts for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy shift_clients_read on public.shift_clients for select to authenticated
  using (public.is_office() or public.is_worker_on(shift_id));
create policy shift_clients_write on public.shift_clients for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy shift_workers_read on public.shift_workers for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy shift_workers_write on public.shift_workers for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy shift_segments_office on public.shift_segments for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy shift_offers_read on public.shift_offers for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy shift_offers_write on public.shift_offers for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy activity_log_office on public.activity_log for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- Notes: workers write their own notes on their own shifts until the shift is approved.
create policy shift_notes_read on public.shift_notes for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id()
         or (shift_id is not null and public.is_worker_on(shift_id)));
create policy shift_notes_insert on public.shift_notes for insert to authenticated
  with check (public.is_office()
              or (caregiver_id = public.current_caregiver_id() and shift_id is not null
                  and public.is_worker_on(shift_id) and not public.shift_is_locked(shift_id)
                  and exists (select 1 from public.shift_clients sc
                              where sc.shift_id = shift_notes.shift_id and sc.client_id = shift_notes.client_id)));
create policy shift_notes_update on public.shift_notes for update to authenticated
  using (public.is_office() or (caregiver_id = public.current_caregiver_id()
                                and not (shift_id is not null and public.shift_is_locked(shift_id))))
  with check (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy shift_notes_delete on public.shift_notes for delete to authenticated
  using (public.is_office());

create policy incidents_read on public.incidents for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy incidents_insert on public.incidents for insert to authenticated
  with check (public.is_office()
              or (caregiver_id = public.current_caregiver_id()
                  and (shift_id is null or public.is_worker_on(shift_id))));
create policy incidents_update on public.incidents for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy incidents_delete on public.incidents for delete to authenticated
  using (public.is_admin());

create policy locations_read on public.locations for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy locations_insert on public.locations for insert to authenticated
  with check (caregiver_id = public.current_caregiver_id() or public.is_office());

-- Co-workers on my shifts (names only; caregivers table stays private).
create view public.shift_team as
  select sw.shift_id, sw.caregiver_id, c.name, sw.role, sw.clock_in_time, sw.clock_out_time
  from public.shift_workers sw join public.caregivers c on c.id = sw.caregiver_id
  where public.is_office() or public.is_worker_on(sw.shift_id);
