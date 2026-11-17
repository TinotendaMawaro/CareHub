-- CareHub: Firestore -> Postgres schema
create extension if not exists "pgcrypto";
create extension if not exists "postgis" schema extensions;
set search_path = public, extensions;

create type app_role       as enum ('admin', 'caregiver', 'manager');
create type shift_status   as enum ('Scheduled','In Progress','Completed','Late','No Show','Cancelled');
create type service_type   as enum ('aged_care','ndis','intercompany','other');
create type incident_state as enum ('Reported','Resolved','Unresolved','Investigation');
create type severity_lvl   as enum ('Low','Medium','High');
create type approval_state as enum ('Pending','Approved','Rejected');
create type expense_cat    as enum ('Travel','Supplies','Equipment','Meals','Other');
create type money_state    as enum ('Draft','Sent','Paid','Overdue','Cancelled');
create type payroll_state  as enum ('Pending','Processed','Paid');


create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  first_name  text,
  last_name   text,
  role        app_role not null default 'caregiver',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.clients (
  id                   uuid primary key default gen_random_uuid(),
  first_name           text not null,
  last_name            text not null,
  email                text unique,
  date_of_birth        date,
  diagnosis            text,
  allergies            text[] not null default '{}',
  care_plan            text,
  notes                text,
  emergency_contact    text,
  location             geography(point, 4326),
  address              text,
  assigned_caregivers  uuid[] not null default '{}',
  preferred_caregivers uuid[] not null default '{}',
  profile_picture_url  text,
  status               text not null default 'active',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index clients_first_name_idx on public.clients (first_name);
create index clients_assigned_caregivers_idx on public.clients using gin (assigned_caregivers);
create index clients_location_idx on public.clients using gist (location);

create table public.caregivers (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid unique references auth.users on delete set null,
  name                 text not null,
  email                text unique,
  phone                text,
  qualifications       text[] not null default '{}',
  experience           numeric(4,1) not null default 0,
  skills               text[] not null default '{}',
  availability         text not null default 'Available',
  profile_picture_url  text,
  push_token           text,
  contract_status      text not null default 'Active',
  current_shift_id     uuid,
  evv_compliance       text not null default 'Unknown',
  clients_worked_with  uuid[] not null default '{}',
  clients_inducted_for uuid[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index caregivers_name_idx on public.caregivers (name);

create table public.shifts (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients on delete cascade,
  caregiver_id   uuid references public.caregivers on delete set null,
  service_type   service_type not null default 'other',
  date           date not null,
  start_time     timestamptz not null,
  end_time       timestamptz not null,
  location       geography(point, 4326),
  status         shift_status not null default 'Scheduled',
  clock_in_time  timestamptz,
  clock_out_time timestamptz,
  hours_worked   numeric(5,2),
  created_by     uuid references auth.users on delete set null,
  created_at     timestamptz not null default now(),
  modified_by    uuid references auth.users on delete set null,
  modified_at    timestamptz,
  allow_overlap  boolean not null default false,
  deleted        boolean not null default false,
  constraint shifts_time_order check (end_time > start_time)
);
create index shifts_date_idx on public.shifts (date desc);
create index shifts_client_date_idx on public.shifts (client_id, date);
create index shifts_caregiver_date_idx on public.shifts (caregiver_id, date) where deleted = false;

create table public.incidents (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references public.clients on delete set null,
  caregiver_id     uuid not null references public.caregivers on delete cascade,
  date             date not null,
  time             time,
  description      text not null,
  incident_type    text not null,
  status           incident_state not null default 'Reported',
  actions_taken    text,
  involved_parties text,
  photo_urls       text[] not null default '{}',
  severity         severity_lvl,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index incidents_date_idx on public.incidents (date desc);

create table public.shift_notes (
  id           uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers on delete cascade,
  client_id    uuid not null references public.clients on delete cascade,
  note         text not null,
  timestamp    timestamptz not null default now(),
  status       text not null default 'Open'
);
create index shift_notes_timestamp_idx on public.shift_notes (timestamp desc);

create table public.locations (
  id           bigint generated always as identity primary key,
  caregiver_id uuid not null references public.caregivers on delete cascade,
  point        geography(point, 4326) not null,
  timestamp    timestamptz not null default now(),
  accuracy     numeric
);
create index locations_point_idx on public.locations using gist (point);
create index locations_caregiver_ts_idx on public.locations (caregiver_id, timestamp desc);

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users on delete cascade,
  recipient_id uuid references auth.users on delete cascade,
  content      text not null,
  timestamp    timestamptz not null default now(),
  read         boolean not null default false,
  type         text not null default 'text',
  group_id     uuid
);
create index messages_thread_idx on public.messages (sender_id, recipient_id, timestamp desc);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.caregivers on delete cascade,
  client_id    uuid references public.clients on delete set null,
  shift_id     uuid references public.shifts on delete set null,
  category     expense_cat not null,
  description  text not null,
  amount       numeric(10,2) not null,
  currency     text not null default 'AUD',
  date         date not null,
  receipt_url  text,
  status       approval_state not null default 'Pending',
  approved_by  uuid references auth.users on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  modified_at  timestamptz
);

create table public.mileage (
  id             uuid primary key default gen_random_uuid(),
  caregiver_id   uuid not null references public.caregivers on delete cascade,
  client_id      uuid references public.clients on delete set null,
  shift_id       uuid references public.shifts on delete set null,
  start_location geography(point, 4326) not null,
  end_location   geography(point, 4326) not null,
  distance       numeric(10,2) not null,
  unit           text not null default 'km',
  date           date not null,
  purpose        text,
  vehicle_type   text,
  created_at     timestamptz not null default now(),
  modified_at    timestamptz
);

create table public.care_plans (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients on delete cascade,
  title       text not null,
  description text,
  goals       jsonb not null default '[]'::jsonb,
  tasks       jsonb not null default '[]'::jsonb,
  start_date  date not null,
  end_date    date,
  status      text not null default 'Active',
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  modified_by uuid references auth.users on delete set null,
  modified_at timestamptz
);

create table public.assessments (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients on delete cascade,
  caregiver_id         uuid not null references public.caregivers on delete cascade,
  type                 text not null,
  date                 date not null,
  results              jsonb not null default '[]'::jsonb,
  overall_notes        text,
  recommendations      text[] not null default '{}',
  next_assessment_date date,
  status               text not null default 'Draft',
  reviewed_by          uuid references auth.users on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  modified_at          timestamptz
);

create table public.billing (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients on delete cascade,
  invoice_number text not null unique,
  period         jsonb not null default '{}'::jsonb,
  services       jsonb not null default '[]'::jsonb,
  subtotal       numeric(10,2) not null default 0,
  tax            numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  currency       text not null default 'AUD',
  due_date       date not null,
  status         money_state not null default 'Draft',
  payment_date   date,
  payment_method text,
  notes          text,
  created_at     timestamptz not null default now(),
  modified_at    timestamptz
);

create table public.payrolls (
  id             uuid primary key default gen_random_uuid(),
  caregiver_id   uuid not null references public.caregivers on delete cascade,
  period         jsonb not null default '{}'::jsonb,
  hours_worked   numeric(6,2) not null default 0,
  regular_hours  numeric(6,2) not null default 0,
  overtime_hours numeric(6,2) not null default 0,
  hourly_rate    numeric(10,2) not null default 0,
  overtime_rate  numeric(10,2) not null default 0,
  gross_pay      numeric(10,2) not null default 0,
  deductions     jsonb not null default '[]'::jsonb,
  net_pay        numeric(10,2) not null default 0,
  currency       text not null default 'AUD',
  status         payroll_state not null default 'Pending',
  payment_date   date,
  payment_method text,
  notes          text,
  created_at     timestamptz not null default now(),
  modified_at    timestamptz
);

create table public.forms (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  type          text not null,
  client_id     uuid references public.clients on delete cascade,
  caregiver_id  uuid references public.caregivers on delete cascade,
  shift_id      uuid references public.shifts on delete set null,
  fields        jsonb not null default '[]'::jsonb,
  responses     jsonb not null default '[]'::jsonb,
  status        text not null default 'Draft',
  submitted_at  timestamptz,
  reviewed_by   uuid references auth.users on delete set null,
  reviewed_at   timestamptz,
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  modified_at   timestamptz
);

create table public.reports (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  content    text,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  title     text not null,
  message   text not null,
  type      text not null,
  data      jsonb not null default '{}'::jsonb,
  read      boolean not null default false,
  timestamp timestamptz not null default now()
);
create index notifications_user_ts_idx on public.notifications (user_id, timestamp desc);

-- Realtime: keep subscribed dashboards live
alter publication supabase_realtime add table
  public.shifts, public.incidents, public.shift_notes, public.notifications, public.messages;

-- Row Level Security, translated from firestore.rules
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'clients', 'caregivers', 'shifts', 'incidents', 'shift_notes',
    'locations', 'messages', 'expenses', 'mileage', 'care_plans', 'assessments',
    'billing', 'payrolls', 'forms', 'reports', 'notifications'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_caregiver_of(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = target and auth.uid() = any (c.assigned_caregivers)
  );
$$;

create policy profiles_own on public.profiles for all to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy clients_read on public.clients for select to authenticated
  using (public.is_admin() or auth.uid() = any (assigned_caregivers));
create policy clients_write on public.clients for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy caregivers_read on public.caregivers for select to authenticated using (true);
create policy caregivers_write on public.caregivers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy shifts_read on public.shifts for select to authenticated
  using (public.is_admin() or caregiver_id = auth.uid() or public.is_caregiver_of(client_id));
create policy shifts_admin_write on public.shifts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy shifts_caregiver_update on public.shifts for update to authenticated
  using (caregiver_id = auth.uid() and not public.is_admin())
  with check (caregiver_id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array[
    'incidents', 'shift_notes', 'expenses', 'mileage', 'care_plans',
    'assessments', 'billing', 'payrolls', 'forms', 'reports'
  ]
  loop
    execute format(
      'create policy %1$I_read on public.%1$I for select to authenticated using (true)', t);
    execute format(
      'create policy %1$I_write on public.%1$I for all to authenticated '
      'using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

create policy locations_read on public.locations for select to authenticated using (true);
create policy locations_insert on public.locations for insert to authenticated
  with check (caregiver_id = auth.uid() or public.is_admin());

create policy messages_read on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid());
create policy messages_update on public.messages for update to authenticated
  using (sender_id = auth.uid() or public.is_admin())
  with check (sender_id = auth.uid() or public.is_admin());

create policy notifications_own on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Replaces the updateShiftStatuses Cloud Function
create or replace function public.sync_shift_status()
returns trigger language plpgsql as $$
begin
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

create trigger trg_shift_status
  before insert or update on public.shifts
  for each row execute function public.sync_shift_status();

-- Storage buckets
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('documents', 'documents', true)
on conflict (id) do nothing;

create policy avatars_read   on storage.objects for select using (bucket_id = 'avatars');
create policy avatars_insert  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_admin());
create policy avatars_update  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_admin());
create policy avatars_delete  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin());
create policy documents_read  on storage.objects for select using (bucket_id = 'documents');
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());
