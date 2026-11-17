-- CareHub: NDIS cost code master data
create table if not exists public.cost_codes (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  description          text not null,
  support_category     text,
  weekday_rate         numeric(8,2),
  evening_rate         numeric(8,2),
  saturday_rate        numeric(8,2),
  sunday_rate          numeric(8,2),
  public_holiday_rate  numeric(8,2),
  ndis_price           numeric(8,2),
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists cost_codes_code_idx on public.cost_codes (code);
create index if not exists cost_codes_category_idx on public.cost_codes (support_category);

alter publication supabase_realtime add table public.cost_codes;
