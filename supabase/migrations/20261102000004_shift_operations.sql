-- CareHub baseline 4/7: shift operations as RPCs. Business rules live here so the
-- web dashboard and the mobile app cannot drift apart.
-- Errors are raised as 'code: human message' so clients can show the message and branch on the code.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.require_office()
returns void language plpgsql stable as $$
begin
  if not public.is_office() then
    raise exception 'forbidden: office access required' using errcode = '42501';
  end if;
end $$;

create or replace function public.check_ratio(p_ratio text, p_clients int, p_workers int)
returns void language plpgsql immutable as $$
declare n int := split_part(p_ratio, ':', 2)::int;
begin
  if p_clients > n * greatest(p_workers, 1) then
    raise exception 'ratio_exceeded: % participants need a ratio wider than %. Add a worker or change the ratio.',
      p_clients, p_ratio using errcode = 'P0001';
  end if;
end $$;

create or replace function public.worker_clash(p_caregiver uuid, p_start timestamptz, p_end timestamptz, p_ignore uuid default null)
returns timestamptz language sql stable security definer set search_path = public as $$
  select s.start_time from public.shift_workers sw join public.shifts s on s.id = sw.shift_id
  where sw.caregiver_id = p_caregiver and not s.deleted and s.status <> 'Cancelled'
    and not s.allow_overlap
    and s.start_time < p_end and s.end_time > p_start
    and (p_ignore is null or s.id <> p_ignore)
  order by s.start_time limit 1
$$;

create or replace function public.shifts_in_scope(p_shift uuid, p_scope text)
returns setof public.shifts language plpgsql stable security definer set search_path = public as $$
declare base public.shifts%rowtype;
begin
  select * into base from public.shifts where id = p_shift;
  if not found then raise exception 'not_found: shift does not exist'; end if;
  if p_scope not in ('this','following','all') then
    raise exception 'bad_scope: scope must be this, following or all';
  end if;
  if p_scope = 'this' or base.series_id is null then
    return query select * from public.shifts where id = p_shift;
  elsif p_scope = 'following' then
    return query select * from public.shifts
      where series_id = base.series_id and start_time >= base.start_time and not deleted order by start_time;
  else
    return query select * from public.shifts
      where series_id = base.series_id and not deleted order by start_time;
  end if;
end $$;

