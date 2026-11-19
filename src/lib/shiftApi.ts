/**
 * Shift scheduling API helpers.
 *
 * These expect the Phase 0 schema:
 * - shifts: start_time/end_time, support_family, is_sleepover, client_id, caregiver_id, status
 * - shift_segments, support_items, support_families, pay_rates, public_holidays
 * - client_caregivers join table
 *
 * Section 5 additions (unassigned shift workspace):
 * - shift_offers: tracks offered/viewed/accepted/declined states for published shifts
 * - notifications: admin notification rows for shift offers
 */

import { supabase } from '@/lib/supabase/client';

export const MAX_OCCURRENCES = 120;
export type Range = { start: string; end: string; date?: string };

export const ymd = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, local

export function personName(p?: any) {
  return p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed' : 'Unassigned';
}

/** Dates from startDate to until (inclusive) that fall on the chosen weekdays (0=Sun). */
export function expandDates(startDate: string, days: number[], until: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${until}T00:00:00`);
  for (; d <= end && out.length < MAX_OCCURRENCES; d.setDate(d.getDate() + 1)) {
    if (days.includes(d.getDay())) out.push(ymd(d));
  }
  return out;
}

/** Build ISO ranges. If end <= start the shift runs overnight into the next day. */
export function toRanges(dates: string[], startTime: string, endTime: string): Range[] {
  return dates.map((date) => {
    const s = new Date(`${date}T${startTime}`);
    const e = new Date(`${date}T${endTime}`);
    if (e <= s) e.setDate(e.getDate() + 1);
    return { date, start: s.toISOString(), end: e.toISOString() };
  });
}

/** Existing shifts of a worker that overlap any of the given ranges. */
export async function findClashes(caregiverId: string, ranges: Range[], ignoreShiftId?: string) {
  if (!caregiverId || ranges.length === 0) return [];
  const min = ranges.reduce((a, r) => (r.start < a ? r.start : a), ranges[0].start);
  const max = ranges.reduce((a, r) => (r.end > a ? r.end : a), ranges[0].end);
  const { data } = await supabase
    .from('shifts')
    .select('id, client_id, start_time, end_time')
    .eq('caregiver_id', caregiverId)
    .neq('status', 'Cancelled')
    .lt('start_time', max)
    .gt('end_time', min);

  return (data ?? []).filter(
    (s: any) => s.id !== ignoreShiftId &&
      ranges.some((r) => s.start_time < r.end && s.end_time > r.start)
  );
}

export async function createShifts(p: {
  clientId: string;
  caregiverId?: string | null;
  supportFamily?: string | null;
  isSleepover?: boolean;
  ranges: Range[];
  notes?: string;
}) {
  const series_id = p.ranges.length > 1 ? crypto.randomUUID() : null;
  const rows = p.ranges.map((r) => ({
    client_id: p.clientId,
    caregiver_id: p.caregiverId || null,
    support_family: p.supportFamily || null,
    is_sleepover: !!p.isSleepover,
    date: r.date ?? new Date(r.start).toISOString().slice(0, 10),
    start_time: r.start,
    end_time: r.end,
    status: 'Scheduled',
    shift_type: 'shift',
    series_id,
    notes: p.notes || null,
    allow_overlap: false,
    deleted: false,
  }));

  const { data, error } = await supabase.from('shifts').insert(rows).select('id');
  if (error) {
    const msg = error.message;
    if (msg.includes('no_worker_overlap') || msg.includes('overlap')) {
      throw new Error('This support worker is already booked at one of those times.');
    }
    throw new Error(msg);
  }
  return data ?? [];
}

/** Standing assignment. Also fills the participant's unassigned future shifts, skipping clashes. */
export async function assignWorker(clientId: string, caregiverId: string, fillShifts = true) {
  const { error } = await supabase.from('client_caregivers').upsert(
    {
      client_id: clientId,
      caregiver_id: caregiverId,
      unassigned_at: null,
      assigned_at: new Date().toISOString(),
    }
  );
  if (error) throw new Error(error.message);
  if (!fillShifts) return { filled: 0, skipped: 0 };

  const now = new Date().toISOString();
  const { data: open } = await supabase
    .from('shifts')
    .select('id, start_time, end_time')
    .eq('client_id', clientId)
    .is('caregiver_id', null)
    .eq('status', 'Scheduled')
    .gte('start_time', now);

  let filled = 0;
  let skipped = 0;
  for (const s of open ?? []) {
    const clash = await findClashes(caregiverId, [
      { start: s.start_time, end: s.end_time },
    ]);
    if (clash.length) {
      skipped++;
      continue;
    }
    const { error: e } = await supabase
      .from('shifts')
      .update({ caregiver_id: caregiverId })
      .eq('id', s.id);
    if (e) skipped++;
    else filled++;
  }
  return { filled, skipped };
}

/** Preview: which of the participant's open future shifts would clash for this worker. */
export async function previewAssign(clientId: string, caregiverId: string) {
  const now = new Date().toISOString();
  const { data: open } = await supabase
    .from('shifts')
    .select('id, start_time, end_time')
    .eq('client_id', clientId)
    .is('caregiver_id', null)
    .eq('status', 'Scheduled')
    .gte('start_time', now);

  const clashing: any[] = [];
  for (const s of open ?? []) {
    const c = await findClashes(caregiverId, [
      { start: s.start_time, end: s.end_time },
    ]);
    if (c.length) clashing.push(s);
  }
  return { open: open?.length ?? 0, clashing };
}

/** Ends the standing assignment; optionally clears the worker from that participant's future shifts. */
export async function unassignWorker(clientId: string, caregiverId: string, clearFuture: boolean) {
  const { error } = await supabase
    .from('client_caregivers')
    .update({ unassigned_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('caregiver_id', caregiverId);
  if (error) throw new Error(error.message);

  if (clearFuture) {
    await supabase
      .from('shifts')
      .update({ caregiver_id: null })
      .eq('client_id', clientId)
      .eq('caregiver_id', caregiverId)
      .eq('status', 'Scheduled')
      .gte('start_time', new Date().toISOString());
  }
}

export async function countFutureShifts(clientId: string, caregiverId: string) {
  const { count } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('caregiver_id', caregiverId)
    .eq('status', 'Scheduled')
    .gte('start_time', new Date().toISOString());
  return count ?? 0;
}

export async function fetchShiftsPage(p: {
  page: number;
  pageSize: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  clientId?: string;
  caregiverId?: string;
}) {
  const from = p.page * p.pageSize;
  const to = from + p.pageSize - 1;
  let builder = supabase
    .from('shifts')
    .select('*', { count: 'exact' })
    .order('start_time', { ascending: false })
    .range(from, to);

  if (p.search) {
    builder = builder.or(`status.ilike.%${p.search}%,notes.ilike.%${p.search}%`);
  }
  if (p.dateFrom) builder = builder.gte('start_time', p.dateFrom);
  if (p.dateTo) builder = builder.lte('start_time', p.dateTo);
  if (p.status) builder = builder.eq('status', p.status);
  if (p.clientId) builder = builder.eq('client_id', p.clientId);
  if (p.caregiverId) builder = builder.eq('caregiver_id', p.caregiverId);

  const { data, error, count } = await builder;
  if (error) throw new Error(error.message);
  return { items: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize };
}

export async function countFutureUnassigned(): Promise<number> {
  const { count } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .is('caregiver_id', null)
    .eq('status', 'Scheduled')
    .gte('start_time', new Date().toISOString());
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Section 5 helpers
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface WorkerSuggestion {
  caregiverId: string;
  name: string;
  avatarUrl: string | null;
  score: number;
  /** On the standing team of one of the shift's clients. */
  onTeam: boolean;
  /** Completed shifts with these clients. */
  pastShifts: number;
  hoursThisWeek: number;
  /** Plain-language reasons, e.g. "On Cara's team". */
  reasons: string[];
  // Kept for older callers.
  available: boolean;
  hasClash: boolean;
  inducted: boolean;
  preferred: boolean;
  distanceKm: number | null;
  availability: string;
}

/**
 * Ranked staff for a shift, from the database (suggest_staff): client team first, then
 * familiarity, then fewest hours this week. People double-booked or on leave are excluded.
 */
export async function findWorkerSuggestions(
  shift: { id: string },
  _caregivers: unknown[] = [],
  limit = 10
): Promise<WorkerSuggestion[]> {
  const { data, error } = await supabase.rpc('suggest_staff', { p_shift: shift.id, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    caregiverId: r.caregiver_id,
    name: r.name,
    avatarUrl: r.avatar_url ?? null,
    score: Number(r.score),
    onTeam: !!r.on_team,
    pastShifts: Number(r.past_shifts ?? 0),
    hoursThisWeek: Number(r.hours_this_week ?? 0),
    reasons: r.reasons ?? [],
    available: true,
    hasClash: false,
    inducted: !!r.on_team,
    preferred: Number(r.past_shifts ?? 0) > 0,
    distanceKm: null,
    availability: 'Available',
  }));
}

export async function publishShift(shiftId: string, adminId: string): Promise<boolean> {
  const { error: shiftErr } = await supabase
    .from('shifts')
    .update({ shift_publish_state: 'offered' })
    .eq('id', shiftId)
    .eq('status', 'Scheduled')
    .is('caregiver_id', null);

  if (shiftErr) return false;

  try {
    await supabase.from('shift_offers').insert({
      shift_id: shiftId,
      offered_by: adminId,
      state: 'offered',
      offered_at: new Date().toISOString(),
    });
  } catch {
    console.info('[shiftApi] shift_offers table not yet available — offer state stored on shift only.');
  }

  try {
    await supabase.from('notifications').insert({
      user_id: adminId,
      title: 'Shift published',
      message: `Unassigned shift ${shiftId} is now offered to workers.`,
      type: 'shift',
      read: false,
      data: { shiftId, state: 'offered' },
      timestamp: new Date().toISOString(),
    });
  } catch {
    console.info('[shiftApi] notifications insert skipped (table may not exist).');
  }

  return true;
}

export async function sendSmsToWorker(caregiverId: string, message: string): Promise<boolean> {
  const { data } = await supabase
    .from('caregivers')
    .select('name, phone')
    .eq('id', caregiverId)
    .maybeSingle();

  const name = data?.name ?? 'Unknown worker';
  console.info(`[SMS stub] SMS sent to ${name}: ${message}`);

  try {
    await supabase.from('activity_log').insert({
      shift_id: null,
      action: 'sms_sent',
      reason: `To ${name}: ${message}`,
      user_id: null,
      created_at: new Date().toISOString(),
    });
  } catch {
    console.info('[shiftApi] activity_log insert skipped (table may not exist).');
  }

  return true;
}
