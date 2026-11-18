-- Leave management from the dashboard: office staff can record leave for anyone, every request
-- has a type, and approving or declining records who decided and when.

alter table public.time_off_requests
  add column if not exists leave_type text not null default 'Annual leave';
alter table public.time_off_requests drop constraint if exists time_off_requests_leave_type_check;
alter table public.time_off_requests add constraint time_off_requests_leave_type_check
  check (leave_type in ('Annual leave', 'Personal/carer''s leave', 'Sick leave', 'Unpaid leave', 'Unavailable', 'Other'));

drop policy if exists time_off_office_insert on public.time_off_requests;
create policy time_off_office_insert on public.time_off_requests for insert to authenticated
  with check (public.is_office());

drop policy if exists time_off_office_delete on public.time_off_requests;
create policy time_off_office_delete on public.time_off_requests for delete to authenticated
  using (public.is_office());

create or replace function public.stamp_leave_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('Approved', 'Rejected')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    new.approved_at := now();
    new.approved_by := auth.uid();
  elsif new.status = 'Pending' then
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end $$;

drop trigger if exists time_off_stamp on public.time_off_requests;
create trigger time_off_stamp before insert or update of status on public.time_off_requests
  for each row execute function public.stamp_leave_decision();
