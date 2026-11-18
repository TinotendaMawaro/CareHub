-- Ranked staff suggestions for a shift, used wherever the office assigns someone.
-- Excludes anyone double-booked, on approved leave that day, already on the shift, or whose
-- account is inactive. Ranks the clients' standing teams first, then familiarity with the
-- clients, then fairness (fewer hours already this week).
create or replace function public.suggest_staff(p_shift uuid, p_limit int default 10)
returns table (
  caregiver_id uuid,
  name text,
  avatar_url text,
  on_team boolean,
  past_shifts int,
  hours_this_week numeric,
  score numeric,
  reasons text[]
)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.shifts%rowtype;
  v_tz text := public.org_tz();
  v_day date;
  v_week_start timestamptz;
begin
  perform public.require_office();
  select * into s from public.shifts where id = p_shift;
  if not found then raise exception 'not_found: shift does not exist'; end if;
  v_day := (s.start_time at time zone v_tz)::date;
  v_week_start := (date_trunc('week', (s.start_time at time zone v_tz)::timestamp)) at time zone v_tz;

  return query
  with shift_clients_ as (
    select sc.client_id, trim(coalesce(cl.first_name, '') || ' ' || coalesce(cl.last_name, '')) as client_name
    from public.shift_clients sc join public.clients cl on cl.id = sc.client_id
    where sc.shift_id = p_shift
  ),
  pool as (
    select c.id, c.name, p.avatar_url
    from public.caregivers c
    left join public.profiles p on p.id = c.user_id
    where coalesce(p.active, true)
      and c.contract_status = 'Active'
      and not exists (select 1 from public.shift_workers sw where sw.shift_id = p_shift and sw.caregiver_id = c.id)
      and public.worker_clash(c.id, s.start_time, s.end_time, p_shift) is null
      and not exists (select 1 from public.time_off_requests t
                      where t.caregiver_id = c.id and t.status = 'Approved' and v_day between t.start_date and t.end_date)
  ),
  facts as (
    select
      pool.id, pool.name, pool.avatar_url,
      (select string_agg(sc.client_name, ', ')
         from public.client_caregivers cc join shift_clients_ sc on sc.client_id = cc.client_id
        where cc.caregiver_id = pool.id and cc.unassigned_at is null) as team_of,
      (select count(distinct sh.id)::int
         from public.shift_workers sw
         join public.shifts sh on sh.id = sw.shift_id
         join public.shift_clients sc2 on sc2.shift_id = sh.id
        where sw.caregiver_id = pool.id and sc2.client_id in (select client_id from shift_clients_)
          and not sh.deleted and sh.status = 'Completed') as past,
      coalesce((select round(sum(extract(epoch from (sh.end_time - sh.start_time)) / 3600.0)::numeric, 1)
         from public.shift_workers sw join public.shifts sh on sh.id = sw.shift_id
        where sw.caregiver_id = pool.id and not sh.deleted and sh.status <> 'Cancelled'
          and sh.start_time >= v_week_start and sh.start_time < v_week_start + interval '7 days'), 0) as hours
    from pool
  )
  select
    f.id, f.name, f.avatar_url,
    f.team_of is not null,
    f.past,
    f.hours,
    round((case when f.team_of is not null then 100 else 0 end) + least(f.past, 10) * 3 - least(f.hours, 40) * 0.5, 1),
    array_remove(array[
      case when f.team_of is not null then 'On ' || f.team_of || '''s team' end,
      case when f.past > 0 then 'Worked with this client ' || f.past || case when f.past = 1 then ' time' else ' times' end end,
      f.hours || ' h rostered this week'
    ], null)
  from facts f
  order by 7 desc, f.name
  limit greatest(1, least(p_limit, 50));
end $$;

revoke all on function public.suggest_staff(uuid, int) from public, anon;
grant execute on function public.suggest_staff(uuid, int) to authenticated;
