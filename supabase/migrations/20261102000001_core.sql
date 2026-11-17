-- CareHub baseline 1/7: organisation, people, sites, auth helpers.
-- No PostGIS: coordinates are plain lat/lng and distance is computed with haversine,
-- so the schema runs unchanged on any Postgres (including the test harness).

-- ---------------------------------------------------------------------------
-- Organisation (singleton). One deployment = one organisation.
-- ---------------------------------------------------------------------------
create table public.organisation (
  id                       boolean primary key default true check (id),
  name                     text not null default 'My Organisation',
  legal_name               text,
  abn                      text,
  email                    text,
  phone                    text,
  address                  text,
  website                  text,
  logo_url                 text,
  brand_color              text not null default '#64B5F6',
  accent_color             text not null default '#4DB6AC',
  timezone                 text not null default 'Australia/Sydney',
  state                    text default 'NSW',
  currency                 text not null default 'AUD',
  -- invoicing
  invoice_prefix           text not null default 'INV',
  invoice_terms_days       int  not null default 14 check (invoice_terms_days >= 0),
  gst_rate                 numeric(5,4) not null default 0 check (gst_rate between 0 and 1),
  invoice_footer           text,
  bank_details             text,
  xero_account_code        text not null default '200',
  xero_tax_type            text not null default 'GST Free Income',
  -- scheduling / time and attendance
  default_geofence_required boolean not null default true,
  default_geofence_radius_m int     not null default 150 check (default_geofence_radius_m > 0),
  enforce_geofence_on_end   boolean not null default false,
  clock_in_early_minutes    int     not null default 15 check (clock_in_early_minutes >= 0),
  require_note_on_end       boolean not null default true,
  onboarding_complete      boolean not null default false,
  updated_at               timestamptz not null default now()
);
insert into public.organisation default values;

-- ---------------------------------------------------------------------------
-- Profiles: one per auth user. Role drives everything.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  first_name  text,
  last_name   text,
  phone       text,
  role        text not null default 'caregiver' check (role in ('admin','manager','office','caregiver')),
  avatar_url  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.sites (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  kind                text not null default 'sil_home' check (kind in ('sil_home','facility','community')),
  address             text,
  lat                 double precision check (lat between -90 and 90),
  lng                 double precision check (lng between -180 and 180),
  geofence_radius_m   int check (geofence_radius_m > 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

create table public.clients (
  id                   uuid primary key default gen_random_uuid(),
  first_name           text not null,
  last_name            text not null,
  email                text unique,
  phone                text,
  date_of_birth        date,
  ndis_number          text,
  diagnosis            text,
  allergies            text[] not null default '{}',
  care_plan            text,
  notes                text,
  emergency_contact    text,
  address              text,
  lat                  double precision check (lat between -90 and 90),
  lng                  double precision check (lng between -180 and 180),
  geofence_radius_m    int check (geofence_radius_m > 0),
  site_id              uuid references public.sites on delete set null,
  price_region         text not null default 'national' check (price_region in ('national','remote','very_remote')),
  state                text,
  profile_picture_url  text,
  status               text not null default 'active',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index clients_name_idx on public.clients (first_name, last_name);
create index clients_site_idx on public.clients (site_id);

create table public.caregivers (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid unique references auth.users on delete set null,
  name                 text not null,
  email                text unique,
  phone                text,
  worker_level         text not null default 'level_2',
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

-- Standing support team for a participant.
create table public.client_caregivers (
  client_id     uuid not null references public.clients on delete cascade,
  caregiver_id  uuid not null references public.caregivers on delete cascade,
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,
  primary key (client_id, caregiver_id)
);

-- ---------------------------------------------------------------------------
-- Auth helpers. SECURITY DEFINER so policies can use them without recursing
-- through RLS on the tables they inspect.
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- Office staff: admin, manager or office. They run the dashboard.
create or replace function public.is_office()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','manager','office'), false)
$$;

-- caregivers.id is NOT auth.uid(); this resolves the signed-in worker's row.
create or replace function public.current_caregiver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.caregivers c where c.user_id = auth.uid()
$$;

create or replace function public.haversine_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger organisation_touch before update on public.organisation
  for each row execute function public.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger caregivers_touch before update on public.caregivers
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A user may edit their own profile but never escalate their own role.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.role is distinct from old.role or new.active is distinct from old.active
     or new.id is distinct from old.id then
    raise exception 'forbidden: only an admin can change role or active status' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organisation      enable row level security;
alter table public.profiles          enable row level security;
alter table public.sites             enable row level security;
alter table public.clients           enable row level security;
alter table public.caregivers        enable row level security;
alter table public.client_caregivers enable row level security;

create policy organisation_read on public.organisation for select to authenticated using (true);
create policy organisation_write on public.organisation for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Pre-login branding for the mobile and web sign-in screens (name/logo/colours only).
create view public.organisation_public as
  select name, logo_url, brand_color, accent_color from public.organisation;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_office());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_admin_insert on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using (public.is_admin());

-- Colleague names for chat and rosters, without exposing email or phone.
create view public.staff_directory as
  select id, coalesce(nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), email) as name,
         avatar_url, role
  from public.profiles where active;

create policy sites_read  on public.sites for select to authenticated using (true);
create policy sites_write on public.sites for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy caregivers_read on public.caregivers for select to authenticated
  using (public.is_office() or user_id = auth.uid());
create policy caregivers_write on public.caregivers for all to authenticated
  using (public.is_office()) with check (public.is_office());
-- A worker may update only their own push token / availability (column guard below).
create policy caregivers_self_update on public.caregivers for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.guard_caregiver_self_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_office() then return new; end if;
  if new.user_id is distinct from old.user_id or new.worker_level is distinct from old.worker_level
     or new.contract_status is distinct from old.contract_status or new.email is distinct from old.email then
    raise exception 'forbidden: workers can only update contact details and availability' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger caregivers_guard before update on public.caregivers
  for each row execute function public.guard_caregiver_self_update();

create policy client_caregivers_read on public.client_caregivers for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());
create policy client_caregivers_write on public.client_caregivers for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- clients_read is defined in the scheduling migration (needs shift_workers).
create policy clients_write on public.clients for all to authenticated
  using (public.is_office()) with check (public.is_office());
