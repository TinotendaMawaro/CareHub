"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlarmClockOff, AlertTriangle, CheckCircle2, Clock, Moon, NotebookPen, Search, UserCheck, UserX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import ShiftDetailSheet from "@/components/shifts/shift-detail-sheet";
import { useOrganisation } from "@/hooks/use-organisation";
import { initials } from "@/lib/avatar";
import { formatTime } from "@/lib/format";
import { LIVE_LABEL, type LiveState, barGeometry, liveState, needsAttention, packTracks } from "@/lib/live-status";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";
import { cn } from "@/lib/utils";

const H = 3_600_000;
const BEFORE = 12 * H;
const AFTER = 12 * H;

type Raw = {
  id: string; start_time: string; end_time: string; status: string; required_workers: number | null; is_sleepover: boolean;
  shift_workers: { caregiver_id: string; clock_in_time: string | null; clock_out_time: string | null; caregivers: { name: string; profile_picture_url: string | null } | null }[];
  shift_clients: { clients: { first_name: string | null; last_name: string | null } | null }[];
};
type Bar = { shiftId: string; start: number; end: number; state: LiveState | "vacant"; client: string; sleepover: boolean; clockIn: string | null };
type Lane = { id: string; name: string; avatar: string | null; bars: Bar[] };

/** Fill is the status colour mixed into the surface; the left edge carries the full colour. */
const tint = (v: string, pct: number, dashed = false): React.CSSProperties => ({
  background: `color-mix(in srgb, var(${v}) ${pct}%, hsl(var(--card)))`,
  borderColor: `var(${v})`,
  borderStyle: dashed ? "dashed" : "solid",
});
const BAR_STYLE: Record<LiveState | "vacant", React.CSSProperties> = {
  scheduled: tint("--viz-1", 14),
  on_shift: tint("--viz-good", 18),
  late: tint("--viz-warning", 24),
  overdue: tint("--viz-critical", 16),
  missed: tint("--viz-critical", 9, true),
  completed: { background: "hsl(var(--muted))", borderColor: "hsl(var(--muted-foreground) / 0.4)" },
  vacant: tint("--viz-warning", 10, true),
};
const DOT: Record<LiveState | "vacant", string> = {
  scheduled: "var(--viz-1)", on_shift: "var(--viz-good)", late: "var(--viz-warning)",
  overdue: "var(--viz-critical)", missed: "var(--viz-critical)", completed: "hsl(var(--muted-foreground) / 0.5)", vacant: "var(--viz-warning)",
};
const ICON: Record<LiveState | "vacant", React.ComponentType<{ className?: string }>> = {
  scheduled: Clock, on_shift: UserCheck, late: AlarmClockOff, overdue: AlertTriangle, missed: AlarmClockOff, completed: CheckCircle2, vacant: UserX,
};

