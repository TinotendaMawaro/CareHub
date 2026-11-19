-- Shift extras: rich instructions with attachments, sign-off signatures, trips, correcting
-- progress notes, per-staff times and extra billable charges on group shifts, and asking
-- staff to confirm a shift.

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
alter table public.shifts
  add column if not exists require_client_signature boolean not null default false,
  add column if not exists require_worker_signature boolean not null default false,
  add column if not exists confirmation_required boolean not null default false;

alter table public.shift_workers
  add column if not exists planned_start timestamptz,
  add column if not exists planned_end timestamptz,
  add column if not exists confirmation text check (confirmation in ('pending', 'confirmed')),
  add column if not exists responded_at timestamptz;
alter table public.shift_workers drop constraint if exists shift_workers_planned_check;
alter table public.shift_workers add constraint shift_workers_planned_check
  check ((planned_start is null) = (planned_end is null) and (planned_end is null or planned_end > planned_start));

alter table public.shift_notes
  add column if not exists original_note text,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null;

alter table public.mileage
  add column if not exists trip_kind text check (trip_kind in ('to_shift', 'in_shift', 'return')),
  add column if not exists odometer_start numeric,
  add column if not exists odometer_end numeric;

-- ---------------------------------------------------------------------------
-- Attachments on the shift instructions (files live in the private 'shift-files' bucket
-- under {shift id}/...). Staff on the shift can read them; the office manages them.
-- ---------------------------------------------------------------------------
create table if not exists public.shift_attachments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  path text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  size_bytes int not null check (size_bytes between 1 and 15728640),
  mime text not null,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 1) = shift_id::text)
);
create index if not exists shift_attachments_shift_idx on public.shift_attachments (shift_id);
alter table public.shift_attachments enable row level security;
drop policy if exists shift_attachments_read on public.shift_attachments;
create policy shift_attachments_read on public.shift_attachments for select to authenticated
  using (public.is_office() or public.is_worker_on(shift_id));
drop policy if exists shift_attachments_write on public.shift_attachments;
create policy shift_attachments_write on public.shift_attachments for all to authenticated
  using (public.is_office()) with check (public.is_office());