create or replace function public.log_activity(p_shift uuid, p_action text, p_reason text default null, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (shift_id, action, reason, user_id, meta)
  values (p_shift, p_action, p_reason, auth.uid(), p_meta)
$$;

-- ---------------------------------------------------------------------------
-- create_shifts: many shifts, many blocks per day (morning/afternoon/sleepover, each with
-- its own cost code), many participants, many workers, optional recurrence.
--
-- p = {
--   client_ids: [uuid], worker_ids: [uuid], site_id?, ratio?: "1:2", required_workers?,
--   geofence_required?: bool|null, notes?, allow_overlap?: bool, skip_conflicts?: bool,
--   service_type?, support_family?, item_number?, is_sleepover?,       -- defaults for every block
--   date: "YYYY-MM-DD",
--   blocks: [{start_time:"06:00", end_time:"14:00", support_family?, item_number?, is_sleepover?, notes?}],
--   repeat?: {freq: none|daily|weekly, interval?: 1, weekdays?: [1..7 ISO Mon=1], until?: date, count?: int}
-- }
-- Each block becomes its own series so "split / delete following" acts on the same time slot.
-- ---------------------------------------------------------------------------
create or replace function public.create_shifts(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tz       text := public.org_tz();
  clients  uuid[]; workers uuid[];
  blocks   jsonb := p->'blocks';
  rep      jsonb := coalesce(p->'repeat', '{"freq":"none"}'::jsonb);
  freq     text := coalesce(rep->>'freq', 'none');
  intv     int  := greatest(coalesce(nullif(rep->>'interval','')::int, 1), 1);
  wdays    int[];
  d0       date := (p->>'date')::date;
  d_until  date;
  v_count  int  := nullif(rep->>'count','')::int;
  v_ratio  text := coalesce(p->>'ratio', '1:1');
  v_req    int;
  v_skip   boolean := coalesce((p->>'skip_conflicts')::boolean, false);
  v_ovl    boolean := coalesce((p->>'allow_overlap')::boolean, false);
  d        date; occ int := 0;
  bi       int; b jsonb;
  series   uuid[] := '{}';  cur_series uuid;
  ids      uuid[] := '{}';  skipped jsonb := '[]'::jsonb;
  s_ts     timestamptz; e_ts timestamptz; s_l timestamp; e_l timestamp;
  w        uuid; clash timestamptz; new_id uuid; wname text;
  fam      text; itm text; slp boolean;
  matches  boolean; dates date[] := '{}'; skip_occ boolean;
begin
  perform public.require_office();

  clients := array(select jsonb_array_elements_text(coalesce(p->'client_ids', '[]'))::uuid);
  workers := array(select jsonb_array_elements_text(coalesce(p->'worker_ids', '[]'))::uuid);
  if cardinality(clients) = 0 then raise exception 'invalid: choose at least one participant'; end if;
  if blocks is null or jsonb_typeof(blocks) <> 'array' or jsonb_array_length(blocks) = 0 then
    raise exception 'invalid: add at least one shift block (e.g. morning 06:00-14:00)';
  end if;
  if d0 is null then raise exception 'invalid: start date is required'; end if;
  if freq not in ('none','daily','weekly') then raise exception 'invalid: repeat must be none, daily or weekly'; end if;
  perform public.check_ratio(v_ratio, cardinality(clients), cardinality(workers));
  v_req := greatest(coalesce(nullif(p->>'required_workers','')::int, cardinality(workers)), 1);

  wdays := case when rep ? 'weekdays'
                then array(select jsonb_array_elements_text(rep->'weekdays')::int)
                else array[extract(isodow from d0)::int] end;
  d_until := case when freq = 'none' then d0 else coalesce(nullif(rep->>'until','')::date, d0 + 90) end;
  if d_until < d0 then raise exception 'invalid: repeat end date is before the start date'; end if;
  if d_until - d0 > 366 then raise exception 'invalid: repeats can span at most 366 days'; end if;

  for d in select g::date from generate_series(d0, d_until, interval '1 day') g loop
    matches := case freq
      when 'none'   then d = d0
      when 'daily'  then (d - d0) % intv = 0
      else extract(isodow from d)::int = any (wdays)
           and ((d - extract(isodow from d)::int) - (d0 - extract(isodow from d0)::int)) / 7 % intv = 0
    end;
    if matches then
      occ := occ + 1;
      exit when v_count is not null and occ > v_count;
      dates := dates || d;
    end if;
  end loop;
  if cardinality(dates) = 0 then raise exception 'invalid: the repeat rule produces no dates'; end if;

  for bi in 0 .. jsonb_array_length(blocks) - 1 loop
    b := blocks -> bi;
    if (b->>'start_time') is null or (b->>'end_time') is null then
      raise exception 'invalid: every block needs a start_time and end_time';
    end if;
    cur_series := null;
    if cardinality(dates) > 1 then
      insert into public.shift_series (rule, created_by) values (rep, auth.uid()) returning id into cur_series;
      series := series || cur_series;
    end if;
    fam := coalesce(b->>'support_family', p->>'support_family');
    itm := coalesce(b->>'item_number', p->>'item_number');
    slp := coalesce((b->>'is_sleepover')::boolean, (p->>'is_sleepover')::boolean, false);

    foreach d in array dates loop
      s_l := d + (b->>'start_time')::time;
      e_l := d + (b->>'end_time')::time;
      if e_l <= s_l then e_l := e_l + interval '1 day'; end if;
      s_ts := s_l at time zone tz;  e_ts := e_l at time zone tz;
      skip_occ := false;

      if not v_ovl then
        foreach w in array workers loop
          clash := public.worker_clash(w, s_ts, e_ts);
          if clash is not null then
            select name into wname from public.caregivers where id = w;
            if v_skip then
              skipped := skipped || jsonb_build_object('date', d, 'block', bi, 'worker', wname, 'reason', 'worker_clash');
              skip_occ := true;
              exit;
            end if;
            raise exception 'worker_clash: % already has a shift overlapping % (%)', wname, d,
              to_char(clash at time zone tz, 'HH24:MI');
          end if;
        end loop;
      end if;

      continue when skip_occ;

      insert into public.shifts (series_id, client_id, caregiver_id, site_id, service_type, start_time, end_time,
                                 support_family, item_number, is_sleepover, ratio, required_workers,
                                 geofence_required, notes, allow_overlap)
      values (cur_series, clients[1], workers[1], nullif(p->>'site_id','')::uuid,
              coalesce(p->>'service_type', 'ndis'), s_ts, e_ts, fam, itm, slp, v_ratio, v_req,
              (p->>'geofence_required')::boolean, coalesce(b->>'notes', p->>'notes'), v_ovl)
      returning id into new_id;

      insert into public.shift_clients (shift_id, client_id) select new_id, unnest(clients) on conflict do nothing;
      insert into public.shift_workers (shift_id, caregiver_id, role)
        select new_id, w2, case when w2 = workers[1] then 'primary' else 'support' end from unnest(workers) w2
        on conflict do nothing;
      ids := ids || new_id;
    end loop;
  end loop;

  perform public.log_activity(null, 'shifts_created', null,
    jsonb_build_object('count', cardinality(ids), 'clients', cardinality(clients), 'workers', cardinality(workers)));
  return jsonb_build_object('shift_ids', to_jsonb(ids), 'series_ids', to_jsonb(series), 'skipped', skipped);
end $$;

-- ---------------------------------------------------------------------------
-- Splitting
-- ---------------------------------------------------------------------------
create or replace function public.split_shift(
  p_shift uuid, p_at timestamptz,
  p_item_number text default null, p_support_family text default null, p_is_sleepover boolean default null,
  p_new_series uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.shifts%rowtype; new_id uuid;
begin
  perform public.require_office();
  select * into s from public.shifts where id = p_shift for update;
  if not found then raise exception 'not_found: shift does not exist'; end if;
  if s.deleted or s.status not in ('Scheduled','Late') or s.approved_at is not null
     or exists (select 1 from public.shift_workers where shift_id = p_shift and clock_in_time is not null) then
    raise exception 'not_splittable: only shifts that have not started and are not approved can be split';
  end if;
  if p_at <= s.start_time or p_at >= s.end_time then
    raise exception 'not_splittable: split time must fall inside the shift';
  end if;

  insert into public.shifts (series_id, split_from, client_id, caregiver_id, site_id, service_type, start_time, end_time,
                             support_family, item_number, is_sleepover, ratio, required_workers,
                             geofence_required, notes, allow_overlap, shift_publish_state)
  values (p_new_series, s.id, s.client_id, s.caregiver_id, s.site_id, s.service_type, p_at, s.end_time,
          coalesce(p_support_family, s.support_family),
          case when p_item_number is not null then p_item_number
               when p_support_family is not null or p_is_sleepover is not null then null
               else s.item_number end,
          coalesce(p_is_sleepover, s.is_sleepover), s.ratio, s.required_workers,
          s.geofence_required, s.notes, s.allow_overlap, s.shift_publish_state)
  returning id into new_id;

  insert into public.shift_clients (shift_id, client_id)
    select new_id, client_id from public.shift_clients where shift_id = p_shift on conflict do nothing;
  insert into public.shift_workers (shift_id, caregiver_id, role)
    select new_id, caregiver_id, role from public.shift_workers where shift_id = p_shift on conflict do nothing;

  update public.shifts set end_time = p_at where id = p_shift;
  perform public.log_activity(p_shift, 'shift_split', null, jsonb_build_object('new_shift', new_id, 'at', p_at));
  return new_id;
end $$;

-- Split every shift in scope at the same local time of day. Second halves form a new series.
create or replace function public.split_series(
  p_shift uuid, p_time time, p_scope text default 'following',
  p_item_number text default null, p_support_family text default null, p_is_sleepover boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  tz text := public.org_tz(); r public.shifts%rowtype; cut timestamptz; l_start timestamp;
  new_series uuid; done uuid[] := '{}'; skipped jsonb := '[]'::jsonb; n uuid;
begin
  perform public.require_office();
  if p_scope <> 'this' then
    insert into public.shift_series (rule, created_by) values ('{"from":"split"}', auth.uid()) returning id into new_series;
  end if;
  for r in select * from public.shifts_in_scope(p_shift, p_scope) loop
    l_start := r.start_time at time zone tz;
    cut := (l_start::date + p_time) at time zone tz;
    if cut <= r.start_time then cut := ((l_start::date + 1) + p_time) at time zone tz; end if;
    begin
      n := public.split_shift(r.id, cut, p_item_number, p_support_family, p_is_sleepover, new_series);
      done := done || n;
    exception when others then
      skipped := skipped || jsonb_build_object('shift_id', r.id, 'date', r.date,
                   'reason', split_part(sqlerrm, ':', 1));
    end;
  end loop;
  if cardinality(done) = 0 and new_series is not null then
    delete from public.shift_series where id = new_series;
  end if;
  return jsonb_build_object('new_shift_ids', to_jsonb(done), 'skipped', skipped);
end $$;

-- ---------------------------------------------------------------------------
-- Staffing: more workers on a participant, more participants on a worker
-- ---------------------------------------------------------------------------
create or replace function public.add_shift_worker(p_shift uuid, p_caregiver uuid, p_scope text default 'this',
                                                   p_role text default 'support')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.shifts%rowtype; added int := 0; skipped jsonb := '[]'::jsonb;
begin
  perform public.require_office();
  for r in select * from public.shifts_in_scope(p_shift, p_scope) loop
    if r.status = 'Cancelled' or r.approved_at is not null or r.deleted then
      skipped := skipped || jsonb_build_object('shift_id', r.id, 'reason', 'not_editable'); continue;
    end if;
    if exists (select 1 from public.shift_workers where shift_id = r.id and caregiver_id = p_caregiver) then
      skipped := skipped || jsonb_build_object('shift_id', r.id, 'reason', 'already_assigned'); continue;
    end if;
    if public.worker_clash(p_caregiver, r.start_time, r.end_time, r.id) is not null then
      skipped := skipped || jsonb_build_object('shift_id', r.id, 'date', r.date, 'reason', 'worker_clash'); continue;
    end if;
    insert into public.shift_workers (shift_id, caregiver_id, role) values (r.id, p_caregiver, p_role);
    update public.shifts set required_workers = greatest(required_workers,
      (select count(*) from public.shift_workers where shift_id = r.id)) where id = r.id;
    added := added + 1;
  end loop;
  if added = 0 and p_scope = 'this' and jsonb_array_length(skipped) > 0 then
    raise exception '%: could not add worker (%)', skipped->0->>'reason', skipped->0->>'reason';
  end if;
  return jsonb_build_object('added', added, 'skipped', skipped);
end $$;

create or replace function public.remove_shift_worker(p_shift uuid, p_caregiver uuid, p_scope text default 'this')
returns int language plpgsql security definer set search_path = public as $$
declare r public.shifts%rowtype; n int := 0;
begin
  perform public.require_office();
  for r in select * from public.shifts_in_scope(p_shift, p_scope) loop
    delete from public.shift_workers
     where shift_id = r.id and caregiver_id = p_caregiver and clock_in_time is null and approved_at is null;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.add_shift_client(p_shift uuid, p_client uuid, p_scope text default 'this')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.shifts%rowtype; added int := 0; skipped jsonb := '[]'::jsonb;
begin
  perform public.require_office();
  for r in select * from public.shifts_in_scope(p_shift, p_scope) loop
    if r.approved_at is not null or r.deleted or r.status = 'Cancelled' then
      skipped := skipped || jsonb_build_object('shift_id', r.id, 'reason', 'not_editable'); continue;
    end if;
    if exists (select 1 from public.shift_clients where shift_id = r.id and client_id = p_client) then continue; end if;
    begin
      perform public.check_ratio(r.ratio, (select count(*)::int from public.shift_clients where shift_id = r.id) + 1,
                                 (select count(*)::int from public.shift_workers where shift_id = r.id));
    exception when others then
      skipped := skipped || jsonb_build_object('shift_id', r.id, 'reason', 'ratio_exceeded'); continue;
    end;
    insert into public.shift_clients (shift_id, client_id) values (r.id, p_client);
    added := added + 1;
  end loop;
  if added = 0 and p_scope = 'this' and jsonb_array_length(skipped) > 0 then
    raise exception 'ratio_exceeded: this shift is already at its participant limit (%). Widen the ratio or add a worker.',
      (select ratio from public.shifts where id = p_shift);
  end if;
  return jsonb_build_object('added', added, 'skipped', skipped);
end $$;

create or replace function public.remove_shift_client(p_shift uuid, p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shifts%rowtype;
begin
  perform public.require_office();
  select * into s from public.shifts where id = p_shift;
  if (select count(*) from public.shift_clients where shift_id = p_shift) <= 1 then
    raise exception 'invalid: a shift needs at least one participant';
  end if;
  if s.client_id = p_client then
    update public.shifts set client_id = (select client_id from public.shift_clients
                                          where shift_id = p_shift and client_id <> p_client limit 1)
     where id = p_shift;  -- sync trigger removes the old primary row
  else
    delete from public.shift_clients where shift_id = p_shift and client_id = p_client;
  end if;
end $$;

create or replace function public.cancel_shifts(p_ids uuid[], p_reason text default null, p_pay boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_office();
  with c as (
    update public.shifts set status = 'Cancelled', cancel_reason = p_reason, cancel_pay = p_pay, cancelled_at = now()
     where id = any (p_ids) and not deleted and approved_at is null and status <> 'Completed'
       and not exists (select 1 from public.shift_workers w where w.shift_id = shifts.id and w.clock_in_time is not null)
    returning id)
  select count(*) into n from c;
  return n;
end $$;

create or replace function public.delete_shifts(p_shift uuid, p_scope text default 'this')
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_office();
  with d as (
    update public.shifts s set deleted = true
     where s.id in (select id from public.shifts_in_scope(p_shift, p_scope))
       and s.approved_at is null
       and not exists (select 1 from public.shift_workers w where w.shift_id = s.id and w.clock_in_time is not null)
    returning 1)
  select count(*) into n from d;
  return n;
end $$;

-- Offer an unassigned shift to the team; a worker can accept it from the mobile app.
create or replace function public.publish_shift(p_shift uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_office();
  update public.shifts set shift_publish_state = 'offered'
   where id = p_shift and caregiver_id is null and status = 'Scheduled' and not deleted;
  if not found then raise exception 'invalid: only an unassigned, scheduled shift can be offered'; end if;
  insert into public.shift_offers (shift_id, offered_by) values (p_shift, auth.uid());
end $$;

create or replace function public.accept_offered_shift(p_shift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cg uuid := public.current_caregiver_id(); s public.shifts%rowtype;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  select * into s from public.shifts where id = p_shift for update;
  if not found or s.deleted or s.shift_publish_state is distinct from 'offered' or s.caregiver_id is not null then
    raise exception 'unavailable: this shift is no longer available';
  end if;
  if public.worker_clash(cg, s.start_time, s.end_time, s.id) is not null then
    raise exception 'worker_clash: you already have a shift that overlaps this one';
  end if;
  insert into public.shift_workers (shift_id, caregiver_id, role) values (p_shift, cg, 'primary');
  update public.shifts set shift_publish_state = 'accepted' where id = p_shift;
  update public.shift_offers set state = 'accepted', responded_at = now(), caregiver_id = cg
   where shift_id = p_shift and state = 'offered';
end $$;

-- ---------------------------------------------------------------------------
-- Attendance: start / end a shift (workers). Optional geofence at the participant's address.
-- ---------------------------------------------------------------------------
create or replace function public.shift_geofence_target(p_shift uuid)
returns table (lat double precision, lng double precision, radius_m int, label text)
language sql stable security definer set search_path = public as $$
  with s as (select * from public.shifts where id = p_shift),
  org as (select default_geofence_radius_m r from public.organisation limit 1),
  cands as (
    select 1 as pri, false as secondary, st.lat, st.lng, coalesce(st.geofence_radius_m, org.r) as radius_m,
           st.name as label
      from s join public.sites st on st.id = s.site_id, org
     where st.lat is not null and st.lng is not null
    union all
    select 2, (c.id <> s.client_id), c.lat, c.lng, coalesce(c.geofence_radius_m, org.r),
           c.first_name || ' ' || c.last_name
      from s join public.shift_clients sc on sc.shift_id = s.id
             join public.clients c on c.id = sc.client_id, org
     where c.lat is not null and c.lng is not null
  )
  select cands.lat, cands.lng, cands.radius_m, cands.label from cands order by pri, secondary, label limit 1
$$;

create or replace function public.start_shift(p_shift uuid, p_lat double precision default null,
                                              p_lng double precision default null, p_accuracy numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cg uuid := public.current_caregiver_id();
  s public.shifts%rowtype; w public.shift_workers%rowtype; o public.organisation%rowtype;
  tgt record; v_req boolean; dist double precision;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  select * into s from public.shifts where id = p_shift;
  select * into w from public.shift_workers where shift_id = p_shift and caregiver_id = cg for update;
  if not found or s.deleted then raise exception 'not_assigned: you are not assigned to this shift'; end if;
  if s.status = 'Cancelled' then raise exception 'cancelled: this shift was cancelled'; end if;
  if w.clock_in_time is not null then raise exception 'already_started: you have already started this shift'; end if;
  select * into o from public.organisation limit 1;

  if now() < s.start_time - make_interval(mins => o.clock_in_early_minutes) then
    raise exception 'too_early: you can start this shift from % (% minutes before it begins)',
      to_char((s.start_time - make_interval(mins => o.clock_in_early_minutes)) at time zone o.timezone, 'HH24:MI'),
      o.clock_in_early_minutes;
  end if;
  if now() > s.end_time then
    raise exception 'too_late: this shift has already ended. Ask the office to record your time.';
  end if;

  v_req := coalesce(s.geofence_required, o.default_geofence_required);
  select * into tgt from public.shift_geofence_target(p_shift);
  if tgt.lat is not null and p_lat is not null and p_lng is not null then
    dist := public.haversine_m(p_lat, p_lng, tgt.lat, tgt.lng);
  end if;
  if v_req then
    if tgt.lat is null then
      raise exception 'no_client_location: the participant has no address coordinates saved. Ask the office to fix this or turn off location checks for this shift.';
    end if;
    if p_lat is null or p_lng is null then
      raise exception 'location_required: turn on location services so we can confirm you are at %', tgt.label;
    end if;
    if dist > tgt.radius_m then
      raise exception 'outside_geofence: you are % m from % (must be within % m)',
        round(dist), tgt.label, tgt.radius_m;
    end if;
  end if;

  update public.shift_workers set clock_in_time = now(), clock_in_lat = p_lat, clock_in_lng = p_lng,
         clock_in_distance_m = round(dist)::int
   where shift_id = p_shift and caregiver_id = cg;
  if p_lat is not null then
    insert into public.locations (caregiver_id, lat, lng, accuracy) values (cg, p_lat, p_lng, p_accuracy);
  end if;
  update public.caregivers set current_shift_id = p_shift, availability = 'On Shift',
         evv_compliance = case when v_req and dist is not null then 'On Location' else evv_compliance end
   where id = cg;
  return jsonb_build_object('clock_in_time', now(), 'distance_m', round(dist), 'geofence_checked', v_req);
end $$;

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
  if o.enforce_geofence_on_end and coalesce(s.geofence_required, o.default_geofence_required) then
    if dist is null then raise exception 'location_required: turn on location services to end this shift'; end if;
    if dist > tgt.radius_m then
      raise exception 'outside_geofence: you are % m from % (must be within % m)', round(dist), tgt.label, tgt.radius_m;
    end if;
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

-- ---------------------------------------------------------------------------
-- Approval
-- ---------------------------------------------------------------------------
-- Pay for one worker on one shift, by time band, scaled to the approved hours.
create or replace function public.compute_worker_pay(p_shift uuid, p_caregiver uuid, p_hours numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  s public.shifts%rowtype; w public.shift_workers%rowtype; lvl text; st text;
  v_start timestamptz; v_end timestamptz; seg record; rate public.pay_rates; total numeric := 0; raw numeric := 0;
begin
  select * into s from public.shifts where id = p_shift;
  select * into w from public.shift_workers where shift_id = p_shift and caregiver_id = p_caregiver;
  select worker_level into lvl from public.caregivers where id = p_caregiver;
  select coalesce(cl.state, (select state from public.organisation limit 1)) into st
    from public.clients cl where cl.id = s.client_id;

  if s.is_sleepover then
    rate := public.pay_rate_for(lvl, 'any', s.date);
    return coalesce(rate.each_rate, rate.hourly_rate * p_hours, 0);
  end if;

  v_start := coalesce(w.clock_in_time, s.start_time);
  v_end   := coalesce(w.clock_out_time, s.end_time);
  for seg in select * from public.band_segments(v_start, v_end, st) loop
    rate := public.pay_rate_for(lvl, seg.band, (seg.seg_start at time zone public.org_tz())::date);
    total := total + extract(epoch from (seg.seg_end - seg.seg_start)) / 3600.0 * coalesce(rate.hourly_rate, 0);
    raw   := raw   + extract(epoch from (seg.seg_end - seg.seg_start)) / 3600.0;
  end loop;
  if raw > 0 and p_hours is not null then total := total * (p_hours / raw); end if;
  return round(total, 2);
end $$;

-- Office corrects a worker's recorded times before approving (forgot to clock out, etc.).
create or replace function public.adjust_shift_worker(p_shift uuid, p_caregiver uuid,
                                                      p_in timestamptz, p_out timestamptz, p_break int default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_office();
  if public.shift_is_locked(p_shift) then
    raise exception 'shift_locked: this shift is approved. Remove the approval to edit it.';
  end if;
  update public.shift_workers set clock_in_time = p_in, clock_out_time = p_out,
         break_minutes = coalesce(p_break, 0), edited_by = auth.uid()
   where shift_id = p_shift and caregiver_id = p_caregiver;
  if not found then raise exception 'not_found: that worker is not on this shift'; end if;
  perform public.log_activity(p_shift, 'times_adjusted', null,
    jsonb_build_object('caregiver', p_caregiver, 'in', p_in, 'out', p_out));
end $$;

create or replace function public.approve_shift(p_shift uuid, p_use_scheduled boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shifts%rowtype; w record; hrs numeric; nm text;
begin
  perform public.require_office();
  select * into s from public.shifts where id = p_shift for update;
  if not found or s.deleted then raise exception 'not_found: shift does not exist'; end if;
  if s.approved_at is not null then return; end if;
  if s.status = 'Cancelled' and not s.cancel_pay then
    raise exception 'invalid: an unpaid cancelled shift cannot be approved';
  end if;
  if s.status in ('Scheduled','Late','In Progress') and not (p_use_scheduled or s.cancel_pay) then
    raise exception 'not_complete: this shift has not been completed (status %). Approve using scheduled times to override.', s.status;
  end if;

  for w in select sw.*, c.name from public.shift_workers sw join public.caregivers c on c.id = sw.caregiver_id
           where sw.shift_id = p_shift loop
    if w.clock_in_time is not null and w.clock_out_time is null then
      raise exception 'not_complete: % has not ended the shift. Adjust their times first.', w.name;
    end if;
    if w.clock_in_time is null and not (p_use_scheduled or s.cancel_pay) then
      raise exception 'not_clocked: % never started this shift. Adjust their times or approve using scheduled times.', w.name;
    end if;
    hrs := coalesce(w.hours_worked,
                    round(extract(epoch from (s.end_time - s.start_time)) / 3600.0, 2));
    update public.shift_workers set approved_hours = hrs,
           pay_amount = public.compute_worker_pay(p_shift, w.caregiver_id, hrs), approved_at = now()
     where shift_id = p_shift and caregiver_id = w.caregiver_id;
  end loop;

  update public.shifts set approved_at = now(), approved_by = auth.uid(), approval_status = 'approved', reject_reason = null
   where id = p_shift;
  perform public.log_activity(p_shift, 'shift_approved');
end $$;

create or replace function public.approve_shifts(p_ids uuid[], p_use_scheduled boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i uuid; ok int := 0; failed jsonb := '[]'::jsonb;
begin
  perform public.require_office();
  foreach i in array p_ids loop
    begin
      perform public.approve_shift(i, p_use_scheduled); ok := ok + 1;
    exception when others then
      failed := failed || jsonb_build_object('shift_id', i, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('approved', ok, 'failed', failed);
end $$;

create or replace function public.reject_shift(p_shift uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_office();
  if coalesce(trim(p_reason), '') = '' then raise exception 'invalid: give a reason so the worker knows what to fix'; end if;
  if public.shift_is_locked(p_shift) then raise exception 'shift_locked: remove the approval first'; end if;
  update public.shifts set approval_status = 'rejected', reject_reason = p_reason where id = p_shift;
  perform public.log_activity(p_shift, 'shift_rejected', p_reason);
end $$;

create or replace function public.unapprove_shift(p_shift uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_office();
  if exists (select 1 from public.shift_segments where shift_id = p_shift and invoice_line_id is not null) then
    raise exception 'shift_invoiced: this shift is on an invoice. Void the invoice first.';
  end if;
  if public.shift_in_locked_timesheet(p_shift) then
    raise exception 'timesheet_locked: this shift is on an approved timesheet. Reopen the timesheet first.';
  end if;
  update public.shift_workers set approved_at = null, approved_hours = null, pay_amount = null where shift_id = p_shift;
  update public.shifts set approved_at = null, approved_by = null, approval_status = 'pending' where id = p_shift;
  perform public.log_activity(p_shift, 'shift_unapproved');
end $$;