function Kpi({ label, value, hint, tone, icon: Icon, href }: { label: string; value: number | string; hint: string; tone?: "good" | "warn" | "bad"; icon: React.ComponentType<{ className?: string }>; href?: string }) {
  const body = (
    <Card className="h-full p-4 transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={cn("h-4 w-4", tone === "good" ? "text-[color:var(--viz-good)]" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-destructive" : "text-muted-foreground")} />
      </div>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function LiveView() {
  const { org } = useOrganisation();
  const tz = org.timezone;
  const [now, setNow] = useState(() => Date.now());
  const [raw, setRaw] = useState<Raw[]>([]);
  const [missed7, setMissed7] = useState(0);
  const [notesOutstanding, setNotesOutstanding] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = Date.now();
    const winStart = new Date(t - BEFORE).toISOString();
    const winEnd = new Date(t + AFTER).toISOString();
    const [s, m] = await Promise.all([
      supabase
        .from("shifts")
        .select("id,start_time,end_time,status,required_workers,is_sleepover,shift_workers(caregiver_id,clock_in_time,clock_out_time,caregivers(name,profile_picture_url)),shift_clients(clients(first_name,last_name))")
        .eq("deleted", false)
        .neq("status", "Cancelled")
        .lt("start_time", winEnd)
        .gt("end_time", winStart)
        .order("start_time"),
      supabase
        .from("shift_workers")
        .select("shift_id, shifts!inner(end_time,deleted,status)", { count: "exact", head: true })
        .eq("shifts.deleted", false)
        .neq("shifts.status", "Cancelled")
        .gte("shifts.end_time", new Date(t - 7 * 24 * H).toISOString())
        .lte("shifts.end_time", new Date(t).toISOString())
        .or("clock_in_time.is.null,clock_out_time.is.null"),
    ]);
    const rows = (s.data ?? []) as unknown as Raw[];
    setRaw(rows);
    setMissed7(m.count ?? 0);

    // Finished in the last 24 hours, but the worker hasn't written a note yet.
    const done = rows.flatMap((r) => r.shift_workers.filter((w) => w.clock_out_time && new Date(w.clock_out_time).getTime() > t - 24 * H).map((w) => ({ shift: r.id, cg: w.caregiver_id })));
    if (done.length) {
      const { data: notes } = await supabase.from("shift_notes").select("shift_id,caregiver_id").in("shift_id", [...new Set(done.map((d) => d.shift))]);
      const have = new Set((notes ?? []).map((n: any) => `${n.shift_id}|${n.caregiver_id}`));
      setNotesOutstanding(done.filter((d) => !have.has(`${d.shift}|${d.cg}`)).length);
    } else {
      setNotesOutstanding(0);
    }
    setNow(t);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    const refresh = setInterval(() => void load(), 5 * 60_000);
    const offs = ["shifts", "shift_workers", "shift_notes"].map((t) => subscribeToTable(t, () => void load()));
    return () => { clearInterval(tick); clearInterval(refresh); offs.forEach((o) => o()); };
  }, [load]);

  const winStart = now - BEFORE;
  const winEnd = now + AFTER;

  const { lanes, vacancies, counts } = useMemo(() => {
    const byStaff = new Map<string, Lane>();
    const vac: Bar[] = [];
    const c = { on_shift: 0, late: 0, overdue: 0, completed: 0, missed: 0, scheduled: 0, staffToday: new Set<string>() };
    for (const r of raw) {
      const start = new Date(r.start_time).getTime();
      const end = new Date(r.end_time).getTime();
      const client = r.shift_clients.map((sc) => [sc.clients?.first_name, sc.clients?.last_name].filter(Boolean).join(" ")).filter(Boolean).join(", ") || "Client";
      for (const w of r.shift_workers) {
        const state = liveState({ start, end, clockIn: w.clock_in_time ? new Date(w.clock_in_time).getTime() : null, clockOut: w.clock_out_time ? new Date(w.clock_out_time).getTime() : null, now });
        c[state]++;
        c.staffToday.add(w.caregiver_id);
        if (!byStaff.has(w.caregiver_id)) byStaff.set(w.caregiver_id, { id: w.caregiver_id, name: w.caregivers?.name ?? "Staff", avatar: w.caregivers?.profile_picture_url ?? null, bars: [] });
        byStaff.get(w.caregiver_id)!.bars.push({ shiftId: r.id, start, end, state, client, sleepover: r.is_sleepover, clockIn: w.clock_in_time });
      }
      const open = Math.max(0, (r.required_workers ?? 1) - r.shift_workers.length);
      if (open > 0 && end > now) vac.push({ shiftId: r.id, start, end, state: "vacant", client: `${client}${open > 1 ? ` (${open} needed)` : ""}`, sleepover: r.is_sleepover, clockIn: null });
    }
    return { lanes: [...byStaff.values()].sort((a, b) => a.name.localeCompare(b.name)), vacancies: vac, counts: c };
  }, [raw, now]);

  const shownLanes = lanes.filter((l) =>
    (!q.trim() || l.name.toLowerCase().includes(q.trim().toLowerCase())) &&
    (!attentionOnly || l.bars.some((b) => b.state !== "vacant" && needsAttention(b.state))));

  // Hour ticks across the 24-hour window.
  const ticks = useMemo(() => {
    const first = Math.ceil(winStart / H) * H;
    const out: number[] = [];
    for (let t = first; t <= winEnd; t += H) out.push(t);
    return out;
  }, [winStart, winEnd]);
  const nowLeft = ((now - winStart) / (winEnd - winStart)) * 100;

  const TRACK = 38;
  const bar = (b: Bar, laneKey: string, track: number) => {
    const g = barGeometry(b.start, b.end, winStart, winEnd);
    if (!g) return null;
    const Icon = ICON[b.state];
    const label = b.state === "vacant" ? "Vacant" : LIVE_LABEL[b.state];
    return (
      <button
        key={`${laneKey}-${b.shiftId}`}
        type="button"
        onClick={() => setOpenId(b.shiftId)}
        title={`${label} · ${b.client} · ${formatTime(new Date(b.start), tz)}-${formatTime(new Date(b.end), tz)}${b.clockIn ? ` · clocked in ${formatTime(b.clockIn, tz)}` : ""}`}
        className={cn("absolute flex h-8 min-w-[6px] items-center gap-1 overflow-hidden rounded-md border border-l-4 px-1.5 text-left text-xs text-foreground shadow-sm transition-all hover:z-10 hover:shadow-md", b.state === "completed" && "text-muted-foreground")}
        style={{ ...BAR_STYLE[b.state], left: `${g.left}%`, width: `${g.width}%`, top: 6 + track * TRACK }}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate font-medium">{b.client}</span>
        {b.sleepover && <Moon className="h-3 w-3 shrink-0" aria-label="Sleepover" />}
      </button>
    );
  };

  const lane = (id: string, name: string, avatar: React.ReactNode, bars: Bar[], tone?: string) => {
    const { placed, tracks } = packTracks(bars);
    return (
      <div key={id} className={cn("flex border-b last:border-b-0", tone)}>
        <div className="flex w-52 shrink-0 items-center gap-2 border-r px-3 py-2">
          {avatar}
          <span className="truncate text-sm font-medium" title={name}>{name}</span>
        </div>
        <div className="relative flex-1" style={{ height: 12 + tracks * TRACK - 6 }}>{placed.map(({ b, track }) => bar(b, id, track))}</div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 min-[1800px]:grid-cols-8">
        <Kpi label="On shift now" value={counts.on_shift} hint={`of ${counts.staffToday.size} staff in view`} tone="good" icon={UserCheck} />
        <Kpi label="Late start" value={counts.late} hint="Not clocked in yet" tone={counts.late ? "warn" : undefined} icon={AlarmClockOff} />
        <Kpi label="Overdue" value={counts.overdue} hint="Past end, still clocked in" tone={counts.overdue ? "bad" : undefined} icon={AlertTriangle} />
        <Kpi label="Upcoming" value={counts.scheduled} hint="Next 12 hours" icon={Clock} />
        <Kpi label="Completed" value={counts.completed} hint="In the last 12 hours" icon={CheckCircle2} />
        <Kpi label="Vacancies" value={vacancies.length} hint="Shifts still needing staff" tone={vacancies.length ? "warn" : undefined} icon={UserX} href="/dashboard/schedule" />
        <Kpi label="Missed clock in/out" value={missed7} hint="Last 7 days" tone={missed7 ? "bad" : undefined} icon={AlarmClockOff} href="/dashboard/approvals" />
        <Kpi label="Notes outstanding" value={notesOutstanding} hint="Finished, no note yet" tone={notesOutstanding ? "warn" : undefined} icon={NotebookPen} href="/dashboard/shift-note" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 w-56 pl-8" placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={attentionOnly} onCheckedChange={(v) => setAttentionOnly(!!v)} />Needs attention</label>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--viz-good)] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--viz-good)]" /></span>
            Live · updates as staff clock in and out
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1100px]">
            <div className="flex border-b bg-muted/30">
              <div className="w-52 shrink-0 border-r px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff</div>
              <div className="relative h-8 flex-1">
                {ticks.map((t) => {
                  const left = ((t - winStart) / (winEnd - winStart)) * 100;
                  const hh = formatTime(new Date(t), tz);
                  return (
                    <span key={t} className="absolute top-0 flex h-full -translate-x-1/2 items-center text-[11px] tabular-nums text-muted-foreground" style={{ left: `${left}%` }}>
                      {hh === "00:00" ? <b className="text-foreground">{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: tz }).format(new Date(t))}</b> : hh}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-52 right-0">
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-[color:var(--viz-grid)]" style={{ left: `${((t - winStart) / (winEnd - winStart)) * 100}%` }} />
                ))}
                <span className="absolute inset-y-0 z-20 w-0.5 bg-primary" style={{ left: `${nowLeft}%` }}>
                  <span className="absolute -top-0 left-1/2 -translate-x-1/2 rounded-b bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">NOW {formatTime(new Date(now), tz)}</span>
                </span>
              </div>
              {vacancies.length > 0 && !q && lane("vacancies", `Vacancies (${vacancies.length})`,
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><UserX className="h-3.5 w-3.5" /></span>,
                vacancies, "bg-amber-50/40 dark:bg-amber-950/10")}
              {shownLanes.map((l) => lane(l.id, l.name,
                <Avatar className="h-7 w-7 shrink-0">
                  {l.avatar && <AvatarImage src={l.avatar} alt="" className="object-cover" />}
                  <AvatarFallback className="text-[10px]">{initials(l.name)}</AvatarFallback>
                </Avatar>, l.bars))}
              {loaded && shownLanes.length === 0 && vacancies.length === 0 && (
                <p className="p-10 text-center text-sm text-muted-foreground">{attentionOnly ? "Nothing needs attention right now." : "No shifts in the 24 hours around now."}</p>
              )}
              {!loaded && <p className="p-10 text-center text-sm text-muted-foreground">Loading the live view...</p>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
          {(["on_shift", "scheduled", "late", "overdue", "missed", "completed", "vacant"] as const).map((k) => {
            const Icon = ICON[k];
            return <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: DOT[k] }} /><Icon className="h-3 w-3" />{k === "vacant" ? "Vacant" : LIVE_LABEL[k]}</span>;
          })}
          <span className="ml-auto">Showing {shownLanes.length} of {lanes.length} staff · 12 hours either side of now</span>
        </div>
      </Card>

      <ShiftDetailSheet shiftId={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />
    </div>
  );
}
