-- When the office approves a worker's or participant's document, older approved copies of the
-- same category for the same person are archived: an approved renewal replaces the old one, so
-- the lapsed copy stops showing as "expired". Archived rows stay recoverable. Organisation
-- documents, and categories that normally hold several documents, are left alone.
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

create or replace function public.documents_supersede()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and not new.archived
     and (new.caregiver_id is not null or new.client_id is not null)
     -- Categories where a person normally holds several current documents never replace each other.
     and new.category not in ('Other', 'Qualification', 'Vaccination Record', 'Consent Form')
     and (tg_op = 'INSERT' or old.status is distinct from 'approved' or old.archived) then
    update public.documents d
       set archived = true
     where d.id <> new.id
       and not d.archived
       and d.status = 'approved'
       and d.category = new.category
       and d.caregiver_id is not distinct from new.caregiver_id
       and d.client_id is not distinct from new.client_id
       and d.created_at <= new.created_at
       and coalesce(d.expiry_date, '-infinity'::date) <= coalesce(new.expiry_date, 'infinity'::date);
  end if;
  return null;
end $$;

drop trigger if exists documents_supersede on public.documents;
create trigger documents_supersede after insert or update of status, archived on public.documents
  for each row execute function public.documents_supersede();
