-- Documents hub: staff compliance documents (screening checks, first aid, licences),
-- participant documents (NDIS plans, service agreements, behaviour support plans) and
-- organisation-wide documents (policies and procedures), with expiry tracking.
-- Files live in the private 'documents' storage bucket. Access to a file follows access
-- to its document row, so the table's RLS is the single source of truth.

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (length(trim(title)) > 0),
  category          text not null default 'Other',
  -- Owner: a support worker, a participant, or neither (organisation-wide).
  caregiver_id      uuid references public.caregivers on delete cascade,
  client_id         uuid references public.clients on delete cascade,
  file_path         text not null unique,
  file_name         text not null,
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  issue_date        date,
  expiry_date       date check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  notes             text,
  -- Participant and organisation documents: may assigned support workers see it?
  visible_to_staff  boolean not null default false,
  -- Worker uploads wait for the office to check them.
  status            text not null default 'approved' check (status in ('pending_review','approved','rejected')),
  review_note       text,
  reviewed_by       uuid references auth.users on delete set null,
  reviewed_at       timestamptz,
  archived          boolean not null default false,
  uploaded_by       uuid references auth.users on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (caregiver_id is null or client_id is null)
);
create index documents_caregiver_idx on public.documents (caregiver_id) where caregiver_id is not null;
create index documents_client_idx    on public.documents (client_id)    where client_id is not null;
create index documents_expiry_idx    on public.documents (expiry_date)  where expiry_date is not null and not archived;

create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- Workers may only add documents for themselves, and those always start as pending review.
-- They cannot approve, re-own, or edit after upload; the office does that.
create or replace function public.documents_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_office() then
    if new.status is distinct from coalesce(old.status, 'approved') and new.status in ('approved','rejected') then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.caregiver_id is distinct from public.current_caregiver_id() or new.client_id is not null then
      raise exception 'forbidden: support workers can only upload their own documents';
    end if;
    new.status := 'pending_review';
    new.visible_to_staff := false;
    new.uploaded_by := auth.uid();
    new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
    new.archived := false;
    return new;
  end if;
  raise exception 'forbidden: only the office can change documents';
end $$;

create trigger documents_guard before insert or update on public.documents
  for each row execute function public.documents_guard();

-- A worker may see a participant's shared documents while on that participant's standing
-- support team, or when rostered with them from 7 days ago to 14 days ahead.
create or replace function public.worker_supports_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.client_caregivers cc
      where cc.client_id = p_client and cc.caregiver_id = public.current_caregiver_id() and cc.unassigned_at is null)
    or exists (
      select 1 from public.shift_clients sc
      join public.shift_workers sw on sw.shift_id = sc.shift_id
      join public.shifts s on s.id = sc.shift_id
      where sc.client_id = p_client and sw.caregiver_id = public.current_caregiver_id()
        and not s.deleted and s.status <> 'Cancelled'
        and s.start_time between now() - interval '7 days' and now() + interval '14 days')
$$;
grant execute on function public.worker_supports_client(uuid) to authenticated;

alter table public.documents enable row level security;

create policy documents_office_all on public.documents for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- Workers: their own documents; organisation documents shared with staff; shared
-- documents for participants they are currently assigned to.
create policy documents_worker_read on public.documents for select to authenticated
  using (
    not archived and (
      caregiver_id = public.current_caregiver_id()
      or (visible_to_staff and status = 'approved' and caregiver_id is null and client_id is null)
      or (visible_to_staff and status = 'approved' and client_id is not null and public.worker_supports_client(client_id))
    )
  );

create policy documents_worker_insert on public.documents for insert to authenticated
  with check (caregiver_id = public.current_caregiver_id() and client_id is null);

-- Storage: replace the office-only rule for the 'documents' bucket.
-- Workers upload into their own folder; reading a file requires being able to see its row.
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  execute 'drop policy if exists documents_office on storage.objects';
  execute $p$create policy documents_office on storage.objects for all to authenticated
             using (bucket_id = 'documents' and public.is_office())
             with check (bucket_id = 'documents' and public.is_office())$p$;
  execute $p$create policy documents_worker_upload on storage.objects for insert to authenticated
             with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy documents_worker_read on storage.objects for select to authenticated
             using (bucket_id = 'documents' and exists (
               select 1 from public.documents d where d.file_path = storage.objects.name))$p$;
end $$;

-- Compliance summary for the dashboard and the mobile app, scoped by the caller's RLS.
create or replace function public.document_expiry_summary(p_days int default 30)
returns table (expired bigint, expiring bigint, pending_review bigint)
language sql stable security invoker set search_path = public as $$
  select
    count(*) filter (where expiry_date < current_date and status <> 'rejected'),
    count(*) filter (where expiry_date >= current_date and expiry_date <= current_date + p_days and status <> 'rejected'),
    count(*) filter (where status = 'pending_review')
  from public.documents
  where not archived;
$$;
grant execute on function public.document_expiry_summary(int) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;
