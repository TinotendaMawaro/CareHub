export type LiveState = "scheduled" | "late" | "on_shift" | "overdue" | "completed" | "missed";

export const LIVE_LABEL: Record<LiveState, string> = {
  scheduled: "Scheduled",
  late: "Late start",
  on_shift: "On shift",
  overdue: "Overdue",
  completed: "Completed",
  missed: "Missed clock-in",
};

const LATE_GRACE_MS = 5 * 60_000;
const OVERDUE_GRACE_MS = 15 * 60_000;

/** One staff member's state on one shift, at time `now`. */
export function liveState(p: { start: number; end: number; clockIn: number | null; clockOut: number | null; now: number }): LiveState {
  if (p.clockOut) return "completed";
  if (p.clockIn) return p.now > p.end + OVERDUE_GRACE_MS ? "overdue" : "on_shift";
  if (p.now > p.end) return "missed";
  if (p.now > p.start + LATE_GRACE_MS) return "late";
  return "scheduled";
}

export function needsAttention(s: LiveState): boolean {
  return s === "late" || s === "overdue" || s === "missed";
}

/** Stacks overlapping intervals onto separate tracks (first free track wins), so bars never cover each other. */
export function packTracks<T extends { start: number; end: number }>(items: T[]): { placed: { b: T; track: number }[]; tracks: number } {
  const ends: number[] = [];
  const placed = [...items]
    .sort((a, c) => a.start - c.start || a.end - c.end)
    .map((b) => {
      let track = ends.findIndex((e) => e <= b.start);
      if (track < 0) { track = ends.length; ends.push(b.end); } else ends[track] = b.end;
      return { b, track };
    });
  return { placed, tracks: Math.max(1, ends.length) };
}

/** Percent offsets of a bar inside a time window, clipped to the window. */
export function barGeometry(start: number, end: number, winStart: number, winEnd: number): { left: number; width: number } | null {
  const a = Math.max(start, winStart);
  const b = Math.min(end, winEnd);
  if (b <= a) return null;
  const span = winEnd - winStart;
  return { left: ((a - winStart) / span) * 100, width: ((b - a) / span) * 100 };
}
