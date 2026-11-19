"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlarmClockOff, ClipboardCheck, Clock4, ShieldAlert, Table2, XCircle, BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardOverview } from "@/components/dashboard/overview";
import { useOrganisation } from "@/hooks/use-organisation";
import { isoToZonedInput } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayLabel, mondayOf } from "@/lib/week";
import { cn } from "@/lib/utils";

const H = 3_600_000;
const LATE_IN_MIN = 5;
const LATE_OUT_MIN = 15;
const STANDARD_WEEK_HOURS = 38;

type SW = {
  caregiver_id: string; clock_in_time: string | null; clock_out_time: string | null; hours_worked: number | null;
  caregivers: { name: string } | null;
  shifts: { start_time: string; end_time: string; status: string; deleted: boolean } | null;
};

const axis = { stroke: "var(--viz-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--viz-grid)" vertical={false} />;
const tooltipStyle = {
  contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, color: "hsl(var(--popover-foreground))" },
  cursor: { fill: "hsl(var(--muted) / 0.5)" },
};

function Stat({ label, value, icon: Icon, tone, href, sub }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone?: "warn" | "bad"; href?: string; sub?: string }) {
  const inner = (
    <Card className="h-full p-4 transition-all hover:shadow-md">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className={cn("h-4 w-4", value && tone === "bad" ? "text-destructive" : value && tone === "warn" ? "text-amber-600" : "text-muted-foreground")} /></div>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

/** A chart with a one-click table view of the same numbers. */
function ChartCard({ title, description, rows, columns, children, empty, loading }: {
  title: string; description: string; rows: Record<string, string | number>[]; columns: { key: string; label: string }[]; children: React.ReactNode; empty?: string; loading?: boolean;
}) {
  const [table, setTable] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? <BarChart3 className="mr-1 h-3.5 w-3.5" /> : <Table2 className="mr-1 h-3.5 w-3.5" />}{table ? "Chart" : "Table"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-56 flex-col justify-end gap-2 pb-2" aria-busy="true" aria-label="Loading chart">
            <div className="flex h-full items-end gap-2">{[40, 65, 30, 80, 55, 70, 45, 60].map((h, i) => <div key={i} className="flex-1 animate-pulse rounded-t bg-muted" style={{ height: h + "%" }} />)}</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">{empty ?? "No data yet."}</div>
        ) : table ? (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">{columns.map((c) => <th key={c.key} className="py-1.5 pr-3 font-medium">{c.label}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0">{columns.map((c) => <td key={c.key} className="py-1.5 pr-3 tabular-nums">{r[c.key]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="h-56">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function OperationsView() {
  const { org } = useOrganisation();
  const tz = org.timezone;
  const [sw, setSw] = useState<SW[]>([]);
  const [cancelled, setCancelled] = useState<{ cancelled_at: string }[]>([]);
  const [upcoming, setUpcoming] = useState<{ start_time: string; end_time: string; required_workers: number | null; shift_workers: { caregiver_id: string }[] }[]>([]);
  const [leave, setLeave] = useState<{ caregiver_id: string; start_date: string; end_date: string }[]>([]);
  const [staffCount, setStaffCount] = useState(0);
  const [statusMix, setStatusMix] = useState<{ status: string }[]>([]);
  const [newIncidents, setNewIncidents] = useState(0);
  const [awaiting, setAwaiting] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const now = Date.now();
    const since = new Date(now - 56 * 24 * H).toISOString();
    void Promise.all([
      supabase.from("shift_workers")
        .select("caregiver_id,clock_in_time,clock_out_time,hours_worked,caregivers(name),shifts!inner(start_time,end_time,status,deleted)")
        .eq("shifts.deleted", false).gte("shifts.start_time", since).lte("shifts.start_time", new Date(now + 7 * 24 * H).toISOString()),
      supabase.from("shifts").select("cancelled_at").eq("status", "Cancelled").gte("cancelled_at", since),
      supabase.from("shifts").select("start_time,end_time,required_workers,shift_workers(caregiver_id)")
        .eq("deleted", false).neq("status", "Cancelled").gte("start_time", new Date(now).toISOString()).lt("start_time", new Date(now + 14 * 24 * H).toISOString()),
      supabase.from("time_off_requests").select("caregiver_id,start_date,end_date").eq("status", "Approved").gte("end_date", new Date(now).toISOString().slice(0, 10)),
      supabase.from("caregivers").select("id", { count: "exact", head: true }).eq("contract_status", "Active"),
      supabase.from("shifts").select("status").eq("deleted", false).gte("start_time", new Date(now - 30 * 24 * H).toISOString()).lte("start_time", new Date(now).toISOString()),
      supabase.from("incidents").select("id", { count: "exact", head: true }).eq("status", "Reported"),
      supabase.from("onboarding_tasks").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("status", "pending_review").eq("archived", false),
    ]).then(([a, b, c, d, e, f, g, h, i]) => {
      if (!alive) return;
      setSw((a.data ?? []) as unknown as SW[]);
      setCancelled((b.data ?? []) as { cancelled_at: string }[]);
      setUpcoming((c.data ?? []) as typeof upcoming);
      setLeave((d.data ?? []) as typeof leave);
      setStaffCount(e.count ?? 0);
      setStatusMix((f.data ?? []) as { status: string }[]);
      setNewIncidents(g.count ?? 0);
      setAwaiting((h.count ?? 0) + (i.count ?? 0));
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const today = isoToZonedInput(new Date(), tz).slice(0, 10);
  const ymd = (iso: string) => isoToZonedInput(iso, tz).slice(0, 10);

  const m = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * H;
    const lateIn: Record<string, { name: string; mins: number[] }> = {};
    let lateInCount = 0;
    let lateOutCount = 0;
    const rostered: Record<string, { name: string; hours: number }> = {};
    const variance: Record<string, { name: string; rostered: number; actual: number }> = {};
    const thisMonday = mondayOf(today);

    for (const r of sw) {
      if (!r.shifts) continue;
      const st = new Date(r.shifts.start_time).getTime();
      const en = new Date(r.shifts.end_time).getTime();
      const name = r.caregivers?.name ?? "Staff";
      if (r.clock_in_time && st >= weekAgo && st <= now) {
        const late = (new Date(r.clock_in_time).getTime() - st) / 60_000;
        if (late > LATE_IN_MIN) {
          lateInCount++;
          (lateIn[r.caregiver_id] ??= { name, mins: [] }).mins.push(late);
        }
      }
      if (r.clock_out_time && st >= weekAgo && (new Date(r.clock_out_time).getTime() - en) / 60_000 > LATE_OUT_MIN) lateOutCount++;
      const d = ymd(r.shifts.start_time);
      if (d >= thisMonday && d <= addDays(thisMonday, 6) && r.shifts.status !== "Cancelled") {
        (rostered[r.caregiver_id] ??= { name, hours: 0 }).hours += (en - st) / H;
      }
      if (st >= now - 14 * 24 * H && r.clock_out_time && r.hours_worked != null) {
        const v = (variance[r.caregiver_id] ??= { name, rostered: 0, actual: 0 });
        v.rostered += (en - st) / H;
        v.actual += Number(r.hours_worked);
      }
    }

    const cancelWeeks = Array.from({ length: 8 }, (_, i) => addDays(mondayOf(today), -7 * (7 - i)));
    const cancels = cancelWeeks.map((w) => {
      const n = cancelled.filter((c) => { const d = ymd(c.cancelled_at); return d >= w && d <= addDays(w, 6); }).length;
      const l = dayLabel(w);
      return { week: `${l.day} ${l.month}`, cancelled: n };
    });

    const next14 = Array.from({ length: 14 }, (_, i) => addDays(today, i));
    const vacant = next14.map((d) => {
      const hrs = upcoming.filter((u) => ymd(u.start_time) === d).reduce((a, u) => {
        const open = Math.max(0, (u.required_workers ?? 1) - u.shift_workers.length);
        return a + open * (new Date(u.end_time).getTime() - new Date(u.start_time).getTime()) / H;
      }, 0);
      const away = new Set(leave.filter((l) => d >= l.start_date && d <= l.end_date).map((l) => l.caregiver_id)).size;
      const lbl = dayLabel(d);
      return { day: `${lbl.weekday} ${lbl.day}`, vacant: Math.round(hrs * 10) / 10, available: staffCount ? Math.round(((staffCount - away) / staffCount) * 100) : 0 };
    });

    const order = ["Completed", "Scheduled", "In Progress", "Late", "No Show", "Cancelled"];
    const mix = order.map((s) => ({ status: s, shifts: statusMix.filter((x) => x.status === s).length })).filter((x) => x.shifts > 0);

    return {
      lateInCount, lateOutCount,
      cancelledToday: cancelled.filter((c) => ymd(c.cancelled_at) === today).length,
      lateByStaff: Object.values(lateIn).map((v) => ({ name: v.name, minutes: Math.round(v.mins.reduce((a, b) => a + b, 0) / v.mins.length), times: v.mins.length }))
        .sort((a, b) => b.minutes - a.minutes).slice(0, 8),
      utilisation: Object.values(rostered).map((v) => ({ name: v.name, hours: Math.round(v.hours * 10) / 10 })).sort((a, b) => b.hours - a.hours).slice(0, 12),
      cancels, vacant, mix,
      variance: Object.values(variance).filter((v) => v.rostered > 0)
        .map((v) => ({ name: v.name, rostered: Math.round(v.rostered * 10) / 10, actual: Math.round(v.actual * 10) / 10, pct: Math.round(((v.actual - v.rostered) / v.rostered) * 100) }))
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 10),
    };
  }, [sw, cancelled, upcoming, leave, staffCount, statusMix, today, tz]); // eslint-disable-line react-hooks/exhaustive-deps

  const STATUS_FILL: Record<string, string> = {
    Completed: "var(--viz-good)", Scheduled: "var(--viz-1)", "In Progress": "var(--viz-3)", Late: "var(--viz-warning)", "No Show": "var(--viz-critical)", Cancelled: "hsl(var(--muted-foreground))",
  };
  const maxAbs = Math.max(10, ...m.variance.map((v) => Math.abs(v.pct)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="New incidents" value={newIncidents} icon={ShieldAlert} tone="bad" href="/dashboard/incidents" />
        <Stat label="Late clock-ins" value={m.lateInCount} icon={AlarmClockOff} tone="warn" sub={`Over ${LATE_IN_MIN} min, last 7 days`} />
        <Stat label="Late clock-outs" value={m.lateOutCount} icon={Clock4} tone="warn" sub={`Over ${LATE_OUT_MIN} min, last 7 days`} />
        <Stat label="Awaiting review" value={awaiting} icon={ClipboardCheck} tone="warn" sub="Onboarding and documents" href="/dashboard/documents?filter=pending" />
        <Stat label="Cancelled today" value={m.cancelledToday} icon={XCircle} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard loading={!loaded} title="Shift cancellations" description="Shifts cancelled per week, last 8 weeks" rows={m.cancels} columns={[{ key: "week", label: "Week of" }, { key: "cancelled", label: "Cancelled" }]}>
          <ResponsiveContainer>
            <BarChart data={m.cancels} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              {grid}
              <XAxis dataKey="week" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="cancelled" name="Cancelled" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard loading={!loaded} title="Late clock-ins by staff" description="Average minutes late, last 7 days" rows={m.lateByStaff} empty="No late clock-ins this week."
          columns={[{ key: "name", label: "Staff" }, { key: "minutes", label: "Avg minutes late" }, { key: "times", label: "Times late" }]}>
          <ResponsiveContainer>
            <BarChart data={m.lateByStaff} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...axis} unit=" min" />
              <YAxis type="category" dataKey="name" width={110} {...axis} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} min`, "Avg late"]} />
              <Bar dataKey="minutes" name="Avg minutes late" fill="var(--viz-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard loading={!loaded} title="Utilisation this week" description={`Rostered hours per staff member; the line marks a ${STANDARD_WEEK_HOURS}-hour week`} rows={m.utilisation}
          empty="No one is rostered this week." columns={[{ key: "name", label: "Staff" }, { key: "hours", label: "Rostered hours" }]}>
          <ResponsiveContainer>
            <BarChart data={m.utilisation} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              {grid}
              <XAxis dataKey="name" {...axis} interval={0} tickFormatter={(n: string) => n.split(" ")[0]} />
              <YAxis {...axis} unit="h" />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} h`, "Rostered"]} />
              <ReferenceLine y={STANDARD_WEEK_HOURS} stroke="var(--viz-axis)" strokeDasharray="4 4" label={{ value: `${STANDARD_WEEK_HOURS}h`, position: "right", fill: "var(--viz-axis)", fontSize: 11 }} />
              <Bar dataKey="hours" name="Rostered hours" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard loading={!loaded} title="Shift status mix" description="Shifts in the last 30 days, by outcome" rows={m.mix} columns={[{ key: "status", label: "Status" }, { key: "shifts", label: "Shifts" }]}>
          <ResponsiveContainer>
            <BarChart data={m.mix} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...axis} />
              <YAxis type="category" dataKey="status" width={90} {...axis} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="shifts" name="Shifts" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fill: "hsl(var(--foreground))", fontSize: 11 }}
                shape={(p: any) => <rect x={p.x} y={p.y} width={Math.max(0, p.width)} height={p.height} rx={4} fill={STATUS_FILL[p.payload.status] ?? "var(--viz-1)"} />} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard loading={!loaded} title="Vacant hours, next 14 days" description="Hours on shifts that still need staff" rows={m.vacant} columns={[{ key: "day", label: "Day" }, { key: "vacant", label: "Vacant hours" }, { key: "available", label: "Staff available %" }]}>
          <ResponsiveContainer>
            <BarChart data={m.vacant} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              {grid}
              <XAxis dataKey="day" {...axis} interval={1} />
              <YAxis {...axis} unit="h" />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} h`, "Vacant"]} />
              <Bar dataKey="vacant" name="Vacant hours" fill="var(--viz-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard loading={!loaded} title="Staff availability, next 14 days" description="Active staff not on approved leave" rows={m.vacant} columns={[{ key: "day", label: "Day" }, { key: "available", label: "Available %" }]}>
          <ResponsiveContainer>
            <LineChart data={m.vacant} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              {grid}
              <XAxis dataKey="day" {...axis} interval={1} />
              <YAxis domain={[0, 100]} {...axis} unit="%" />
              <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--viz-axis)", strokeDasharray: "3 3" }} formatter={(v: number) => [`${v}%`, "Available"]} />
              <Line type="monotone" dataKey="available" name="Available" stroke="var(--viz-1)" strokeWidth={2} dot={{ r: 4, fill: "var(--viz-1)", stroke: "hsl(var(--card))", strokeWidth: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Rostered vs actual time</CardTitle>
          <CardDescription className="text-xs">Last 14 days of finished shifts. Left of centre: worked less than rostered; right: worked more.</CardDescription>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-muted" />)}</div>
          ) : m.variance.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No finished shifts in the last 14 days.</p>
          ) : (
            <div className="space-y-1.5">
              {m.variance.map((v) => {
                const w = (Math.abs(v.pct) / maxAbs) * 50;
                return (
                  <div key={v.name} className="grid grid-cols-[minmax(0,10rem)_1fr_5.5rem] items-center gap-3 text-sm" title={`Rostered ${v.rostered} h, worked ${v.actual} h`}>
                    <span className="truncate">{v.name}</span>
                    <div className="relative h-5 rounded bg-muted/40">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-[color:var(--viz-axis)]" />
                      <span
                        className="absolute inset-y-1 rounded"
                        style={{ left: v.pct < 0 ? `${50 - w}%` : "50%", width: `${w}%`, background: v.pct < 0 ? "var(--viz-1)" : "var(--viz-2)" }}
                      />
                    </div>
                    <span className="text-right tabular-nums text-muted-foreground">{v.pct > 0 ? "+" : ""}{v.pct}%</span>
                  </div>
                );
              })}
              <div className="flex justify-between pl-[10.75rem] pr-[6.25rem] pt-1 text-[11px] text-muted-foreground"><span>Less than rostered</span><span>More than rostered</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3 pt-2">
        <h2 className="text-lg font-semibold">Overview</h2>
        <DashboardOverview />
      </div>
    </div>
  );
}
