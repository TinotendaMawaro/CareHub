-- Friendlier validation in create_shifts: reject null or unknown participant / worker ids with a clear
-- message instead of surfacing a raw constraint error. Everything else is unchanged from migration 4.

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
  if exists (select 1 from unnest(clients) c where c is null) or exists (select 1 from unnest(workers) x where x is null) then
    raise exception 'invalid: a participant or worker id is empty';
  end if;
  if (select count(*) from public.clients pc where pc.id = any (clients)) <> cardinality(array(select distinct unnest(clients))) then
    raise exception 'invalid: one of the participants does not exist';
  end if;
  if (select count(*) from public.caregivers pw where pw.id = any (workers)) <> cardinality(array(select distinct unnest(workers))) then
    raise exception 'invalid: one of the support workers does not exist';
  end if;
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

-- Re-assert the function privileges for the replaced function (create or replace keeps them, but be explicit).
revoke execute on function public.create_shifts(jsonb) from public, anon;
grant  execute on function public.create_shifts(jsonb) to authenticated, service_role;
