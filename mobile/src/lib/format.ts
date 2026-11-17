const DEFAULT_TZ = 'Australia/Sydney';

export function formatDay(iso: string, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}

export function formatTime(iso: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));
}

export function formatDateTime(iso: string, tz = DEFAULT_TZ): string {
  return `${formatDay(iso, tz)}, ${formatTime(iso, tz)}`;
}

/** Local calendar date (YYYY-MM-DD) of an instant in the organisation's timezone. */
export function localDate(iso: string | Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(new Date(iso));
}

export function hoursLabel(start: string, end: string): string {
  const h = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  return `${Math.round(h * 100) / 100} h`;
}

export function money(v: number | string | null | undefined, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(Number(v ?? 0));
}
