import type { RepeatRule } from "./shift-rpc";

const DAY_MS = 86_400_000;

/** ISO weekday of a YYYY-MM-DD date: Monday = 1 ... Sunday = 7 (timezone independent). */
export function isoWeekday(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Dates a repeat rule produces. Mirrors create_shifts() in the database so the dialog can say
 * "this will create N shifts" before saving; the database is still the source of truth.
 */
export function occurrenceDates(start: string, rule: RepeatRule | undefined): string[] {
  if (!start) return [];
  const freq = rule?.freq ?? "none";
  if (freq === "none") return [start];

  const interval = Math.max(rule?.interval ?? 1, 1);
  const weekdays = rule?.weekdays?.length ? rule.weekdays : [isoWeekday(start)];
  const until = rule?.until || addDays(start, 90);
  if (until < start || daysBetween(start, until) > 366) return [];

  const startMonday = addDays(start, -(isoWeekday(start) - 1));
  const out: string[] = [];
  for (let d = start; d <= until; d = addDays(d, 1)) {
    const matches =
      freq === "daily"
        ? daysBetween(start, d) % interval === 0
        : weekdays.includes(isoWeekday(d)) && Math.floor(daysBetween(startMonday, addDays(d, -(isoWeekday(d) - 1))) / 7) % interval === 0;
    if (!matches) continue;
    if (rule?.count && out.length >= rule.count) break;
    out.push(d);
  }
  return out;
}

/** Participants one worker can cover at a ratio like "1:4". */
export function ratioCapacity(ratio: string): number {
  return Number(ratio.split(":")[1]) || 1;
}

/** Fewest workers that satisfy the ratio for this many participants. */
export function minWorkers(ratio: string, participants: number): number {
  return Math.max(1, Math.ceil(participants / ratioCapacity(ratio)));
}
