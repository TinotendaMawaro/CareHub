-- CareHub: NDIS pricing/scheduling Phase 0
-- Replaces the earlier single-table cost_codes model with support_items,
-- support_families, pay_rates, public_holidays, shift_segments and resolve_segments().
-- Drop-in for the current shift schema (start_time/end_time, date, status).

create table if not exists public.support_items (
  item_number    text primary key,
  name           text not null,
  family_key     text not null,
  time_band      text not null check (time_band in
    ('weekday_day','weekday_evening','weekday_night','saturday','sunday','public_holiday','any')),
  unit           text not null check (unit in ('Hour','Each','Day','Week')),
  worker_level   text,
  price_national numeric(10,2) not null,
  price_remote   numeric(10,2),
  price_very_remote numeric(10,2),
  price_year     text not null default '2026-27',
  active         boolean not null default true
);
create index if not exists support_items_family_band_idx on public.support_items (family_key, time_band);

create table if not exists public.support_families (
  family_key        text primary key,
  label             text not null,
  category          text,
  default_worker_level text
);

create table if not exists public.pay_rates (
  id            uuid primary key default gen_random_uuid(),
  worker_level  text not null,
  time_band     text not null,
  hourly_rate   numeric(10,2) not null,
  each_rate     numeric(10,2),
  effective_from date not null,
  unique (worker_level, time_band, effective_from)
);

create table if not exists public.public_holidays (
  date  date not null,
  state text not null,
  name  text not null,
  primary key (date, state)
);

alter table public.clients
  add column if not exists price_region text not null default 'national'
    check (price_region in ('national','remote','very_remote')),
  add column if not exists state text;

alter table public.shifts
  add column if not exists support_family text references public.support_families(family_key),
  add column if not exists is_sleepover boolean not null default false,
  add column if not exists notes text;

create table if not exists public.shift_segments (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references public.shifts(id) on delete cascade,
  item_number text not null references public.support_items(item_number),
  seg_start   timestamptz not null,
  seg_end     timestamptz not null,
  units       numeric(8,2) not null,
  bill_rate   numeric(10,2) not null,
  pay_rate    numeric(10,2),
  bill_amount numeric(10,2) generated always as (units * bill_rate) stored,
  pay_amount  numeric(10,2) generated always as (units * coalesce(pay_rate,0)) stored
);
create index if not exists shift_segments_shift_idx on public.shift_segments (shift_id);

-- Realtime
alter publication supabase_realtime add table public.shift_segments;

-- RLS
do $$
declare t text;
begin
  foreach t in array array[
    'support_items','support_families','pay_rates','public_holidays','shift_segments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy support_items_read on public.support_items for select to authenticated using (true);
create policy support_items_admin_write on public.support_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy support_families_read on public.support_families for select to authenticated using (true);
create policy support_families_admin_write on public.support_families for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy pay_rates_read on public.pay_rates for select to authenticated using (true);
create policy pay_rates_admin_write on public.pay_rates for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy public_holidays_read on public.public_holidays for select to authenticated using (true);
create policy public_holidays_admin_write on public.public_holidays for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy shift_segments_read on public.shift_segments for select to authenticated
  using (exists (select 1 from public.shifts s where s.id = shift_id and (public.is_admin() or s.caregiver_id = auth.uid() or public.is_caregiver_of(s.client_id))));
create policy shift_segments_admin_write on public.shift_segments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Segment resolution
create or replace function public.resolve_segments(shift_id uuid)
returns void language plpgsql as $$
declare
  s record;
  client record;
  org_tz text := 'Australia/Sydney';
  band text;
  seg_start timestamptz;
  seg_end timestamptz;
  next_boundary timestamptz;
  item text;
  units numeric;
  rate numeric;
  pay numeric;
begin
  select * into s from public.shifts where id = shift_id;
  if not found then return; end if;

  select * into client from public.clients where id = s.client_id;

  if s.is_sleepover then
    select item_number into item from public.support_items
     where family_key = s.support_family and unit = 'Each'
       and (time_band = 'any' or time_band = 'weekday_day')
     limit 1;
    if item is null then return; end if;

    delete from public.shift_segments where shift_id = shift_id;

    rate := case client.price_region
      when 'remote' then (select price_remote from public.support_items where item_number = item)
      when 'very_remote' then (select price_very_remote from public.support_items where item_number = item)
      else (select price_national from public.support_items where item_number = item)
    end;

    pay := (select hourly_rate from public.pay_rates where worker_level = (select default_worker_level from public.support_families where family_key = s.support_family) and time_band = 'weekday_day' order by effective_from desc limit 1);

    insert into public.shift_segments (shift_id, item_number, seg_start, seg_end, units, bill_rate, pay_rate)
    values (shift_id, item, s.start_time, s.end_time, 1, rate, pay);
    return;
  end if;

  seg_start := s.start_time;
  while seg_start < s.end_time loop
    band := case
      when exists (select 1 from public.public_holidays ph where ph.date = seg_start::date and ph.state = coalesce(client.state, '')) then 'public_holiday'
      when extract(dow from seg_start) = 0 then 'sunday'
      when extract(dow from seg_start) = 6 then 'saturday'
      when extract(hour from seg_start) >= 20 then 'weekday_evening'
      when extract(hour from seg_start) < 6 then 'weekday_night'
      else 'weekday_day'
    end;

    next_boundary := date_trunc('day', seg_start + interval '1 day');
    if band = 'weekday_evening' then next_boundary := date_trunc('day', seg_start + interval '1 day') + interval '6 hours';
    elsif band in ('weekday_night','weekday_day') then next_boundary := date_trunc('day', seg_start) + interval '6 hours';
    end if;

    if next_boundary > s.end_time then next_boundary := s.end_time; end if;

    select item_number into item from public.support_items
     where family_key = s.support_family and time_band = band
     limit 1;
    if item is null then
      select item_number into item from public.support_items
       where family_key = s.support_family and time_band = 'any'
       limit 1;
    end if;
    if item is null then seg_start := next_boundary; continue; end if;

    units := extract(epoch from (next_boundary - seg_start)) / 3600.0;
    rate := case client.price_region
      when 'remote' then (select price_remote from public.support_items where item_number = item)
      when 'very_remote' then (select price_very_remote from public.support_items where item_number = item)
      else (select price_national from public.support_items where item_number = item)
    end;

    pay := (select hourly_rate from public.pay_rates where worker_level = (select default_worker_level from public.support_families where family_key = s.support_family) and time_band = band order by effective_from desc limit 1);

    insert into public.shift_segments (shift_id, item_number, seg_start, seg_end, units, bill_rate, pay_rate)
    values (shift_id, item, seg_start, next_boundary, units, rate, pay);

    seg_start := next_boundary;
  end loop;
end $$;

drop trigger if exists shifts_resolve_segments on public.shifts;
create trigger shifts_resolve_segments
  after insert or update of support_family, start_time, end_time, is_sleepover, client_id on public.shifts
  for each row execute function public.resolve_segments(new.id);
