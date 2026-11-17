-- Security hardening pass after the Firebase -> Supabase review.
--
-- 1. Restrict over-broad read policies that re-created the old Firestore
--    "allow read: if true" exposure for signed-in users.
-- 2. Make the `documents` bucket private; it holds client health records.
-- 3. Stop the shift status trigger from overwriting an explicit Cancelled.

-- ------------------------------------------------------------------
-- 1. Row level security: replace `using (true)` with real scoping
-- ------------------------------------------------------------------

drop policy if exists caregivers_read on public.caregivers;
create policy caregivers_read on public.caregivers for select to authenticated
  using (public.is_admin() or user_id = auth.uid() or exists (
    select 1 from public.clients c
    where auth.uid() = any (c.assigned_caregivers)
      and c.id in (
        select s.client_id from public.shifts s where s.caregiver_id = caregivers.id
      )
  ));

drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations for select to authenticated
  using (caregiver_id = auth.uid() or public.is_admin());

-- Caregiver-owned operational records: own rows only, admins see all.
drop policy if exists incidents_read on public.incidents;
create policy incidents_read on public.incidents for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid() or public.is_caregiver_of(client_id));

drop policy if exists shift_notes_read on public.shift_notes;
create policy shift_notes_read on public.shift_notes for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid() or public.is_caregiver_of(client_id));

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid());

drop policy if exists mileage_read on public.mileage;
create policy mileage_read on public.mileage for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid());

-- Client-linked care records: assigned caregivers plus admins.
drop policy if exists care_plans_read on public.care_plans;
create policy care_plans_read on public.care_plans for select to authenticated
  using (public.is_admin() or public.is_caregiver_of(client_id));

drop policy if exists assessments_read on public.assessments;
create policy assessments_read on public.assessments for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid() or public.is_caregiver_of(client_id));

drop policy if exists forms_read on public.forms;
create policy forms_read on public.forms for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid() or public.is_caregiver_of(client_id));

-- Financial records: admin only. The loop above created these with
-- `using (true)`, exposing invoices and payroll to every signed-in user.
drop policy if exists billing_read on public.billing;
create policy billing_read on public.billing for select to authenticated
  using (public.is_admin());

drop policy if exists payrolls_read on public.payrolls;
create policy payrolls_read on public.payrolls for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid());

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (public.is_admin());

-- Re-write policies: the generic admin-only policy still applies, but scope
-- writes to the caregiver who owns the row so a caregiver can file their own.
drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses for insert to authenticated
  with check (caregiver_id = auth.uid() or public.is_admin());
create policy expenses_update on public.expenses for update to authenticated
  using (caregiver_id = auth.uid() or public.is_admin())
  with check (caregiver_id = auth.uid() or public.is_admin());
create policy expenses_delete on public.expenses for delete to authenticated
  using (caregiver_id = auth.uid() or public.is_admin());

drop policy if exists mileage_write on public.mileage;
create policy mileage_write on public.mileage for insert to authenticated
  with check (caregiver_id = auth.uid() or public.is_admin());
create policy mileage_update on public.mileage for update to authenticated
  using (caregiver_id = auth.uid() or public.is_admin())
  with check (caregiver_id = auth.uid() or public.is_admin());
create policy mileage_delete on public.mileage for delete to authenticated
  using (caregiver_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------------
-- 2. documents bucket must not be public: it holds client health records
-- ------------------------------------------------------------------

update storage.buckets set public = false where id = 'documents';

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_admin());

drop policy if exists documents_insert on storage.objects;
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());

drop policy if exists documents_update on storage.objects;
create policy documents_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());

drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());

-- ------------------------------------------------------------------
-- 3. Shift status trigger
-- ------------------------------------------------------------------

-- Preserve an explicit cancellation, and stop a caregiver reassigning a
-- shift to another client or soft-deleting it.
create or replace function public.sync_shift_status()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() and tg_op = 'UPDATE' then
    if new.client_id is distinct from old.client_id
       or new.deleted is distinct from old.deleted
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.caregiver_id is distinct from old.caregiver_id then
      raise exception
        'Caregivers may only update clock and note fields on their own shift';
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

-- OLD is unavailable on INSERT, so the insert path uses its own function.
create or replace function public.sync_shift_status_bi()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.status := case
      when new.clock_out_time is not null then 'Completed'
      when new.clock_in_time  is not null then 'In Progress'
      when now() >= new.end_time          then 'No Show'
      when now() >= new.start_time        then 'Late'
      else 'Scheduled'
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_shift_status on public.shifts;
create trigger trg_shift_status
  before update on public.shifts
  for each row execute function public.sync_shift_status();
create trigger trg_shift_status_insert
  before insert on public.shifts
  for each row execute function public.sync_shift_status_bi();

-- ------------------------------------------------------------------
-- 4. jsonb period sanity
-- ------------------------------------------------------------------

alter table public.billing
  drop constraint if exists billing_period_present,
  add constraint billing_period_present
  check (period ? 'startDate' and period ? 'endDate');

alter table public.payrolls
  drop constraint if exists payrolls_period_present,
  add constraint payrolls_period_present
  check (period ? 'startDate' and period ? 'endDate');
