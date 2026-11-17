-- CareHub baseline 2/7: price guide (cost codes), pay rates, time bands.
--
-- A "cost code" IS a support item: the price guide row a shift is billed under.
-- A shift may name one explicitly (shifts.item_number), e.g. morning = weekday-daytime
-- code, afternoon = evening code, sleepover = the flat sleepover code. When it does not,
-- the item is resolved from the support family + time band + ratio.

create table public.support_families (
  family_key           text primary key,
  label                text not null,
  category             text,
  default_worker_level text
);

create table public.support_items (
  item_number       text primary key,
  name              text not null,
  family_key        text not null references public.support_families(family_key) on update cascade,
  time_band         text not null check (time_band in
    ('weekday_day','weekday_evening','weekday_night','saturday','sunday','public_holiday','any')),
  ratio             text not null default '1:1' check (ratio ~ '^[1-9]:[1-9]$'),
  unit              text not null check (unit in ('Hour','Each','Day','Week')),
  is_sleepover      boolean not null default false,
  support_category  int,
  price_national    numeric(10,2) not null check (price_national >= 0),
  price_remote      numeric(10,2),
  price_very_remote numeric(10,2),
  price_year        text not null default '2026-27',
  active            boolean not null default true
);
create index support_items_lookup_idx on public.support_items (family_key, time_band, ratio) where active;

create table public.pay_rates (
  id             uuid primary key default gen_random_uuid(),
  worker_level   text not null,
  time_band      text not null,
  hourly_rate    numeric(10,2) not null check (hourly_rate >= 0),
  each_rate      numeric(10,2),
  effective_from date not null,
  unique (worker_level, time_band, effective_from)
);

create table public.public_holidays (
  date  date not null,
  state text not null,
  name  text not null,
  primary key (date, state)
);

alter table public.support_families enable row level security;
alter table public.support_items    enable row level security;
alter table public.pay_rates        enable row level security;
alter table public.public_holidays  enable row level security;

create policy support_families_read on public.support_families for select to authenticated using (true);
create policy support_items_read    on public.support_items    for select to authenticated using (true);
create policy public_holidays_read  on public.public_holidays  for select to authenticated using (true);
-- Pay rates are payroll-sensitive: office only.
create policy pay_rates_read on public.pay_rates for select to authenticated using (public.is_office());

create policy support_families_write on public.support_families for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy support_items_write on public.support_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy public_holidays_write on public.public_holidays for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy pay_rates_write on public.pay_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Time bands. All boundaries are evaluated in the organisation's timezone:
--   weekday  06:00-20:00 day | 20:00-24:00 evening | 00:00-06:00 night
--   saturday / sunday / public holiday: the whole local calendar day
-- ---------------------------------------------------------------------------
create or replace function public.org_tz() returns text
language sql stable as $$ select timezone from public.organisation limit 1 $$;

create or replace function public.band_segments(p_start timestamptz, p_end timestamptz, p_state text default null)
returns table (seg_start timestamptz, seg_end timestamptz, band text)
language plpgsql stable as $$
declare
  tz    text := public.org_tz();
  cur   timestamptz := p_start;
  loc   timestamp;
  d     date;
  nxt_l timestamp;
  nxt   timestamptz;
  b     text;
begin
  while cur < p_end loop
    loc := cur at time zone tz;
    d   := loc::date;
    if exists (select 1 from public.public_holidays h
               where h.date = d and (h.state = coalesce(p_state, '') or h.state = 'ALL')) then
      b := 'public_holiday'; nxt_l := (d + 1)::timestamp;
    elsif extract(isodow from loc) = 7 then
      b := 'sunday';   nxt_l := (d + 1)::timestamp;
    elsif extract(isodow from loc) = 6 then
      b := 'saturday'; nxt_l := (d + 1)::timestamp;
    elsif loc::time < time '06:00' then
      b := 'weekday_night';   nxt_l := d + time '06:00';
    elsif loc::time < time '20:00' then
      b := 'weekday_day';     nxt_l := d + time '20:00';
    else
      b := 'weekday_evening'; nxt_l := (d + 1)::timestamp;
    end if;
    nxt := least(nxt_l at time zone tz, p_end);
    if nxt <= cur then nxt := p_end; end if;  -- DST safety: never loop forever
    seg_start := cur; seg_end := nxt; band := b;
    return next;
    cur := nxt;
  end loop;
end $$;

-- Pick the price-guide row for (family, band, ratio), falling back to 1:1 and to 'any'.
create or replace function public.pick_item(p_family text, p_band text, p_ratio text, p_sleepover boolean)
returns text language sql stable as $$
  select item_number from public.support_items
  where active and family_key = p_family and is_sleepover = p_sleepover
    and time_band in (p_band, 'any')
    and ratio in (p_ratio, '1:1')
  order by (time_band = p_band) desc, (ratio = p_ratio) desc
  limit 1
$$;

create or replace function public.item_rate(p_item text, p_region text)
returns numeric language sql stable as $$
  select case p_region
           when 'remote'      then coalesce(price_remote, price_national)
           when 'very_remote' then coalesce(price_very_remote, price_remote, price_national)
           else price_national end
  from public.support_items where item_number = p_item
$$;

-- Latest pay rate effective on a date: exact band, else 'any'.
create or replace function public.pay_rate_for(p_level text, p_band text, p_on date)
returns public.pay_rates language sql stable as $$
  select r.* from public.pay_rates r
  where r.worker_level = p_level and r.time_band in (p_band, 'any') and r.effective_from <= p_on
  order by (r.time_band = p_band) desc, r.effective_from desc
  limit 1
$$;
