/** Date-only helpers on "YYYY-MM-DD" strings, so week grids never drift across timezones. */

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday, Monday = 1 ... Sunday = 7. */
export function isoWeekday(ymd: string): number {
  const w = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** The Monday on or before `ymd`. */
export function mondayOf(ymd: string): string {
  return addDays(ymd, 1 - isoWeekday(ymd));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayLabel(ymd: string): { weekday: string; day: number; month: string } {
  return { weekday: DAY[isoWeekday(ymd) - 1], day: Number(ymd.slice(8, 10)), month: MONTH[Number(ymd.slice(5, 7)) - 1] };
}

/** "17 - 23 Nov 2026" or "28 Dec 2026 - 3 Jan 2027". */
export function weekRangeLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const a = dayLabel(monday);
  const b = dayLabel(sunday);
  const y1 = monday.slice(0, 4);
  const y2 = sunday.slice(0, 4);
  if (y1 !== y2) return `${a.day} ${a.month} ${y1} - ${b.day} ${b.month} ${y2}`;
  if (a.month !== b.month) return `${a.day} ${a.month} - ${b.day} ${b.month} ${y2}`;
  return `${a.day} - ${b.day} ${b.month} ${y2}`;
}
