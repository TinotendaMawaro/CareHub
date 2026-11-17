-- CareHub baseline 6/7: in-app chat with channels, terms & conditions, onboarding.

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create table public.chat_channels (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  kind        text not null default 'channel' check (kind in ('channel','group','dm')),
  description text,
  is_private  boolean not null default false,
  dm_key      text unique,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  check (kind = 'dm' or length(trim(coalesce(name, ''))) > 0)
);
create unique index chat_channels_name_idx on public.chat_channels (lower(name)) where kind = 'channel';

create table public.chat_members (
  channel_id    uuid not null references public.chat_channels on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  role          text not null default 'member' check (role in ('owner','member')),
  last_read_at  timestamptz not null default now(),
  joined_at     timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index chat_members_user_idx on public.chat_members (user_id);

create table public.chat_messages (
  id             uuid primary key default gen_random_uuid(),
  channel_id     uuid not null references public.chat_channels on delete cascade,
  sender_id      uuid not null references auth.users on delete cascade,
  body           text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  attachment_url text,
  created_at     timestamptz not null default now(),
  edited_at      timestamptz,
  deleted        boolean not null default false
);
create index chat_messages_channel_idx on public.chat_messages (channel_id, created_at desc);

create or replace function public.is_channel_member(p_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_members m where m.channel_id = p_channel and m.user_id = auth.uid())
$$;

alter table public.chat_channels enable row level security;
alter table public.chat_members  enable row level security;
alter table public.chat_messages enable row level security;

create policy chat_channels_read on public.chat_channels for select to authenticated
  using (public.is_channel_member(id) or (kind = 'channel' and not is_private));
create policy chat_channels_update on public.chat_channels for update to authenticated
  using (public.is_office() or exists (select 1 from public.chat_members m
         where m.channel_id = id and m.user_id = auth.uid() and m.role = 'owner'))
  with check (true);
create policy chat_channels_delete on public.chat_channels for delete to authenticated
  using (public.is_office());

create policy chat_members_read on public.chat_members for select to authenticated
  using (public.is_channel_member(channel_id));
create policy chat_members_leave on public.chat_members for delete to authenticated
  using (user_id = auth.uid() or public.is_office());
create policy chat_members_update_self on public.chat_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy chat_messages_read on public.chat_messages for select to authenticated
  using (public.is_channel_member(channel_id));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_channel_member(channel_id));
create policy chat_messages_update on public.chat_messages for update to authenticated
  using (sender_id = auth.uid() or public.is_office())
  with check (sender_id = auth.uid() or public.is_office());

