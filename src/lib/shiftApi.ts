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

function weekStartISO(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

export interface WorkerSuggestion {
  caregiverId: string;
  name: string;
  score: number;
  available: boolean;
  hasClash: boolean;
  inducted: boolean;
  preferred: boolean;
  hoursThisWeek: number;
  distanceKm: number | null;
  availability: string;
}

export async function findWorkerSuggestions(
  shift: { id: string; clientId: string; startTime: string; endTime: string },
  caregivers: any[],
  limit = 10
): Promise<WorkerSuggestion[]> {
  if (!caregivers.length) return [];

  const nowISO = new Date().toISOString();
  const weekStart = weekStartISO();

  // Anyone already on an overlapping shift (as primary or support worker) is a clash.
  const { data: clashes } = await supabase
    .from('shift_workers')
    .select('caregiver_id, shifts!inner(id, start_time, end_time, status, deleted)')
    .neq('shifts.status', 'Cancelled')
    .eq('shifts.deleted', false)
    .lt('shifts.start_time', shift.endTime)
    .gt('shifts.end_time', shift.startTime);

  const clashSet = new Set<string>();
  (clashes ?? []).forEach((row: any) => {
    if (row.shifts?.id !== shift.id) clashSet.add(row.caregiver_id);
  });

  const { data: weekShifts } = await supabase
    .from('shifts')
    .select('caregiver_id, start_time, end_time')
    .neq('status', 'Cancelled')
    .gte('start_time', weekStart)
    .lt('start_time', nowISO);

  const hoursMap = new Map<string, number>();
  (weekShifts ?? []).forEach((s: any) => {
    const h = Math.max(0, (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 3_600_000);
    hoursMap.set(s.caregiver_id, (hoursMap.get(s.caregiver_id) ?? 0) + h);
  });

  const candidates: WorkerSuggestion[] = caregivers
    .filter((c) => c.availability === 'Available' && !clashSet.has(c.id))
    .map((c) => {
      const inducted = (c.clients_inducted_for ?? c.clientsInductedFor ?? []).includes(shift.clientId);
      const preferred = (c.clients_worked_with ?? c.clientsWorkedWith ?? []).includes(shift.clientId);
      const dist: number | null = null; // workers have no stored home location
      const hours = hoursMap.get(c.id) ?? 0;

      let score = 0;
      if (c.availability === 'Available') score += 50;
      if (inducted) score += 30;
      if (preferred) score += 20;
      score -= Math.min(hours / 10, 20);
      if (dist !== null && dist < 20) score += 10;

      return {
        caregiverId: c.id,
        name: c.name,
        score: Math.round(score * 100) / 100,
        available: c.availability === 'Available',
        hasClash: clashSet.has(c.id),
        inducted,
        preferred,
        hoursThisWeek: Math.round(hours * 100) / 100,
        distanceKm: dist !== null ? Math.round(dist * 100) / 100 : null,
        availability: c.availability,
      };
    })
    .filter((s) => !s.hasClash)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      ...s,
      distanceKm: s.distanceKm ?? null,
      hoursThisWeek: s.hoursThisWeek,
    }));

  return candidates;
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
