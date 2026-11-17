-- Correct the shift-status guard: service_role has no auth.uid(), so skip guard
-- when uid is null (service role). RLS already blocks anon before the trigger.

create or replace function public.sync_shift_status()
returns trigger language plpgsql as $$
begin
  -- Service role has no uid; RLS already blocks anon before the trigger.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_admin() then
      if new.client_id is distinct from old.client_id
         or new.deleted is distinct from old.deleted
         or new.created_by is distinct from old.created_by
         or new.created_at is distinct from old.created_at
         or new.caregiver_id is distinct from old.caregiver_id then
        raise exception
          'Caregivers may only update clock and note fields on their own shift'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- The deleted Cloud Function filtered
  --   status in ['Scheduled', 'Late', 'In Progress']
  -- so it never overwrote Cancelled or Completed. Match that behaviour.
  if new.status is distinct from old.status
     and new.status = 'Cancelled' then
    return new;
  end if;

  new.status := case
    when new.clock_out_time is not null then 'Completed'
    when new.clock_in_time  is not null then 'In Progress'
    when now() >= new.end_time          then 'No Show'
    when now() >= new.start_time        then 'Late'
    else 'Scheduled'
  end;

  if new.clock_in_time is not null and new.clock_out_time is not null then
    new.hours_worked := round(
      extract(epoch from (new.clock_out_time - new.clock_in_time)) / 3600.0, 2
    );
  end if;
  return new;
end $$;