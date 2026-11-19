-- Scheduler upgrades: colour-coded shift types, shift bonus, planned breaks, drop-off address,
-- shift tasks (optionally mandatory), two-way cancellation with an NDIS reason, rebooking,
-- and organisation settings for the time-picker step and colour tags.

-- ---------------------------------------------------------------------------
-- Organisation settings
-- ---------------------------------------------------------------------------
alter table public.organisation
  add column if not exists minute_interval int not null default 15 check (minute_interval in (1, 5, 15)),
  add column if not exists show_type_tags boolean not null default true;

-- ---------------------------------------------------------------------------
-- Shift types
-- ---------------------------------------------------------------------------
create table if not exists public.shift_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 40),
  colour      text not null default '#0EA5E9' check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  is_default  boolean not null default false,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists shift_types_name_idx on public.shift_types (lower(name)) where active;
create unique index if not exists shift_types_one_default on public.shift_types (is_default) where is_default;

alter table public.shift_types enable row level security;
drop policy if exists shift_types_read on public.shift_types;
create policy shift_types_read on public.shift_types for select to authenticated using (true);
drop policy if exists shift_types_write on public.shift_types;
create policy shift_types_write on public.shift_types for all to authenticated
  using (public.is_office()) with check (public.is_office());

insert into public.shift_types (name, colour, is_default, sort)
select * from (values
  ('Standard',          '#0EA5E9', true,  0),
  ('Personal care',     '#EC4899', false, 1),
  ('Community access',  '#10B981', false, 2),
  ('Domestic assistance','#F59E0B', false, 3),
  ('Sleepover',         '#8B5CF6', false, 4)
) v(name, colour, is_default, sort)
where not exists (select 1 from public.shift_types);

-- ---------------------------------------------------------------------------
-- Shift columns
-- ---------------------------------------------------------------------------
alter table public.shifts
  add column if not exists shift_type_id uuid references public.shift_types on delete set null,
  add column if not exists bonus_amount numeric(8,2) not null default 0 check (bonus_amount >= 0),
  add column if not exists planned_break_minutes int not null default 0 check (planned_break_minutes between 0 and 720),
  add column if not exists break_paid boolean not null default false,
  add column if not exists address text,
  add column if not exists dropoff_address text,
  add column if not exists cancelled_by text check (cancelled_by in ('client', 'provider')),
  add column if not exists cancel_ndis_reason text check (cancel_ndis_reason in ('health', 'family', 'transport', 'other'));

-- ---------------------------------------------------------------------------
-- Shift tasks
-- ---------------------------------------------------------------------------
create table if not exists public.shift_tasks (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references public.shifts on delete cascade,
  label       text not null check (length(trim(label)) between 1 and 200),
  mandatory   boolean not null default false,
  sort        int not null default 0,
  done_at     timestamptz,
  done_by     uuid references public.caregivers on delete set null,
  created_at  timestamptz not null default now(),
  unique (shift_id, label)
);
create index if not exists shift_tasks_shift_idx on public.shift_tasks (shift_id, sort);

alter table public.shift_tasks enable row level security;
drop policy if exists shift_tasks_read on public.shift_tasks;
create policy shift_tasks_read on public.shift_tasks for select to authenticated
  using (public.is_office() or public.is_worker_on(shift_id));