do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    insert into storage.buckets (id, name, public) values ('shift-files', 'shift-files', false) on conflict (id) do nothing;
  else
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('shift-files', 'shift-files', false, 15728640, array[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf', 'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  end if;
  execute 'drop policy if exists shift_files_office on storage.objects';
  execute $p$create policy shift_files_office on storage.objects for all to authenticated
             using (bucket_id = 'shift-files' and public.is_office())
             with check (bucket_id = 'shift-files' and public.is_office())$p$;
  execute 'drop policy if exists shift_files_worker_read on storage.objects';
  execute $p$create policy shift_files_worker_read on storage.objects for select to authenticated
             using (bucket_id = 'shift-files' and exists (
               select 1 from public.shift_workers sw
                where sw.shift_id::text = (storage.foldername(storage.objects.name))[1]
                  and sw.caregiver_id = public.current_caregiver_id()))$p$;
end $$;

-- ---------------------------------------------------------------------------
-- Signatures captured on the phone when the shift ends. Strokes are SVG path data
-- (moves and lines only), so they render anywhere without running anything.
-- ---------------------------------------------------------------------------
create table if not exists public.shift_signatures (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  caregiver_id uuid not null references public.caregivers(id) on delete cascade,
  signer text not null check (signer in ('client', 'worker')),
  signer_name text not null check (char_length(trim(signer_name)) between 1 and 120),
  strokes text not null check (char_length(strokes) between 4 and 60000 and strokes ~ '^[MLml0-9 .,-]+$'),
  width int not null check (width between 50 and 4000),
  height int not null check (height between 50 and 4000),
  signed_at timestamptz not null default now(),
  unique (shift_id, caregiver_id, signer)
);
alter table public.shift_signatures enable row level security;
drop policy if exists shift_signatures_read on public.shift_signatures;
create policy shift_signatures_read on public.shift_signatures for select to authenticated
  using (public.is_office() or caregiver_id = public.current_caregiver_id());

create or replace function public.sign_shift(p_shift uuid, p_signer text, p_name text, p_strokes text,
                                             p_width int, p_height int)
returns uuid language plpgsql security definer set search_path = public as $$
declare cg uuid := public.current_caregiver_id(); w public.shift_workers%rowtype; v_id uuid;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  select * into w from public.shift_workers where shift_id = p_shift and caregiver_id = cg;
  if not found then raise exception 'not_assigned: you are not assigned to this shift'; end if;
  if w.clock_in_time is null then raise exception 'not_started: start the shift before signing'; end if;
  if w.clock_out_time is not null then raise exception 'already_ended: this shift has ended'; end if;
  if p_signer not in ('client', 'worker') then raise exception 'invalid: signer must be client or worker'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'invalid: type the name of the person signing'; end if;
  insert into public.shift_signatures (shift_id, caregiver_id, signer, signer_name, strokes, width, height)
  values (p_shift, cg, p_signer, trim(p_name), p_strokes, p_width, p_height)
  on conflict (shift_id, caregiver_id, signer) do update
    set signer_name = excluded.signer_name, strokes = excluded.strokes, width = excluded.width,
        height = excluded.height, signed_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Extra billable charges per client on a shift (equipment, a one-off service...).
-- Billing only: they add invoice lines, never hours or pay.
-- ---------------------------------------------------------------------------
create table if not exists public.shift_charges (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  item_number text not null references public.support_items(item_number),
  description text check (char_length(description) <= 200),
  quantity numeric not null check (quantity > 0 and quantity <= 1000),
  unit_price numeric not null check (unit_price >= 0),
  invoice_line_id uuid references public.invoice_lines(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists shift_charges_shift_idx on public.shift_charges (shift_id);
alter table public.shift_charges enable row level security;
drop policy if exists shift_charges_read on public.shift_charges;
create policy shift_charges_read on public.shift_charges for select to authenticated using (public.is_office());

create or replace function public.add_shift_charge(p_shift uuid, p_clients uuid[], p_item text, p_quantity numeric,
                                                   p_description text default null, p_unit_price numeric default null)
returns int language plpgsql security definer set search_path = public as $$
declare s public.shifts%rowtype; n int;
begin
  perform public.require_office();
  select * into s from public.shifts where id = p_shift;
  if not found or s.deleted then raise exception 'not_found: shift does not exist'; end if;
  if s.approved_at is not null then raise exception 'shift_locked: this shift is approved. Remove the approval to edit it.'; end if;
  if not exists (select 1 from public.support_items where item_number = p_item) then
    raise exception 'invalid: choose a price guide item';
  end if;
  if coalesce(p_quantity, 0) <= 0 then raise exception 'invalid: quantity must be more than 0'; end if;
  if p_unit_price is not null and p_unit_price < 0 then raise exception 'invalid: price cannot be negative'; end if;
  if exists (select 1 from unnest(p_clients) c where not exists
               (select 1 from public.shift_clients sc where sc.shift_id = p_shift and sc.client_id = c)) then
    raise exception 'invalid: every client must be on this shift';
  end if;
  insert into public.shift_charges (shift_id, client_id, item_number, description, quantity, unit_price)
  select p_shift, cl.id, p_item, nullif(trim(p_description), ''), p_quantity,
         coalesce(p_unit_price, public.item_rate(p_item, cl.price_region), 0)
    from public.clients cl where cl.id = any (p_clients);
  get diagnostics n = row_count;
  perform public.log_activity(p_shift, 'charge_added', null,
    jsonb_build_object('item', p_item, 'quantity', p_quantity, 'clients', n));
  return n;
end $$;

create or replace function public.remove_shift_charge(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.shift_charges%rowtype;
begin
  perform public.require_office();
  select * into c from public.shift_charges where id = p_id;
  if not found then return; end if;
  if c.invoice_line_id is not null then raise exception 'shift_invoiced: this charge has been invoiced'; end if;
  if public.shift_is_locked(c.shift_id) then raise exception 'shift_locked: this shift is approved. Remove the approval to edit it.'; end if;
  delete from public.shift_charges where id = p_id;
  perform public.log_activity(c.shift_id, 'charge_removed', null, jsonb_build_object('item', c.item_number));
end $$;

-- ---------------------------------------------------------------------------
-- Per-staff times on a shift (a group shift where one worker leaves early...).
-- Pay and the clock-in window follow the worker's own times.
-- ---------------------------------------------------------------------------
create or replace function public.set_worker_times(p_shift uuid, p_caregiver uuid, p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shifts%rowtype;
begin
  perform public.require_office();
  select * into s from public.shifts where id = p_shift;
  if not found or s.deleted then raise exception 'not_found: shift does not exist'; end if;
  if s.approved_at is not null then raise exception 'shift_locked: this shift is approved. Remove the approval to edit it.'; end if;
  if (p_start is null) <> (p_end is null) then raise exception 'invalid: give both a start and an end time'; end if;
  if p_start is not null and (p_end <= p_start or p_start < s.start_time or p_end > s.end_time) then
    raise exception 'invalid: staff times must fall inside the shift (% to %)',
      to_char(s.start_time at time zone public.org_tz(), 'HH24:MI'), to_char(s.end_time at time zone public.org_tz(), 'HH24:MI');
  end if;
  -- the shift's own times are the same as "no own times"
  if p_start = s.start_time and p_end = s.end_time then p_start := null; p_end := null; end if;
  update public.shift_workers set planned_start = p_start, planned_end = p_end
   where shift_id = p_shift and caregiver_id = p_caregiver;
  if not found then raise exception 'not_assigned: that person is not on this shift'; end if;
  perform public.log_activity(p_shift, 'worker_times_set', null,
    jsonb_build_object('caregiver_id', p_caregiver, 'start', p_start, 'end', p_end));
end $$;

create or replace function public.compute_worker_pay(p_shift uuid, p_caregiver uuid, p_hours numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  s public.shifts%rowtype; w public.shift_workers%rowtype; lvl text; st text;
  v_start timestamptz; v_end timestamptz; seg record; rate public.pay_rates; total numeric := 0; raw numeric := 0;
begin
  select * into s from public.shifts where id = p_shift;
  select * into w from public.shift_workers where shift_id = p_shift and caregiver_id = p_caregiver;
  select worker_level into lvl from public.caregivers where id = p_caregiver;
  select coalesce(cl.state, (select state from public.organisation limit 1)) into st
    from public.clients cl where cl.id = s.client_id;

  if s.is_sleepover then
    rate := public.pay_rate_for(lvl, 'any', s.date);
    return coalesce(rate.each_rate, rate.hourly_rate * p_hours, 0);
  end if;

  v_start := coalesce(w.clock_in_time, w.planned_start, s.start_time);
  v_end   := coalesce(w.clock_out_time, w.planned_end, s.end_time);
  for seg in select * from public.band_segments(v_start, v_end, st) loop
    rate := public.pay_rate_for(lvl, seg.band, (seg.seg_start at time zone public.org_tz())::date);
    total := total + extract(epoch from (seg.seg_end - seg.seg_start)) / 3600.0 * coalesce(rate.hourly_rate, 0);
    raw   := raw   + extract(epoch from (seg.seg_end - seg.seg_start)) / 3600.0;
  end loop;
  if raw > 0 and p_hours is not null then total := total * (p_hours / raw); end if;
  return round(total, 2);
end $$;

-- ---------------------------------------------------------------------------
-- Confirmation: when a shift asks for it, newly assigned staff start as 'pending'
-- and confirm or decline in the app. Declining frees the slot and tells the office.
-- ---------------------------------------------------------------------------
create or replace function public.trg_shift_workers_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.confirmation is null
     and coalesce((select confirmation_required from public.shifts where id = new.shift_id), false) then
    new.confirmation := 'pending';
  end if;
  if tg_op = 'UPDATE' and old.approved_at is not null and new.approved_at is not null and pg_trigger_depth() = 1 and (
       new.clock_in_time is distinct from old.clock_in_time or new.clock_out_time is distinct from old.clock_out_time
       or new.break_minutes is distinct from old.break_minutes) then
    raise exception 'shift_locked: this shift is approved. Remove the approval to edit it.' using errcode = 'P0001';
  end if;
  if new.clock_in_time is not null and new.clock_out_time is not null then
    if new.clock_out_time <= new.clock_in_time then
      raise exception 'invalid_times: clock out must be after clock in' using errcode = 'P0001';
    end if;
    new.hours_worked := round(greatest(extract(epoch from (new.clock_out_time - new.clock_in_time)) / 3600.0
                                       - new.break_minutes / 60.0, 0), 2);
  else
    new.hours_worked := null;
  end if;
  return new;
end $$;

create or replace function public.trg_notify_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; s public.shifts%rowtype;
begin
  select user_id into uid from public.caregivers where id = new.caregiver_id;
  if uid is null then return null; end if;
  select * into s from public.shifts where id = new.shift_id;
  insert into public.notifications (user_id, title, message, type, data)
  values (uid, case when new.confirmation = 'pending' then 'Please confirm a shift' else 'New shift' end,
          'You have a shift on ' || to_char(s.start_time at time zone public.org_tz(), 'Dy DD Mon HH24:MI') ||
          case when new.confirmation = 'pending' then '. Open the app to confirm or decline.' else '' end,
          'shift', jsonb_build_object('shift_id', new.shift_id, 'confirm', new.confirmation = 'pending'));
  return null;
end $$;

create or replace function public.accept_offered_shift(p_shift uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cg uuid := public.current_caregiver_id(); s public.shifts%rowtype;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  select * into s from public.shifts where id = p_shift for update;
  if not found or s.deleted or s.shift_publish_state is distinct from 'offered' or s.caregiver_id is not null then
    raise exception 'unavailable: this shift is no longer available';
  end if;
  if public.worker_clash(cg, s.start_time, s.end_time, s.id) is not null then
    raise exception 'worker_clash: you already have a shift that overlaps this one';
  end if;
  -- picking up an open shift is itself a confirmation
  insert into public.shift_workers (shift_id, caregiver_id, role, confirmation, responded_at)
  values (p_shift, cg, 'primary', case when s.confirmation_required then 'confirmed' end,
          case when s.confirmation_required then now() end);
  update public.shifts set shift_publish_state = 'accepted' where id = p_shift;
  update public.shift_offers set state = 'accepted', responded_at = now(), caregiver_id = cg
   where shift_id = p_shift and state = 'offered';
end $$;

create or replace function public.respond_to_shift(p_shift uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cg uuid := public.current_caregiver_id(); w public.shift_workers%rowtype; s public.shifts%rowtype; v_name text;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  select * into w from public.shift_workers where shift_id = p_shift and caregiver_id = cg for update;
  if not found then raise exception 'not_assigned: you are not assigned to this shift'; end if;
  if w.confirmation is distinct from 'pending' then raise exception 'not_pending: this shift does not need a reply'; end if;
  if w.clock_in_time is not null then raise exception 'already_started: you have already started this shift'; end if;
  select * into s from public.shifts where id = p_shift;
  select name into v_name from public.caregivers where id = cg;
  if p_accept then
    update public.shift_workers set confirmation = 'confirmed', responded_at = now()
     where shift_id = p_shift and caregiver_id = cg;
    perform public.log_activity(p_shift, 'shift_confirmed', null, jsonb_build_object('caregiver_id', cg));
  else
    delete from public.shift_workers where shift_id = p_shift and caregiver_id = cg;
    perform public.log_activity(p_shift, 'shift_declined', nullif(trim(p_reason), ''), jsonb_build_object('caregiver_id', cg));
    insert into public.notifications (user_id, title, message, type, data)
    select p.id, 'Shift declined',
           coalesce(v_name, 'A support worker') || ' declined the shift on ' ||
           to_char(s.start_time at time zone public.org_tz(), 'Dy DD Mon HH24:MI') ||
           coalesce(': ' || nullif(trim(p_reason), ''), '') || '. It needs someone new.',
           'shift', jsonb_build_object('shift_id', p_shift)
      from public.profiles p where p.role in ('admin', 'manager', 'office') and coalesce(p.active, true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Shift details: add the sign-off and confirmation switches.
-- ---------------------------------------------------------------------------
create or replace function public.set_shift_details(p_ids uuid[], p jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int; sid uuid; t jsonb; i int;
begin
  perform public.require_office();
  if p ? 'bonus_amount' and coalesce(nullif(p->>'bonus_amount','')::numeric, 0) < 0 then
    raise exception 'invalid: the bonus cannot be negative';
  end if;
  if p ? 'planned_break_minutes' and coalesce(nullif(p->>'planned_break_minutes','')::int, 0) not between 0 and 720 then
    raise exception 'invalid: breaks must be between 0 and 720 minutes';
  end if;
  if p ? 'notes' and char_length(coalesce(p->>'notes', '')) > 10000 then
    raise exception 'invalid: instructions are limited to 10,000 characters';
  end if;

  with u as (
    update public.shifts s set
      shift_type_id = case when p ? 'shift_type_id' then nullif(p->>'shift_type_id','')::uuid else s.shift_type_id end,
      bonus_amount = case when p ? 'bonus_amount' then coalesce(nullif(p->>'bonus_amount','')::numeric, 0) else s.bonus_amount end,
      planned_break_minutes = case when p ? 'planned_break_minutes' then coalesce(nullif(p->>'planned_break_minutes','')::int, 0) else s.planned_break_minutes end,
      break_paid = case when p ? 'break_paid' then coalesce((p->>'break_paid')::boolean, false) else s.break_paid end,
      address = case when p ? 'address' then nullif(trim(p->>'address'), '') else s.address end,
      dropoff_address = case when p ? 'dropoff_address' then nullif(trim(p->>'dropoff_address'), '') else s.dropoff_address end,
      notes = case when p ? 'notes' then nullif(p->>'notes', '') else s.notes end,
      require_client_signature = case when p ? 'require_client_signature' then coalesce((p->>'require_client_signature')::boolean, false) else s.require_client_signature end,
      require_worker_signature = case when p ? 'require_worker_signature' then coalesce((p->>'require_worker_signature')::boolean, false) else s.require_worker_signature end,
      confirmation_required = case when p ? 'confirmation_required' then coalesce((p->>'confirmation_required')::boolean, false) else s.confirmation_required end
     where s.id = any (p_ids) and not s.deleted and s.approved_at is null
    returning s.id)
  select count(*) into n from u;

  if p ? 'confirmation_required' then
    if coalesce((p->>'confirmation_required')::boolean, false) then
      -- staff already on the shift who have not started are asked to confirm
      with asked as (
        update public.shift_workers w set confirmation = 'pending', responded_at = null
          from public.shifts s
         where s.id = w.shift_id and s.id = any (p_ids) and not s.deleted and s.approved_at is null
           and w.confirmation is null and w.clock_in_time is null
        returning w.caregiver_id, s.id as shift_id, s.start_time)
      insert into public.notifications (user_id, title, message, type, data)
      select c.user_id, 'Please confirm a shift',
             'You have a shift on ' || to_char(a.start_time at time zone public.org_tz(), 'Dy DD Mon HH24:MI') ||
             '. Open the app to confirm or decline.', 'shift', jsonb_build_object('shift_id', a.shift_id, 'confirm', true)
        from asked a join public.caregivers c on c.id = a.caregiver_id where c.user_id is not null;
    else
      update public.shift_workers set confirmation = null
       where shift_id = any (p_ids) and confirmation = 'pending';
    end if;
  end if;

  if p ? 'tasks' and jsonb_typeof(p->'tasks') = 'array' then
    foreach sid in array p_ids loop
      continue when not exists (select 1 from public.shifts where id = sid and not deleted and approved_at is null);
      delete from public.shift_tasks st
       where st.shift_id = sid
         and not exists (select 1 from jsonb_array_elements(p->'tasks') e where trim(e->>'label') = st.label);
      i := 0;
      for t in select * from jsonb_array_elements(p->'tasks') loop
        continue when coalesce(trim(t->>'label'), '') = '';
        insert into public.shift_tasks (shift_id, label, mandatory, sort)
        values (sid, trim(t->>'label'), coalesce((t->>'mandatory')::boolean, false), i)
        on conflict (shift_id, label) do update set mandatory = excluded.mandatory, sort = excluded.sort;
        i := i + 1;
      end loop;
    end loop;
  end if;

  if n > 0 then
    perform public.log_activity(case when cardinality(p_ids) = 1 then p_ids[1] end, 'shift_details_updated', null,
      jsonb_build_object('count', n, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p) k)));
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Start and end: the worker's own times, auto-confirm on start, signatures on end.
-- ---------------------------------------------------------------------------
create or replace function public.start_shift(p_shift uuid, p_lat double precision default null,
                                              p_lng double precision default null, p_accuracy numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cg uuid := public.current_caregiver_id();
  s public.shifts%rowtype; w public.shift_workers%rowtype; o public.organisation%rowtype;
  tgt record; v_req boolean; dist double precision; v_start timestamptz; v_end timestamptz;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  select * into s from public.shifts where id = p_shift;
  select * into w from public.shift_workers where shift_id = p_shift and caregiver_id = cg for update;
  if not found or s.deleted then raise exception 'not_assigned: you are not assigned to this shift'; end if;
  if s.status = 'Cancelled' then raise exception 'cancelled: this shift was cancelled'; end if;
  if w.clock_in_time is not null then raise exception 'already_started: you have already started this shift'; end if;
  select * into o from public.organisation limit 1;
  v_start := coalesce(w.planned_start, s.start_time);
  v_end := coalesce(w.planned_end, s.end_time);

  if now() < v_start - make_interval(mins => o.clock_in_early_minutes) then
    raise exception 'too_early: you can start this shift from % (% minutes before it begins)',
      to_char((v_start - make_interval(mins => o.clock_in_early_minutes)) at time zone o.timezone, 'HH24:MI'),
      o.clock_in_early_minutes;
  end if;
  if now() > v_end then
    raise exception 'too_late: this shift has already ended. Ask the office to record your time.';
  end if;

  v_req := coalesce(s.geofence_required, o.default_geofence_required);
  select * into tgt from public.shift_geofence_target(p_shift);
  if tgt.lat is not null and p_lat is not null and p_lng is not null then
    dist := public.haversine_m(p_lat, p_lng, tgt.lat, tgt.lng);
  end if;
  if v_req then
    if tgt.lat is null then
      raise exception 'no_client_location: the participant has no address coordinates saved. Ask the office to fix this or turn off location checks for this shift.';
    end if;
    if p_lat is null or p_lng is null then
      raise exception 'location_required: turn on location services so we can confirm you are at %', tgt.label;
    end if;
    if dist > tgt.radius_m then
      raise exception 'outside_geofence: you are % m from % (must be within % m)',
        round(dist), tgt.label, tgt.radius_m;
    end if;
  end if;

  -- turning up is a confirmation
  update public.shift_workers set clock_in_time = now(), clock_in_lat = p_lat, clock_in_lng = p_lng,
         clock_in_distance_m = round(dist)::int,
         confirmation = case when confirmation = 'pending' then 'confirmed' else confirmation end,
         responded_at = case when confirmation = 'pending' then now() else responded_at end
   where shift_id = p_shift and caregiver_id = cg;
  if p_lat is not null then
    insert into public.locations (caregiver_id, lat, lng, accuracy) values (cg, p_lat, p_lng, p_accuracy);
  end if;
  update public.caregivers set current_shift_id = p_shift, availability = 'On Shift',
         evv_compliance = case when v_req and dist is not null then 'On Location' else evv_compliance end
   where id = cg;
  return jsonb_build_object('clock_in_time', now(), 'distance_m', round(dist), 'geofence_checked', v_req);
end $$;

create or replace function public.end_shift(p_shift uuid, p_lat double precision default null,
                                            p_lng double precision default null, p_break_minutes integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cg uuid := public.current_caregiver_id();
  s public.shifts%rowtype; w public.shift_workers%rowtype; o public.organisation%rowtype;
  tgt record; dist double precision; missing text; hrs numeric;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  select * into s from public.shifts where id = p_shift;
  select * into w from public.shift_workers where shift_id = p_shift and caregiver_id = cg for update;
  if not found then raise exception 'not_assigned: you are not assigned to this shift'; end if;
  if w.clock_in_time is null then raise exception 'not_started: start the shift before ending it'; end if;
  if w.clock_out_time is not null then raise exception 'already_ended: you have already ended this shift'; end if;
  if coalesce(p_break_minutes, 0) < 0 then raise exception 'invalid: break minutes cannot be negative'; end if;
  select * into o from public.organisation limit 1;

  select * into tgt from public.shift_geofence_target(p_shift);
  if tgt.lat is not null and p_lat is not null and p_lng is not null then
    dist := public.haversine_m(p_lat, p_lng, tgt.lat, tgt.lng);
  end if;
  if o.enforce_geofence_on_end and coalesce(s.geofence_required, o.default_geofence_required)
     and s.dropoff_address is null then
    if dist is null then raise exception 'location_required: turn on location services to end this shift'; end if;
    if dist > tgt.radius_m then
      raise exception 'outside_geofence: you are % m from % (must be within % m)', round(dist), tgt.label, tgt.radius_m;
    end if;
  end if;

  select string_agg(t.label, ', ' order by t.sort) into missing
    from public.shift_tasks t where t.shift_id = p_shift and t.mandatory and t.done_at is null;
  if missing is not null then
    raise exception 'tasks_required: tick off the required tasks first: %', missing;
  end if;

  -- Client sign-off applies to 1:1 shifts only.
  if s.require_client_signature and (select count(*) from public.shift_clients where shift_id = p_shift) = 1
     and not exists (select 1 from public.shift_signatures where shift_id = p_shift and caregiver_id = cg and signer = 'client') then
    raise exception 'signature_required: ask the client to sign before ending the shift';
  end if;
  if s.require_worker_signature
     and not exists (select 1 from public.shift_signatures where shift_id = p_shift and caregiver_id = cg and signer = 'worker') then
    raise exception 'signature_required: sign the shift yourself before ending it';
  end if;

  if o.require_note_on_end then
    select string_agg(c.first_name || ' ' || c.last_name, ', ') into missing
      from public.shift_clients sc join public.clients c on c.id = sc.client_id
     where sc.shift_id = p_shift
       and not exists (select 1 from public.shift_notes n
                       where n.shift_id = p_shift and n.client_id = sc.client_id and n.caregiver_id = cg);
    if missing is not null then
      raise exception 'notes_required: write a shift note for % before ending the shift', missing;
    end if;
  end if;

  if now() - w.clock_in_time < make_interval(mins => coalesce(p_break_minutes, 0)) then
    raise exception 'invalid: break is longer than the time worked';
  end if;

  update public.shift_workers set clock_out_time = now(), clock_out_lat = p_lat, clock_out_lng = p_lng,
         clock_out_distance_m = round(dist)::int, break_minutes = coalesce(p_break_minutes, 0)
   where shift_id = p_shift and caregiver_id = cg
   returning hours_worked into hrs;

  update public.caregivers set current_shift_id = null, availability = 'Available'
   where id = cg and current_shift_id = p_shift;
  return jsonb_build_object('clock_out_time', now(), 'hours_worked', hrs);
end $$;

-- ---------------------------------------------------------------------------
-- Trips logged against a shift (travel to it, during it, and home).
-- ---------------------------------------------------------------------------
create or replace function public.log_trip(p_shift uuid, p_kind text, p_km numeric default null,
                                           p_vehicle text default null, p_purpose text default null,
                                           p_odometer_start numeric default null, p_odometer_end numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare cg uuid := public.current_caregiver_id(); s public.shifts%rowtype; v_km numeric := p_km; v_id uuid;
begin
  if cg is null then raise exception 'forbidden: no support worker profile for this account' using errcode = '42501'; end if;
  if not public.is_worker_on(p_shift) then raise exception 'not_assigned: you are not assigned to this shift'; end if;
  if public.shift_is_locked(p_shift) then raise exception 'shift_locked: this shift is approved. Ask the office to add the trip.'; end if;
  if p_kind not in ('to_shift', 'in_shift', 'return') then raise exception 'invalid: choose when the trip happened'; end if;
  if p_odometer_start is not null or p_odometer_end is not null then
    if p_odometer_start is null or p_odometer_end is null or p_odometer_end <= p_odometer_start then
      raise exception 'invalid: the end odometer reading must be more than the start';
    end if;
    v_km := p_odometer_end - p_odometer_start;
  end if;
  if coalesce(v_km, 0) <= 0 or v_km > 2000 then raise exception 'invalid: enter a distance between 0 and 2000 km'; end if;
  select * into s from public.shifts where id = p_shift;
  insert into public.mileage (caregiver_id, client_id, shift_id, distance, unit, date, purpose, vehicle_type,
                              trip_kind, odometer_start, odometer_end)
  values (cg, s.client_id, p_shift, round(v_km, 1), 'km', s.date, nullif(trim(p_purpose), ''),
          coalesce(nullif(trim(p_vehicle), ''), 'Own car'), p_kind, p_odometer_start, p_odometer_end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_trip(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.mileage%rowtype;
begin
  select * into m from public.mileage where id = p_id;
  if not found then return; end if;
  if not (public.is_office() or m.caregiver_id = public.current_caregiver_id()) then
    raise exception 'forbidden: you can only remove your own trips' using errcode = '42501';
  end if;
  if m.shift_id is not null and public.shift_is_locked(m.shift_id) then
    raise exception 'shift_locked: this shift is approved. Remove the approval to change trips.';
  end if;
  delete from public.mileage where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Correcting a progress note. The original wording is kept; invoices read the note
-- live, so an unsent invoice shows the correction. Sent or paid invoices are final.
-- ---------------------------------------------------------------------------
create or replace function public.edit_shift_note(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare n public.shift_notes%rowtype;
begin
  select * into n from public.shift_notes where id = p_id for update;
  if not found then raise exception 'not_found: note does not exist'; end if;
  if not (public.is_office() or n.caregiver_id = public.current_caregiver_id()) then
    raise exception 'forbidden: only the office or the author can edit this note' using errcode = '42501';
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'invalid: the note cannot be empty'; end if;
  if n.shift_id is not null and exists (
       select 1 from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
        where l.shift_id = n.shift_id and i.status in ('sent', 'paid')) then
    raise exception 'invoice_sent: this shift is on an invoice that has been sent, so its notes are final';
  end if;
  if not public.is_office() and n.shift_id is not null and public.shift_is_locked(n.shift_id) then
    raise exception 'shift_locked: this shift is approved. Ask the office to correct the note.';
  end if;
  if trim(p_note) = n.note then return; end if;
  update public.shift_notes set original_note = coalesce(original_note, note), note = trim(p_note),
         edited_at = now(), edited_by = auth.uid()
   where id = p_id;
  perform public.log_activity(n.shift_id, 'note_edited', null, jsonb_build_object('note_id', p_id, 'client_id', n.client_id));
end $$;

-- ---------------------------------------------------------------------------
-- Invoices: bill extra charges, and release them again when an invoice is voided.
-- ---------------------------------------------------------------------------
create or replace function public.generate_invoices(p_from date, p_to date, p_client_ids uuid[] default null)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  o public.organisation%rowtype; cancel_pct numeric; tz text; c record; inv uuid; ids uuid[] := '{}';
  seg record; ch record; line uuid; v_sub numeric; v_gst numeric; amt numeric; price numeric; nm text;
begin
  perform public.require_office();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'invalid: choose a valid date range'; end if;
  select * into o from public.organisation limit 1;
  select cancellation_billable_percent into cancel_pct from public.settings_payroll;
  tz := o.timezone;

  for c in
    select ss.client_id from public.shift_segments ss join public.shifts s on s.id = ss.shift_id
    where ss.invoice_line_id is null and s.approved_at is not null and not s.deleted
      and (s.status <> 'Cancelled' or (s.cancel_pay and cancel_pct > 0))
      and (ss.seg_start at time zone tz)::date between p_from and p_to
      and (p_client_ids is null or ss.client_id = any (p_client_ids))
    union
    select sc.client_id from public.shift_charges sc join public.shifts s on s.id = sc.shift_id
    where sc.invoice_line_id is null and s.approved_at is not null and not s.deleted and s.status <> 'Cancelled'
      and (s.start_time at time zone tz)::date between p_from and p_to
      and (p_client_ids is null or sc.client_id = any (p_client_ids))
  loop
    insert into public.invoices (number, client_id, period_start, period_end, due_date, created_by)
    values (o.invoice_prefix || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0'),
            c.client_id, p_from, p_to, current_date + o.invoice_terms_days, auth.uid())
    returning id into inv;

    v_sub := 0;
    for seg in
      select ss.*, s.status, si.name as item_name from public.shift_segments ss
      join public.shifts s on s.id = ss.shift_id join public.support_items si on si.item_number = ss.item_number
      where ss.client_id = c.client_id and ss.invoice_line_id is null and s.approved_at is not null and not s.deleted
        and (s.status <> 'Cancelled' or (s.cancel_pay and cancel_pct > 0))
        and (ss.seg_start at time zone tz)::date between p_from and p_to
      order by ss.seg_start
    loop
      price := case when seg.status = 'Cancelled' then round(seg.bill_rate * cancel_pct / 100, 2) else seg.bill_rate end;
      amt := round(seg.units * price, 2);
      nm := to_char(seg.seg_start at time zone tz, 'DD Mon YYYY HH24:MI') || '-' ||
            to_char(seg.seg_end at time zone tz, 'HH24:MI') || ' ' || seg.item_name ||
            case when seg.status = 'Cancelled' then ' (short-notice cancellation)' else '' end;
      insert into public.invoice_lines (invoice_id, shift_id, segment_id, item_number, description, quantity, unit_price, amount)
      values (inv, seg.shift_id, seg.id, seg.item_number, nm, seg.units, price, amt) returning id into line;
      update public.shift_segments set invoice_line_id = line where id = seg.id;
      v_sub := v_sub + amt;
    end loop;

    for ch in
      select sc.*, s.start_time, si.name as item_name from public.shift_charges sc
      join public.shifts s on s.id = sc.shift_id join public.support_items si on si.item_number = sc.item_number
      where sc.client_id = c.client_id and sc.invoice_line_id is null and s.approved_at is not null and not s.deleted
        and s.status <> 'Cancelled' and (s.start_time at time zone tz)::date between p_from and p_to
      order by s.start_time, sc.created_at
    loop
      amt := round(ch.quantity * ch.unit_price, 2);
      nm := to_char(ch.start_time at time zone tz, 'DD Mon YYYY') || ' ' || coalesce(ch.description, ch.item_name) ||
            ' (additional charge)';
      insert into public.invoice_lines (invoice_id, shift_id, item_number, description, quantity, unit_price, amount)
      values (inv, ch.shift_id, ch.item_number, nm, ch.quantity, ch.unit_price, amt) returning id into line;
      update public.shift_charges set invoice_line_id = line where id = ch.id;
      v_sub := v_sub + amt;
    end loop;

    v_gst := round(v_sub * o.gst_rate, 2);
    update public.invoices set subtotal = v_sub, gst_amount = v_gst, total = v_sub + v_gst where id = inv;
    ids := ids || inv;
  end loop;
  return ids;
end $$;

create or replace function public.void_invoice(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare i public.invoices%rowtype;
begin
  perform public.require_office();
  if coalesce(trim(p_reason), '') = '' then raise exception 'invalid: give a reason for voiding'; end if;
  select * into i from public.invoices where id = p_id for update;
  if not found then raise exception 'not_found: invoice does not exist'; end if;
  if i.status = 'void' then return; end if;
  if i.status = 'paid' then raise exception 'invalid: a paid invoice cannot be voided'; end if;
  update public.shift_segments set invoice_line_id = null
   where invoice_line_id in (select id from public.invoice_lines where invoice_id = p_id);
  update public.shift_charges set invoice_line_id = null
   where invoice_line_id in (select id from public.invoice_lines where invoice_id = p_id);
  update public.invoices set status = 'void', voided_at = now(), void_reason = p_reason where id = p_id;
end $$;

-- Progress notes for the shifts on an invoice, for the invoice view (office only).
create or replace function public.invoice_progress_notes(p_invoice uuid)
returns table (shift_id uuid, note text, author text, written_at timestamptz, edited_at timestamptz, edited_by_name text)
language sql stable security definer set search_path = public as $$
  select n.shift_id, n.note, cg.name, n.timestamp, n.edited_at,
         nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    from public.shift_notes n
    join public.invoices i on i.id = p_invoice and n.client_id = i.client_id
    left join public.caregivers cg on cg.id = n.caregiver_id
    left join public.profiles p on p.id = n.edited_by
   where public.is_office()
     and n.shift_id in (select l.shift_id from public.invoice_lines l where l.invoice_id = p_invoice)
   order by n.timestamp
$$;

-- ---------------------------------------------------------------------------
-- Grants and realtime
-- ---------------------------------------------------------------------------
grant execute on function public.sign_shift(uuid, text, text, text, int, int) to authenticated;
grant execute on function public.add_shift_charge(uuid, uuid[], text, numeric, text, numeric) to authenticated;
grant execute on function public.remove_shift_charge(uuid) to authenticated;
grant execute on function public.set_worker_times(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.respond_to_shift(uuid, boolean, text) to authenticated;
grant execute on function public.log_trip(uuid, text, numeric, text, text, numeric, numeric) to authenticated;
grant execute on function public.delete_trip(uuid) to authenticated;
grant execute on function public.edit_shift_note(uuid, text) to authenticated;
grant execute on function public.invoice_progress_notes(uuid) to authenticated;
grant select on public.shift_attachments, public.shift_signatures, public.shift_charges to authenticated;
grant insert, update, delete on public.shift_attachments to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  begin alter publication supabase_realtime add table public.shift_signatures; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.shift_charges; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.shift_attachments; exception when duplicate_object then null; end;
end $$;
