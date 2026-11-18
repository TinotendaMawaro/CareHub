-- Change a shift's scheduled times (and, for a single shift, its date).
-- p_start / p_end are local "HH:MM" in the organisation's timezone; an end earlier than or
-- equal to the start means the shift finishes the next day (overnight / sleepover).
-- Series scopes keep each shift's own date and apply the new times to every shift in scope.
-- Skips shifts that have started, been approved, cancelled or deleted, and any change that
-- would double-book an assigned worker. Repricing happens through the existing trigger.
create or replace function public.reschedule_shift(
  p_shift uuid, p_start text, p_end text, p_scope text default 'this', p_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.shifts%rowtype;
  v_tz text := public.org_tz();
  v_start_t time;
  v_end_t time;
  v_day date;
  v_new_start timestamptz;
  v_new_end timestamptz;
  w record;
  updated int := 0;
  skipped jsonb := '[]'::jsonb;
  v_reason text;
begin
  perform public.require_office();
  begin
    v_start_t := p_start::time;
    v_end_t := p_end::time;
  exception when others then
    raise exception 'bad_time: use HH:MM for start and end times';
  end;
  if p_date is not null and p_scope <> 'this' then
    raise exception 'bad_scope: a new date can only be set for a single shift';
  end if;

  for r in select * from public.shifts_in_scope(p_shift, p_scope) loop
    v_reason := null;
    if r.deleted or r.status = 'Cancelled' then v_reason := 'cancelled';
    elsif r.approved_at is not null then v_reason := 'approved';
    elsif exists (select 1 from public.shift_workers sw where sw.shift_id = r.id and sw.clock_in_time is not null) then v_reason := 'started';
    end if;

    if v_reason is null then
      v_day := coalesce(p_date, (r.start_time at time zone v_tz)::date);
      v_new_start := (v_day + v_start_t) at time zone v_tz;
      v_new_end := ((v_day + (case when v_end_t <= v_start_t then 1 else 0 end)) + v_end_t) at time zone v_tz;
      if v_new_end - v_new_start > interval '24 hours' then
        v_reason := 'too_long';
      elsif not r.allow_overlap then
        for w in select sw.caregiver_id from public.shift_workers sw where sw.shift_id = r.id loop
          if public.worker_clash(w.caregiver_id, v_new_start, v_new_end, r.id) is not null then
            v_reason := 'worker_clash';
            exit;
          end if;
        end loop;
      end if;
    end if;

    if v_reason is not null then
      skipped := skipped || jsonb_build_object('shift_id', r.id, 'date', r.date, 'reason', v_reason);
      continue;
    end if;

    if v_new_start is distinct from r.start_time or v_new_end is distinct from r.end_time then
      update public.shifts set start_time = v_new_start, end_time = v_new_end where id = r.id;
      perform public.log_activity(r.id, 'rescheduled', null, jsonb_build_object(
        'from_start', r.start_time, 'from_end', r.end_time, 'to_start', v_new_start, 'to_end', v_new_end));
      updated := updated + 1;
    end if;
  end loop;

  if updated = 0 and p_scope = 'this' and jsonb_array_length(skipped) > 0 then
    raise exception '%: %', skipped->0->>'reason',
      case skipped->0->>'reason'
        when 'worker_clash' then 'an assigned staff member already has a shift at that time'
        when 'started' then 'this shift has started; correct the recorded times instead'
        when 'approved' then 'this shift is approved. Remove the approval to edit it'
        when 'too_long' then 'a shift cannot be longer than 24 hours'
        else 'this shift is cancelled' end;
  end if;
  return jsonb_build_object('updated', updated, 'skipped', skipped);
end $$;

revoke all on function public.reschedule_shift(uuid, text, text, text, date) from public, anon;
grant execute on function public.reschedule_shift(uuid, text, text, text, date) to authenticated;
