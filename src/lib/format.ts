/** Currency, formatted for the organisation's locale (AUD by default). */
export function money(value: number | string | null | undefined, currency = "AUD"): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number.isFinite(n) ? n : 0);
}

/** Local date/time in the organisation's timezone, e.g. "Mon 1 Mar, 06:00". */
export function formatWhen(iso: string | Date | null | undefined, timeZone = "Australia/Sydney"): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone,
  }).format(d);
}

export function formatTime(iso: string | Date | null | undefined, timeZone = "Australia/Sydney"): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(d);
}

export function hoursBetween(start: string | Date, end: string | Date): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "2027-03-01T09:30" typed in the organisation's timezone -> UTC ISO string. */
export function zonedToIso(local: string, timeZone = "Australia/Sydney"): string {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  let ts = guess - tzOffsetMs(guess, timeZone);
  ts = guess - tzOffsetMs(ts, timeZone); // second pass settles DST edges
  return new Date(ts).toISOString();
}

/** UTC ISO string -> value for <input type="datetime-local"> in the organisation's timezone. */
export function isoToZonedInput(iso: string | Date | null | undefined, timeZone = "Australia/Sydney"): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return p.replace(" ", "T");
}