create or replace function public.create_channel(p_name text, p_kind text default 'channel',
    p_members uuid[] default '{}', p_private boolean default false, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare ch uuid; m uuid;
begin
  if auth.uid() is null then raise exception 'forbidden: sign in first' using errcode = '42501'; end if;
  if p_kind not in ('channel','group') then raise exception 'invalid: kind must be channel or group'; end if;
  if p_kind = 'channel' and not public.is_office() then
    raise exception 'forbidden: only office staff can create channels. Start a group chat instead.' using errcode = '42501';
  end if;
  insert into public.chat_channels (name, kind, description, is_private, created_by)
  values (trim(p_name), p_kind, p_description, p_private or p_kind = 'group', auth.uid())
  returning id into ch;
  insert into public.chat_members (channel_id, user_id, role) values (ch, auth.uid(), 'owner');
  foreach m in array coalesce(p_members, '{}') loop
    insert into public.chat_members (channel_id, user_id)
      select ch, m where exists (select 1 from public.profiles where id = m and active) on conflict do nothing;
  end loop;
  return ch;
exception when unique_violation then
  raise exception 'duplicate: a channel with that name already exists';
end $$;

create or replace function public.get_or_create_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare k text; ch uuid;
begin
  if auth.uid() is null then raise exception 'forbidden: sign in first' using errcode = '42501'; end if;
  if p_other = auth.uid() then raise exception 'invalid: you cannot message yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_other and active) then
    raise exception 'not_found: that person is not available';
  end if;
  k := least(auth.uid()::text, p_other::text) || ':' || greatest(auth.uid()::text, p_other::text);
  select id into ch from public.chat_channels where dm_key = k;
  if ch is null then
    insert into public.chat_channels (kind, is_private, dm_key, created_by) values ('dm', true, k, auth.uid())
      returning id into ch;
    insert into public.chat_members (channel_id, user_id) values (ch, auth.uid()), (ch, p_other);
  end if;
  return ch;
end $$;

create or replace function public.join_channel(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chat_channels where id = p_channel and kind = 'channel' and not is_private) then
    raise exception 'forbidden: this channel is invite only' using errcode = '42501';
  end if;
  insert into public.chat_members (channel_id, user_id) values (p_channel, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.add_channel_member(p_channel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_office() or exists (select 1 from public.chat_members
          where channel_id = p_channel and user_id = auth.uid() and role = 'owner')) then
    raise exception 'forbidden: only the channel owner or office staff can add people' using errcode = '42501';
  end if;
  if exists (select 1 from public.chat_channels where id = p_channel and kind = 'dm') then
    raise exception 'invalid: you cannot add people to a direct message';
  end if;
  insert into public.chat_members (channel_id, user_id) values (p_channel, p_user) on conflict do nothing;
end $$;

create or replace function public.mark_channel_read(p_channel uuid)
returns void language sql security definer set search_path = public as $$
  update public.chat_members set last_read_at = now() where channel_id = p_channel and user_id = auth.uid()
$$;

create view public.chat_overview with (security_invoker = true) as
select c.id as channel_id, c.name, c.kind, c.is_private, c.description,
       m.last_read_at,
       (select count(*) from public.chat_messages x
         where x.channel_id = c.id and x.created_at > m.last_read_at and x.sender_id <> auth.uid() and not x.deleted) as unread,
       (select max(created_at) from public.chat_messages x where x.channel_id = c.id) as last_message_at,
       (select p.id from public.chat_members cm join public.profiles p on p.id = cm.user_id
         where c.kind = 'dm' and cm.channel_id = c.id and cm.user_id <> auth.uid() limit 1) as dm_user_id
from public.chat_channels c join public.chat_members m on m.channel_id = c.id and m.user_id = auth.uid();

-- ---------------------------------------------------------------------------
-- Terms & conditions
-- ---------------------------------------------------------------------------
create table public.legal_documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,
  title        text not null,
  audience     text not null check (audience in ('staff','office','client','all')),
  version      int  not null default 1 check (version >= 1),
  body         text not null,
  active       boolean not null default true,
  published_at timestamptz not null default now(),
  unique (kind, audience, version)
);

create table public.legal_acceptances (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.legal_documents on delete restrict,
  profile_id   uuid references auth.users on delete cascade,
  client_id    uuid references public.clients on delete cascade,
  typed_name   text not null check (length(trim(typed_name)) > 1),
  accepted_by  uuid references auth.users on delete set null,
  accepted_at  timestamptz not null default now(),
  check ((profile_id is not null) <> (client_id is not null))
);
create unique index legal_acceptances_profile_idx on public.legal_acceptances (document_id, profile_id) where profile_id is not null;
create unique index legal_acceptances_client_idx  on public.legal_acceptances (document_id, client_id)  where client_id is not null;

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------
create table public.onboarding_templates (
  id        uuid primary key default gen_random_uuid(),
  audience  text not null unique check (audience in ('staff','office','client')),
  title     text not null,
  steps     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.onboarding_tasks (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('staff','office','client')),
  profile_id    uuid references auth.users on delete cascade,
  client_id     uuid references public.clients on delete cascade,
  step_key      text not null,
  title         text not null,
  description   text,
  kind          text not null check (kind in ('accept_document','form','upload','info')),
  document_kind text,
  required      boolean not null default true,
  status        text not null default 'todo' check (status in ('todo','submitted','approved','rejected')),
  data          jsonb not null default '{}'::jsonb,
  file_url      text,
  completed_at  timestamptz,
  reviewed_by   uuid references auth.users on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  check ((profile_id is not null) <> (client_id is not null))
);
create unique index onboarding_tasks_profile_idx on public.onboarding_tasks (profile_id, step_key) where profile_id is not null;
create unique index onboarding_tasks_client_idx  on public.onboarding_tasks (client_id, step_key)  where client_id is not null;

create or replace function public.audience_for_role(p_role text)
returns text language sql immutable as $$
  select case when p_role = 'caregiver' then 'staff' else 'office' end
$$;

create or replace function public.start_onboarding(p_profile uuid default null, p_client uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare aud text; tpl public.onboarding_templates%rowtype; st jsonb; n int := 0;
begin
  perform public.require_office();
  if (p_profile is null) = (p_client is null) then raise exception 'invalid: give either a staff member or a participant'; end if;
  aud := case when p_client is not null then 'client'
              else public.audience_for_role((select role from public.profiles where id = p_profile)) end;
  select * into tpl from public.onboarding_templates where audience = aud;
  if not found then raise exception 'not_found: no onboarding template for %', aud; end if;
  for st in select * from jsonb_array_elements(tpl.steps) loop
    insert into public.onboarding_tasks (subject_type, profile_id, client_id, step_key, title, description, kind,
                                         document_kind, required)
    values (aud, p_profile, p_client, st->>'key', st->>'title', st->>'description', st->>'kind',
            st->>'document_kind', coalesce((st->>'required')::boolean, true))
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Latest active version of each document that applies to the caller and is not yet accepted.
create or replace function public.pending_legal_documents()
returns setof public.legal_documents language sql stable security definer set search_path = public as $$
  select d.* from public.legal_documents d
  where d.active
    and d.audience in ('all', public.audience_for_role(public.my_role()))
    and d.version = (select max(v.version) from public.legal_documents v
                      where v.kind = d.kind and v.audience = d.audience and v.active)
    and not exists (select 1 from public.legal_acceptances a where a.document_id = d.id and a.profile_id = auth.uid())
  order by d.kind
$$;

create or replace function public.accept_document(p_doc uuid, p_typed_name text, p_client uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare d public.legal_documents%rowtype;
begin
  if auth.uid() is null then raise exception 'forbidden: sign in first' using errcode = '42501'; end if;
  if p_client is not null then perform public.require_office(); end if;
  select * into d from public.legal_documents where id = p_doc and active;
  if not found then raise exception 'not_found: that document is not available'; end if;
  if length(trim(coalesce(p_typed_name, ''))) < 2 then raise exception 'invalid: type your full name to accept'; end if;

  insert into public.legal_acceptances (document_id, profile_id, client_id, typed_name, accepted_by)
  values (p_doc, case when p_client is null then auth.uid() end, p_client, trim(p_typed_name), auth.uid())
  on conflict do nothing;

  update public.onboarding_tasks set status = 'approved', completed_at = now(), data = jsonb_build_object('typed_name', trim(p_typed_name))
   where kind = 'accept_document' and document_kind = d.kind and status <> 'approved'
     and ((p_client is null and profile_id = auth.uid()) or (p_client is not null and client_id = p_client));
end $$;

create or replace function public.submit_onboarding_task(p_task uuid, p_data jsonb default '{}', p_file_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.onboarding_tasks%rowtype;
begin
  select * into t from public.onboarding_tasks where id = p_task for update;
  if not found then raise exception 'not_found: task does not exist'; end if;
  if not (public.is_office() or t.profile_id = auth.uid()) then
    raise exception 'forbidden: not your task' using errcode = '42501';
  end if;
  if t.kind = 'accept_document' then raise exception 'invalid: accept the document instead'; end if;
  if t.status = 'approved' then raise exception 'invalid: this step is already approved'; end if;
  if t.kind = 'upload' and coalesce(p_file_url, t.file_url) is null then raise exception 'invalid: attach a file'; end if;
  update public.onboarding_tasks set data = coalesce(p_data, '{}'), file_url = coalesce(p_file_url, file_url),
         status = case when public.is_office() and t.profile_id is distinct from auth.uid() then 'approved' else 'submitted' end,
         completed_at = now(), review_note = null
   where id = p_task;
end $$;

create or replace function public.review_onboarding_task(p_task uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.require_office();
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'invalid: say what needs fixing'; end if;
  update public.onboarding_tasks set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where id = p_task and status = 'submitted';
  if not found then raise exception 'invalid: only submitted steps can be reviewed'; end if;
end $$;

-- What the mobile app checks before letting a worker in.
create or replace function public.my_onboarding()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pend int; req int; ok int; docs int;
begin
  select count(*) into docs from public.pending_legal_documents();
  select count(*) filter (where required), count(*) filter (where required and status = 'approved')
    into req, ok from public.onboarding_tasks where profile_id = auth.uid();
  return jsonb_build_object('pending_documents', docs, 'required_steps', req, 'approved_steps', ok,
                            'needs_terms', docs > 0, 'complete', docs = 0 and ok >= req);
end $$;

alter table public.legal_documents      enable row level security;
alter table public.legal_acceptances    enable row level security;
alter table public.onboarding_templates enable row level security;
alter table public.onboarding_tasks     enable row level security;

create policy legal_documents_read on public.legal_documents for select to authenticated using (true);
create policy legal_documents_write on public.legal_documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy legal_acceptances_read on public.legal_acceptances for select to authenticated
  using (public.is_office() or profile_id = auth.uid());
create policy onboarding_templates_read on public.onboarding_templates for select to authenticated using (true);
create policy onboarding_templates_write on public.onboarding_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy onboarding_tasks_read on public.onboarding_tasks for select to authenticated
  using (public.is_office() or profile_id = auth.uid());
create policy onboarding_tasks_write on public.onboarding_tasks for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- ---------------------------------------------------------------------------
-- Starter content. These are TEMPLATES, not legal advice: have your legal adviser
-- review and replace them (Settings > Terms) before onboarding real people.
-- ---------------------------------------------------------------------------
insert into public.legal_documents (kind, title, audience, body) values
('terms', 'Staff Terms of Use', 'staff',
 E'# Staff Terms of Use\n\n*Template - replace with wording approved by your legal adviser.*\n\n1. **Purpose.** This app records your shifts, notes and incidents for the people we support.\n2. **Confidentiality.** Participant information is confidential. Use it only to deliver support and never share it outside the organisation.\n3. **Accurate records.** Start and end shifts at the participant''s address and write honest, factual notes.\n4. **Location.** Your device location is checked when you start a shift to confirm attendance.\n5. **Incidents.** Report incidents as soon as it is safe to do so.\n6. **Security.** Keep your login private and report a lost device immediately.'),
('code_of_conduct', 'Code of Conduct', 'staff',
 E'# Code of Conduct\n\n*Template - replace with your organisation''s code.*\n\nTreat every participant with dignity and respect, support their choices, never accept gifts or money, report abuse, neglect or exploitation, and work within your training.'),
('privacy', 'Privacy Notice', 'all',
 E'# Privacy Notice\n\n*Template - replace with your organisation''s privacy policy.*\n\nWe collect only the information needed to provide and manage supports, store it securely, and share it only where the law or the participant''s consent allows.'),
('confidentiality', 'Office Confidentiality Agreement', 'office',
 E'# Confidentiality Agreement\n\n*Template.*\n\nYou will have access to participant, staff and financial records. You agree to access them only for work purposes and not to disclose them.'),
('terms', 'Office Terms of Use', 'office',
 E'# Office Terms of Use\n\n*Template.*\n\nYou are responsible for the accuracy of rosters, approvals and invoices you create or approve, and for keeping your account secure.'),
('service_agreement', 'Service Agreement', 'client',
 E'# Service Agreement\n\n*Template - replace with your organisation''s service agreement.*\n\nThis agreement sets out the supports we will provide, how they are scheduled, the prices charged, how to give feedback or make a complaint, and how either party can change or end the agreement.'),
('consent', 'Consent to Share Information', 'client',
 E'# Consent\n\n*Template.*\n\nI consent to the organisation collecting and sharing my information with my support workers, and with people I nominate, for the purpose of providing my supports.');

insert into public.onboarding_templates (audience, title, steps) values
('staff', 'New support worker onboarding', '[
  {"key":"terms","title":"Accept Staff Terms of Use","kind":"accept_document","document_kind":"terms"},
  {"key":"conduct","title":"Accept Code of Conduct","kind":"accept_document","document_kind":"code_of_conduct"},
  {"key":"privacy","title":"Read the Privacy Notice","kind":"accept_document","document_kind":"privacy"},
  {"key":"id","title":"Upload photo ID","description":"Driver licence or passport.","kind":"upload"},
  {"key":"screening","title":"Upload NDIS Worker Screening Check","kind":"upload"},
  {"key":"first_aid","title":"Upload First Aid certificate","kind":"upload","required":false},
  {"key":"emergency","title":"Emergency contact","description":"Name, relationship and phone.","kind":"form"},
  {"key":"induction","title":"Complete induction with the office","kind":"info"}
 ]'::jsonb),
('office', 'New office staff onboarding', '[
  {"key":"terms","title":"Accept Office Terms of Use","kind":"accept_document","document_kind":"terms"},
  {"key":"confidentiality","title":"Sign Confidentiality Agreement","kind":"accept_document","document_kind":"confidentiality"},
  {"key":"privacy","title":"Read the Privacy Notice","kind":"accept_document","document_kind":"privacy"},
  {"key":"id","title":"Upload photo ID","kind":"upload"},
  {"key":"training","title":"Complete system training","kind":"info"}
 ]'::jsonb),
('client', 'New participant onboarding', '[
  {"key":"service_agreement","title":"Service Agreement signed","kind":"accept_document","document_kind":"service_agreement"},
  {"key":"consent","title":"Consent to share information","kind":"accept_document","document_kind":"consent"},
  {"key":"privacy","title":"Privacy Notice provided","kind":"accept_document","document_kind":"privacy"},
  {"key":"plan","title":"Upload NDIS plan","kind":"upload"},
  {"key":"emergency","title":"Emergency contacts and preferences","kind":"form"},
  {"key":"risk","title":"Risk assessment completed","kind":"info"}
 ]'::jsonb);