drop policy if exists shift_tasks_write on public.shift_tasks;
create policy shift_tasks_write on public.shift_tasks for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- Workers tick tasks off from the app while they are on the shift.
create or replace function public.complete_shift_task(p_task uuid, p_done boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare t public.shift_tasks%rowtype; cg uuid := public.current_caregiver_id(); s public.shifts%rowtype;
begin
  select * into t from public.shift_tasks where id = p_task for update;
  if not found then raise exception 'not_found: that task no longer exists'; end if;
  select * into s from public.shifts where id = t.shift_id;
  if not public.is_office() then
    if cg is null or not exists (select 1 from public.shift_workers w where w.shift_id = t.shift_id and w.caregiver_id = cg) then
      raise exception 'not_assigned: you are not assigned to this shift' using errcode = '42501';
    end if;
    if not exists (select 1 from public.shift_workers w where w.shift_id = t.shift_id and w.caregiver_id = cg and w.clock_in_time is not null) then
      raise exception 'not_started: start the shift before ticking off tasks';
    end if;
  end if;
  if s.approved_at is not null then raise exception 'shift_locked: this shift is approved'; end if;
  update public.shift_tasks
     set done_at = case when p_done then coalesce(done_at, now()) end,
         done_by = case when p_done then coalesce(done_by, cg) end
   where id = p_task;
end $$;

-- ---------------------------------------------------------------------------
-- Edit the extra shift details (one or many shifts, e.g. a whole new series).
--   p: { shift_type_id, bonus_amount, planned_break_minutes, break_paid, address, dropoff_address,
--        notes, tasks: [{label, mandatory}] }   Only keys present are changed.
-- ---------------------------------------------------------------------------
create or replace function public.set_shift_details(p_ids uuid[], p jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int; sid uuid; t jsonb; i int;
begin
  perform public.require_office();
  if p ? 'bonus_amount' and coalesce(nullif(p->>'bonus_amount','')::numeric, 0) < 0 then
    raise exception 'invalid: the bonus cannot be negative';
  end if;
  if p ? 'planned_break_minutes' and coalesce(nullif(p->>'planned_break_minutes','')::int, 0) not between 0 and 720 then
    raise exception 'invalid: breaks must be between 0 and 720 minutes';
  end if;

  with u as (
    update public.shifts s set
      shift_type_id = case when p ? 'shift_type_id' then nullif(p->>'shift_type_id','')::uuid else s.shift_type_id end,
      bonus_amount = case when p ? 'bonus_amount' then coalesce(nullif(p->>'bonus_amount','')::numeric, 0) else s.bonus_amount end,
      planned_break_minutes = case when p ? 'planned_break_minutes' then coalesce(nullif(p->>'planned_break_minutes','')::int, 0) else s.planned_break_minutes end,
      break_paid = case when p ? 'break_paid' then coalesce((p->>'break_paid')::boolean, false) else s.break_paid end,
      address = case when p ? 'address' then nullif(trim(p->>'address'), '') else s.address end,
      dropoff_address = case when p ? 'dropoff_address' then nullif(trim(p->>'dropoff_address'), '') else s.dropoff_address end,
      notes = case when p ? 'notes' then nullif(p->>'notes', '') else s.notes end
     where s.id = any (p_ids) and not s.deleted and s.approved_at is null
    returning s.id)
  select count(*) into n from u;

  if p ? 'tasks' and jsonb_typeof(p->'tasks') = 'array' then
    foreach sid in array p_ids loop
      continue when not exists (select 1 from public.shifts where id = sid and not deleted and approved_at is null);
      delete from public.shift_tasks st
       where st.shift_id = sid
         and not exists (select 1 from jsonb_array_elements(p->'tasks') e where trim(e->>'label') = st.label);
      i := 0;
      for t in select * from jsonb_array_elements(p->'tasks') loop
        continue when coalesce(trim(t->>'label'), '') = '';
        insert into public.shift_tasks (shift_id, label, mandatory, sort)
        values (sid, trim(t->>'label'), coalesce((t->>'mandatory')::boolean, false), i)
        on conflict (shift_id, label) do update set mandatory = excluded.mandatory, sort = excluded.sort;
        i := i + 1;
      end loop;
    end loop;
  end if;

  if n > 0 then
    perform public.log_activity(case when cardinality(p_ids) = 1 then p_ids[1] end, 'shift_details_updated', null,
      jsonb_build_object('count', n, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p) k)));
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Cancel: by the client (billed, staff paid) or by us (no charge, no pay).
-- ---------------------------------------------------------------------------
drop function if exists public.cancel_shifts(uuid[], text, boolean);
create or replace function public.cancel_shifts(p_ids uuid[], p_reason text default null, p_pay boolean default false,
                                                p_by text default null, p_ndis_reason text default null,
                                                p_notify boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_by text := coalesce(p_by, case when p_pay then 'client' else 'provider' end);
begin
  perform public.require_office();
  if v_by not in ('client', 'provider') then raise exception 'invalid: cancelled by must be client or provider'; end if;
  if p_ndis_reason is not null and p_ndis_reason not in ('health', 'family', 'transport', 'other') then
    raise exception 'invalid: unknown NDIS cancellation reason';
  end if;
  with c as (
    update public.shifts set status = 'Cancelled', cancel_reason = nullif(trim(p_reason), ''),
           cancel_pay = (v_by = 'client'), cancelled_by = v_by, cancel_ndis_reason = p_ndis_reason, cancelled_at = now()
     where id = any (p_ids) and not deleted and approved_at is null and status <> 'Completed'
       and not exists (select 1 from public.shift_workers w where w.shift_id = shifts.id and w.clock_in_time is not null)
    returning id, start_time)
  , logged as (
    insert into public.activity_log (shift_id, action, reason, user_id, meta)
    select id, 'shift_cancelled', nullif(trim(p_reason), ''), auth.uid(),
           jsonb_build_object('by', v_by, 'ndis_reason', p_ndis_reason) from c
    returning 1)
  , notified as (
    insert into public.notifications (user_id, title, message, type, data)
    select cg.user_id, 'Shift cancelled',
           'Your shift on ' || to_char(c.start_time at time zone public.org_tz(), 'Dy DD Mon, HH24:MI') || ' was cancelled'
             || coalesce(': ' || nullif(trim(p_reason), ''), '.'),
           'shift_cancelled', jsonb_build_object('shift_id', c.id)
      from c join public.shift_workers w on w.shift_id = c.id
             join public.caregivers cg on cg.id = w.caregiver_id
     where p_notify and cg.user_id is not null
    returning 1)
  -- Data-changing CTEs always run, whether or not the final select reads them.
  select count(*) into n from c;
  return n;
end $$;

-- Undo a cancellation. Blocked once the shift is approved or invoiced.
create or replace function public.rebook_shift(p_shift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shifts%rowtype;
begin
  perform public.require_office();
  select * into s from public.shifts where id = p_shift for update;
  if not found or s.deleted then raise exception 'not_found: that shift no longer exists'; end if;
  if s.status <> 'Cancelled' then raise exception 'invalid: only a cancelled shift can be rebooked'; end if;
  if s.approved_at is not null then raise exception 'shift_locked: remove the approval before rebooking'; end if;
  if exists (select 1 from public.shift_segments g where g.shift_id = p_shift and g.invoice_line_id is not null) then
    raise exception 'invoiced: this shift has been invoiced. Void the invoice first.';
  end if;
  update public.shifts set status = 'Scheduled', cancel_reason = null, cancel_pay = false, cancelled_by = null,
         cancel_ndis_reason = null, cancelled_at = null
   where id = p_shift;
  perform public.log_activity(p_shift, 'shift_rebooked', null, jsonb_build_object('was', s.cancelled_by, 'reason', s.cancel_reason));
  perform public.sync_shift_statuses();
end $$;

-- ---------------------------------------------------------------------------
-- End shift: a drop-off address means the shift finishes somewhere else, so the
-- end-of-shift location check is skipped; mandatory tasks must be ticked off.
-- ---------------------------------------------------------------------------
create or replace function public.end_shift(p_shift uuid, p_lat double precision default null,
                                            p_lng double precision default null, p_break_minutes int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cg uuid := public.current_caregiver_id();
  s public.shifts%rowtype; w public.shift_workers%rowtype; o public.organisation%rowtype;
  tgt record; dist double precision; missing text; hrs numeric;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  select * into s from public.shifts where id = p_shift;
  select * into w from public.shift_workers where shift_id = p_shift and caregiver_id = cg for update;
  if not found then raise exception 'not_assigned: you are not assigned to this shift'; end if;
  if w.clock_in_time is null then raise exception 'not_started: start the shift before ending it'; end if;
  if w.clock_out_time is not null then raise exception 'already_ended: you have already ended this shift'; end if;
  if coalesce(p_break_minutes, 0) < 0 then raise exception 'invalid: break minutes cannot be negative'; end if;
  select * into o from public.organisation limit 1;

  select * into tgt from public.shift_geofence_target(p_shift);
  if tgt.lat is not null and p_lat is not null and p_lng is not null then
    dist := public.haversine_m(p_lat, p_lng, tgt.lat, tgt.lng);
  end if;
  if o.enforce_geofence_on_end and coalesce(s.geofence_required, o.default_geofence_required)
     and s.dropoff_address is null then
    if dist is null then raise exception 'location_required: turn on location services to end this shift'; end if;
    if dist > tgt.radius_m then
      raise exception 'outside_geofence: you are % m from % (must be within % m)', round(dist), tgt.label, tgt.radius_m;
    end if;
  end if;

  select string_agg(t.label, ', ' order by t.sort) into missing
    from public.shift_tasks t where t.shift_id = p_shift and t.mandatory and t.done_at is null;
  if missing is not null then
    raise exception 'tasks_required: tick off the required tasks first: %', missing;
  end if;

  if o.require_note_on_end then
    select string_agg(c.first_name || ' ' || c.last_name, ', ') into missing
      from public.shift_clients sc join public.clients c on c.id = sc.client_id
     where sc.shift_id = p_shift
       and not exists (select 1 from public.shift_notes n
                       where n.shift_id = p_shift and n.client_id = sc.client_id and n.caregiver_id = cg);
    if missing is not null then
      raise exception 'notes_required: write a shift note for % before ending the shift', missing;
    end if;
  end if;

  if now() - w.clock_in_time < make_interval(mins => coalesce(p_break_minutes, 0)) then
    raise exception 'invalid: break is longer than the time worked';
  end if;

  update public.shift_workers set clock_out_time = now(), clock_out_lat = p_lat, clock_out_lng = p_lng,
         clock_out_distance_m = round(dist)::int, break_minutes = coalesce(p_break_minutes, 0)
   where shift_id = p_shift and caregiver_id = cg
   returning hours_worked into hrs;

  update public.caregivers set current_shift_id = null, availability = 'Available'
   where id = cg and current_shift_id = p_shift;
  return jsonb_build_object('clock_out_time', now(), 'hours_worked', hrs);
end $$;

grant execute on function public.complete_shift_task(uuid, boolean) to authenticated;
grant execute on function public.set_shift_details(uuid[], jsonb) to authenticated;
grant execute on function public.cancel_shifts(uuid[], text, boolean, text, text, boolean) to authenticated;
grant execute on function public.rebook_shift(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.shift_tasks;
exception when others then null; end $$;
