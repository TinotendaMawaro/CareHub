"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Gift, GripVertical, Hourglass, Moon, Plus, Rows3, Search, UserX } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import CreateShiftsDialog from "@/components/shifts/create-shifts-dialog";
import ShiftDetailSheet from "@/components/shifts/shift-detail-sheet";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useClients } from "@/hooks/use-clients";
import { useOrganisation } from "@/hooks/use-organisation";
import { useShifts } from "@/hooks/use-shifts";
import { useShiftTypes } from "@/hooks/use-shift-types";
import { resolveShiftType } from "@/lib/shift-type";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/avatar";
import { formatTime, isoToZonedInput } from "@/lib/format";
import { parseRpcError, shiftRpc } from "@/lib/shift-rpc";
import type { Shift } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addDays, dayLabel, mondayOf, weekDays, weekRangeLabel } from "@/lib/week";

export type BoardMode = "staff" | "client";
const UNASSIGNED = "__unassigned";

type Row = { id: string; name: string; avatar?: string | null; sub?: string };

const STATUS_STYLE: Record<string, string> = {
  Scheduled: "border-l-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100",
  "In Progress": "border-l-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100",
  Completed: "border-l-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  Late: "border-l-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
  "No Show": "border-l-red-500 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100",
  Cancelled: "border-l-slate-300 bg-slate-50 text-slate-400 line-through",
};
// Cancellations look different depending on who pays: the client is still billed (amber), or nobody is (orange, struck through).
const CANCEL_STYLE = {
  client: "border-l-amber-400 bg-amber-100/80 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
  provider: "border-l-orange-400 bg-orange-50 text-orange-800 line-through decoration-orange-400/70 dark:bg-orange-950/40 dark:text-orange-200",
};
const LEGEND: [string, string][] = [
  ["Scheduled", STATUS_STYLE.Scheduled], ["In Progress", STATUS_STYLE["In Progress"]], ["Completed", STATUS_STYLE.Completed],
  ["Late", STATUS_STYLE.Late], ["No Show", STATUS_STYLE["No Show"]],
  ["Cancelled by client (billed)", CANCEL_STYLE.client], ["Cancelled by us (no charge)", CANCEL_STYLE.provider],
];
const chipStyle = (s: Shift) =>
  s.status === "Cancelled" ? CANCEL_STYLE[s.cancelledBy ?? (s.cancelPay ? "client" : "provider")] : STATUS_STYLE[s.status] ?? STATUS_STYLE.Scheduled;
const COMPACT_KEY = "carehub-board-compact";

