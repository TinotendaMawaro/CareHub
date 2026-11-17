/**
 * Shared NDIS pricing helpers for CareHub.
 *
 * This module mirrors the Postgres resolve_segments() logic in TypeScript
 * so the UI can preview segments before save and recompute on actuals.
 *
 * Boundaries (org timezone):
 * - weekday_day: 06:00 - 20:00
 * - weekday_evening: 20:00 - 24:00
 * - weekday_night: 00:00 - 06:00
 * - saturday/sunday/public_holiday: whole calendar day
 */

export type TimeBand =
  | 'weekday_day'
  | 'weekday_evening'
  | 'weekday_night'
  | 'saturday'
  | 'sunday'
  | 'public_holiday'
  | 'any';

export type Range = { start: string; end: string; date?: string };

export interface Segment {
  itemNumber: string;
  band: TimeBand;
  start: Date;
  end: Date;
  units: number;
  billRate: number;
  payRate?: number;
  billAmount: number;
  payAmount: number;
}

export interface SupportItem {
  itemNumber: string;
  familyKey: string;
  timeBand: TimeBand;
  unit: 'Hour' | 'Each' | 'Day' | 'Week';
  priceNational: number;
  priceRemote?: number;
  priceVeryRemote?: number;
}

export interface SupportFamily {
  familyKey: string;
  label: string;
  defaultWorkerLevel?: string;
}

export interface PayRate {
  workerLevel: string;
  timeBand: TimeBand;
  hourlyRate: number;
  eachRate?: number;
}

export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  state: string;
  name: string;
}

export type PriceRegion = 'national' | 'remote' | 'very_remote';

function roundToTwo(n: number) {
  return Math.round(n * 100) / 100;
}

export function getPriceRegionRate(
  region: PriceRegion,
  item: SupportItem
): number {
  if (region === 'remote') return item.priceRemote ?? item.priceNational;
  if (region === 'very_remote') return item.priceVeryRemote ?? item.priceNational;
  return item.priceNational;
}

export function getPayRate(
  workerLevel: string | undefined,
  band: TimeBand,
  payRates: PayRate[]
): number | undefined {
  if (!workerLevel) return undefined;
  return payRates.find(
    (r) => r.workerLevel === workerLevel && r.timeBand === band
  )?.hourlyRate;
}

export function isPublicHoliday(
  date: Date,
  state: string | undefined,
  holidays: PublicHoliday[]
): boolean {
  if (!state) return false;
  const ds = date.toISOString().slice(0, 10);
  return holidays.some((h) => h.date === ds && h.state === state);
}

export function bandFor(
  dt: Date,
  state: string | undefined,
  holidays: PublicHoliday[]
): TimeBand {
  if (isPublicHoliday(dt, state, holidays)) return 'public_holiday';
  const dow = dt.getDay();
  if (dow === 0) return 'sunday';
  if (dow === 6) return 'saturday';
  const h = dt.getHours();
  if (h >= 20) return 'weekday_evening';
  if (h < 6) return 'weekday_night';
  return 'weekday_day';
}

export function nextBoundary(dt: Date, band: TimeBand): Date {
  const d = new Date(dt);
  if (band === 'weekday_evening') {
    d.setHours(24, 0, 0, 0);
    return d;
  }
  if (band === 'weekday_night') {
    d.setHours(6, 0, 0, 0);
    return d;
  }
  d.setHours(6, 0, 0, 0);
  return d;
}

export function resolveSegments(
  start: Date,
  end: Date,
  familyKey: string,
  region: PriceRegion,
  state: string | undefined,
  items: SupportItem[],
  payRates: PayRate[],
  holidays: PublicHoliday[],
  workerLevel?: string,
  isSleepover = false
): Segment[] {
  const segments: Segment[] = [];

  if (isSleepover) {
    const item = items.find(
      (i) =>
        i.familyKey === familyKey &&
        i.unit === 'Each' &&
        (i.timeBand === 'any' || i.timeBand === 'weekday_day')
    );
    if (!item) return segments;
    const billRate = getPriceRegionRate(region, item);
    const payRate = getPayRate(workerLevel, 'weekday_day', payRates);
    segments.push({
      itemNumber: item.itemNumber,
      band: 'weekday_day',
      start,
      end,
      units: 1,
      billRate,
      payRate,
      billAmount: roundToTwo(billRate),
      payAmount: payRate ? roundToTwo(payRate) : 0,
    });
    return segments;
  }

  let segStart = new Date(start);
  while (segStart < end) {
    const band = bandFor(segStart, state, holidays);
    const boundary = nextBoundary(segStart, band);
    const segEnd = boundary >= end ? new Date(end) : boundary;

    let item = items.find(
      (i) => i.familyKey === familyKey && i.timeBand === band
    );
    if (!item) {
      item = items.find((i) => i.familyKey === familyKey && i.timeBand === 'any');
    }
    if (!item) {
      segStart = segEnd;
      continue;
    }

    const units = roundToTwo(
      Math.max(0, (segEnd.getTime() - segStart.getTime()) / 3_600_000)
    );
    if (units <= 0) {
      segStart = segEnd;
      continue;
    }
    const billRate = getPriceRegionRate(region, item);
    const payRate = getPayRate(workerLevel, band, payRates);
    segments.push({
      itemNumber: item.itemNumber,
      band,
      start: new Date(segStart),
      end: new Date(segEnd),
      units,
      billRate,
      payRate,
      billAmount: roundToTwo(units * billRate),
      payAmount: payRate ? roundToTwo(units * payRate) : 0,
    });

    segStart = segEnd;
  }

  return segments;
}

export function summarizeSegments(segments: Segment[]) {
  const totalBill = segments.reduce((s, x) => s + x.billAmount, 0);
  const totalPay = segments.reduce((s, x) => s + x.payAmount, 0);
  const margin = totalBill - totalPay;
  return {
    totalBill: roundToTwo(totalBill),
    totalPay: roundToTwo(totalPay),
    margin: roundToTwo(margin),
    segments,
  };
}