const hours = (s: Shift) => Math.max(0, (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 3_600_000);
const locked = (s: Shift) => !!s.approvedAt || !!s.clockInTime || s.status === "Cancelled" || s.status === "Completed" || s.status === "In Progress";
const workersOf = (s: Shift) => (s.workerIds && s.workerIds.length ? s.workerIds : s.caregiverId ? [s.caregiverId] : []);
const clientsOf = (s: Shift) => (s.clientIds && s.clientIds.length ? s.clientIds : [s.clientId]);

/**
 * Week board: rows are staff (with an Unassigned row) or clients, columns are Monday-Sunday in the
 * organisation's timezone. Click a shift to edit it; drag it to another person or day to reassign
 * or move it; click an empty cell to create one there.
 */
export function ShiftBoard({ defaultMode = "staff", title, description }: { defaultMode?: BoardMode; title: string; description: string }) {
  const { org } = useOrganisation();
  const tz = org.timezone;
  const { toast } = useToast();
  const { shifts, loading } = useShifts();
  const { caregivers } = useCaregivers();
  const { clients } = useClients();
  const { types } = useShiftTypes();
  const showTags = org.showTypeTags;
  const [compact, setCompact] = useState(false);
  useEffect(() => { try { setCompact(localStorage.getItem(COMPACT_KEY) === "1"); } catch {} }, []);
  const toggleCompact = () => setCompact((c) => { try { localStorage.setItem(COMPACT_KEY, c ? "0" : "1"); } catch {} return !c; });
  const today = isoToZonedInput(new Date(), tz).slice(0, 10);

  const [mode, setMode] = useState<BoardMode>(defaultMode);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [q, setQ] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [create, setCreate] = useState<{ date: string; clientIds?: string[]; workerIds?: string[] } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const days = useMemo(() => weekDays(monday), [monday]);
  const weekShifts = useMemo(() => shifts.filter((s) => s.date >= days[0] && s.date <= days[6]), [shifts, days]);

  const rows: Row[] = useMemo(() => {
    const base: Row[] =
      mode === "staff"
        ? caregivers.map((c) => ({ id: c.id, name: c.name, avatar: c.profilePictureUrl ?? null }))
        : clients.map((c) => ({ id: c.id, name: c.fullName, avatar: c.profilePictureUrl || null }));
    const s = q.trim().toLowerCase();
    let list = base.filter((r) => !s || r.name.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name));
    if (hideEmpty) {
      const used = new Set(weekShifts.flatMap((sh) => (mode === "staff" ? workersOf(sh) : clientsOf(sh))));
      list = list.filter((r) => used.has(r.id));
    }
    return mode === "staff" ? [{ id: UNASSIGNED, name: "Unassigned", sub: "Needs staff" }, ...list] : list;
  }, [mode, caregivers, clients, q, hideEmpty, weekShifts]);

  // rowId -> date -> shifts
  const grid = useMemo(() => {
    const m = new Map<string, Map<string, Shift[]>>();
    const put = (rowId: string, s: Shift) => {
      if (!m.has(rowId)) m.set(rowId, new Map());
      const byDay = m.get(rowId)!;
      byDay.set(s.date, [...(byDay.get(s.date) ?? []), s].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    };
    for (const s of weekShifts) {
      if (mode === "staff") {
        const ws = workersOf(s);
        if (s.status !== "Cancelled" && (ws.length === 0 || (s.requiredWorkers ?? 1) > ws.length)) put(UNASSIGNED, s);
        ws.forEach((w) => put(w, s));
      } else {
        clientsOf(s).forEach((c) => put(c, s));
      }
    }
    return m;
  }, [weekShifts, mode]);

  const staffName = useMemo(() => new Map(caregivers.map((c) => [c.id, c.name])), [caregivers]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.fullName])), [clients]);
  const chipLabel = (s: Shift, rowId: string) => {
    if (mode === "client") {
      const ws = workersOf(s);
      return ws.length ? ws.map((w) => staffName.get(w) ?? "Staff").join(", ") : "Unassigned";
    }
    return clientsOf(s).map((c) => clientName.get(c) ?? s.clientName ?? "Client").join(", ") + (rowId === UNASSIGNED && workersOf(s).length ? ` (needs ${Math.max(1, (s.requiredWorkers ?? 1) - workersOf(s).length)} more)` : "");
  };

  async function move(s: Shift, fromRow: string, toRow: string, toDay: string) {
    if (locked(s)) return toast({ title: "This shift can't be moved", description: "It has started, finished, been approved or cancelled.", variant: "destructive" });
    if (mode === "client" && fromRow !== toRow) {
      return toast({ title: "Open the shift to change its client", description: "Dragging between clients isn't supported, to keep billing correct." });
    }
    if (mode === "staff" && fromRow !== toRow && toRow !== UNASSIGNED && workersOf(s).includes(toRow)) {
      return toast({ title: `${staffName.get(toRow)} is already on this shift` });
    }
    setBusyId(s.id);
    try {
      if (toDay !== s.date) {
        const st = isoToZonedInput(s.startTime, tz).slice(11, 16);
        const en = isoToZonedInput(s.endTime, tz).slice(11, 16);
        await shiftRpc.reschedule(s.id, st, en, "this", toDay);
      }
      if (mode === "staff" && fromRow !== toRow) {
        if (fromRow !== UNASSIGNED) await shiftRpc.removeWorker(s.id, fromRow);
        if (toRow !== UNASSIGNED) {
          try {
            await shiftRpc.addWorker(s.id, toRow);
          } catch (e) {
            if (fromRow !== UNASSIGNED) await shiftRpc.addWorker(s.id, fromRow).catch(() => {});
            throw e;
          }
        }
      }
      const who = toRow === UNASSIGNED ? "Unassigned" : mode === "staff" ? staffName.get(toRow) : undefined;
      toast({ title: "Shift updated", description: [toDay !== s.date ? `Moved to ${dayLabel(toDay).weekday} ${dayLabel(toDay).day} ${dayLabel(toDay).month}` : "", fromRow !== toRow && who ? `Now: ${who}` : ""].filter(Boolean).join(" · ") });
    } catch (e) {
      const { code, message } = parseRpcError(e);
      toast({ title: code === "worker_clash" ? "Double booking" : "Could not move the shift", description: message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  const onDrop = (rowId: string, day: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropKey(null);
    const [id, fromRow] = e.dataTransfer.getData("text/plain").split("|");
    const s = shifts.find((x) => x.id === id);
    setDragId(null);
    if (!s || (fromRow === rowId && day === s.date)) return;
    void move(s, fromRow, rowId, day);
  };

  const rowHours = (rowId: string) => [...(grid.get(rowId)?.values() ?? [])].flat().reduce((a, s) => a + hours(s), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={() => setCreate({ date: days.includes(today) ? today : days[0] })}><Plus className="mr-1 h-4 w-4" />New shift</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setMonday(mondayOf(today))}><CalendarDays className="mr-1 h-4 w-4" />Today</Button>
          <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="ml-1 text-sm font-semibold tabular-nums">{weekRangeLabel(monday)}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 w-48 pl-8" placeholder={mode === "staff" ? "Find staff" : "Find client"} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={hideEmpty} onCheckedChange={(v) => setHideEmpty(!!v)} />Only rostered</label>
          <Button variant={compact ? "secondary" : "ghost"} size="sm" aria-pressed={compact} onClick={toggleCompact} title="Fit more on screen">
            <Rows3 className="mr-1 h-4 w-4" />Compact
          </Button>
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="Rows">
            {(["staff", "client"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-all", mode === m ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                By {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed sm:min-w-[1080px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="sticky left-0 z-20 w-36 border-b border-r bg-card px-3 py-2 text-left sm:w-56 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{mode === "staff" ? "Staff" : "Client"}</th>
                {days.map((d) => {
                  const l = dayLabel(d);
                  const isToday = d === today;
                  return (
                    <th key={d} className={cn("border-b border-r px-2 py-2 text-center", isToday && "bg-primary/5")}>
                      <div className={cn("text-xs font-semibold uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>{l.weekday}</div>
                      <div className={cn("mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold", isToday && "bg-primary text-primary-foreground")}>{l.day}</div>
                    </th>
                  );
                })}
                <th className="w-16 border-b px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hours</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading shifts...</td></tr>
              )}
              {!loading && rows.map((row) => {
                const isUnassigned = row.id === UNASSIGNED;
                const h = rowHours(row.id);
                return (
                  <tr key={row.id} className={cn("group/row", isUnassigned && "bg-amber-50/50 dark:bg-amber-950/10")}>
                    <td className={cn("sticky left-0 z-[5] border-b border-r px-2 py-2 align-top sm:px-3", isUnassigned ? "bg-amber-50 dark:bg-amber-950" : "bg-card")}>
                      <div className="flex min-w-0 items-center gap-2">
                        {isUnassigned ? (
                          <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 sm:flex"><UserX className="h-4 w-4" /></span>
                        ) : (
                          <Avatar className="hidden h-8 w-8 shrink-0 sm:flex">
                            {row.avatar && <AvatarImage src={row.avatar} alt="" className="object-cover" />}
                            <AvatarFallback className="text-xs">{initials(row.name)}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium" title={row.name}>{row.name}</p>
                          {row.sub && <p className="truncate text-xs text-muted-foreground">{row.sub}</p>}
                        </div>
                        {!isUnassigned && (
                          <Link
                            href={`/print/calendar?kind=${mode}&id=${row.id}&month=${monday.slice(0, 7)}`}
                            aria-label={`Printable calendar for ${row.name}`}
                            title="Printable month calendar"
                            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover/row:opacity-100 sm:flex"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </td>
                    {days.map((d) => {
                      const cell = grid.get(row.id)?.get(d) ?? [];
                      const key = `${row.id}|${d}`;
                      return (
                        <td
                          key={d}
                          onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropKey(key); } }}
                          onDragLeave={() => setDropKey((k) => (k === key ? null : k))}
                          onDrop={onDrop(row.id, d)}
                          className={cn(
                            "group/cell relative border-b border-r p-1 align-top transition-colors",
                            compact ? "h-11" : "h-[72px]",
                            d === today && "bg-primary/[0.03]",
                            dropKey === key && "bg-primary/10 ring-2 ring-inset ring-primary/40",
                          )}
                        >
                          <div className={compact ? "space-y-0.5" : "space-y-1"}>
                            {cell.map((s) => {
                              const canDrag = !locked(s);
                              const type = resolveShiftType(s, types);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  draggable={canDrag}
                                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", `${s.id}|${row.id}`); e.dataTransfer.effectAllowed = "move"; setDragId(s.id); }}
                                  onDragEnd={() => { setDragId(null); setDropKey(null); }}
                                  onClick={() => setOpenId(s.id)}
                                  title={`${formatTime(s.startTime, tz)}-${formatTime(s.endTime, tz)} · ${type.name} · ${chipLabel(s, row.id)} · ${s.status}${s.status === "Cancelled" ? (s.cancelledBy === "client" || (!s.cancelledBy && s.cancelPay) ? " (client billed)" : " (no charge)") : ""}${s.bonusAmount ? ` · $${s.bonusAmount} bonus` : ""}${s.awaitingConfirmation ? " · awaiting confirmation" : ""}`}
                                  className={cn(
                                    "group/chip relative flex w-full items-start gap-1 rounded-md border border-l-4 px-1.5 text-left text-xs shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
                                    compact ? "py-0.5" : "py-1",
                                    chipStyle(s),
                                    isUnassigned && "border-l-amber-500 bg-amber-50 text-amber-950",
                                    canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                                    dragId === s.id && "opacity-40",
                                    busyId === s.id && "animate-pulse",
                                  )}
                                >
                                  {showTags && (
                                    <span aria-hidden className="absolute right-1 top-1 h-1.5 w-4 rounded-full" style={{ background: type.colour }} />
                                  )}
                                  {canDrag && <GripVertical className={cn("absolute right-0.5 h-3 w-3 opacity-0 transition-opacity group-hover/chip:opacity-50", showTags ? "top-3" : "top-1")} />}
                                  <span className="min-w-0 flex-1 pr-4">
                                    <span className="flex flex-wrap items-center gap-x-1 font-semibold tabular-nums">
                                      {formatTime(s.startTime, tz)}-{formatTime(s.endTime, tz)}
                                      {s.isSleepover && <Moon className="h-3 w-3" aria-label="Sleepover" />}
                                      {!!s.bonusAmount && <Gift className="h-3 w-3 text-emerald-600" aria-label={`${s.bonusAmount} dollar bonus`} />}
                                      {s.awaitingConfirmation && <Hourglass className="h-3 w-3 text-amber-600" aria-label="Awaiting confirmation" />}
                                      {compact && <span className="truncate font-normal opacity-80">{chipLabel(s, row.id)}</span>}
                                    </span>
                                    {!compact && <span className="block truncate opacity-60">{type.name}</span>}
                                    {!compact && <span className="block truncate font-medium opacity-90">{chipLabel(s, row.id)}</span>}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            aria-label={`New shift on ${d}${isUnassigned ? "" : ` for ${row.name}`}`}
                            onClick={() => setCreate({
                              date: d,
                              ...(mode === "staff" && !isUnassigned ? { workerIds: [row.id] } : {}),
                              ...(mode === "client" ? { clientIds: [row.id] } : {}),
                            })}
                            className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/cell:opacity-100 focus:opacity-100"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      );
                    })}
                    <td className="border-b px-2 py-2 text-right align-top text-sm tabular-nums text-muted-foreground">{h ? h.toFixed(1) : "-"}</td>
                  </tr>
                );
              })}
              {!loading && rows.length === (mode === "staff" ? 1 : 0) && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{q ? "No one matches that search." : "Nothing rostered this week."}</td></tr>
              )}
            </tbody>
            {!loading && (
              <tfoot>
                <tr className="bg-muted/40 text-xs">
                  <td className="sticky left-0 z-[5] border-r bg-muted px-2 py-2 font-semibold sm:px-3">This week</td>
                  {days.map((d) => {
                    const ds = weekShifts.filter((s) => s.date === d && s.status !== "Cancelled");
                    const open = ds.filter((s) => workersOf(s).length < (s.requiredWorkers ?? 1)).length;
                    return (
                      <td key={d} className="border-r px-2 py-2 text-center">
                        <div className="font-medium">{ds.length} shift{ds.length === 1 ? "" : "s"}</div>
                        {open > 0 ? <div className="text-amber-700">{open} unfilled</div> : <div className="text-muted-foreground">{ds.reduce((a, s) => a + hours(s), 0).toFixed(1)} h</div>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{weekShifts.filter((s) => s.status !== "Cancelled").reduce((a, s) => a + hours(s), 0).toFixed(1)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map(([k, cls]) => (
          <span key={k} className="flex items-center gap-1.5"><span className={cn("h-3.5 w-6 rounded-sm border border-l-4", cls)} />{k}</span>
        ))}
        {showTags && types.map((t) => (
          <span key={t.id} className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full" style={{ background: t.colour }} />{t.name}</span>
        ))}
        <span className="ml-auto">Drag a shift to another person or day. Click a shift to edit it.</span>
      </div>

      <ShiftDetailSheet shiftId={openId} onClose={() => setOpenId(null)} />
      {create && (
        <CreateShiftsDialog
          key={JSON.stringify(create)}
          isOpen
          onClose={() => setCreate(null)}
          defaults={{ date: create.date, clientIds: create.clientIds, workerIds: create.workerIds }}
        />
      )}
    </div>
  );
}
