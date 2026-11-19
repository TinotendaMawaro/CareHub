"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban, Check, CheckCircle2, Circle, Clock3, Copy, Gift, History, Lock, MapPin, Receipt, RotateCcw,
  Scissors, Sparkles, Timer, Trash2, UserMinus, UserPlus, X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CreateShiftsDialog from "@/components/shifts/create-shifts-dialog";
import { CancelShiftDialog } from "@/components/shifts/cancel-shift-dialog";
import { ShiftSetupFields, setupFromShift, setupToDetails, type SetupValue } from "@/components/shifts/shift-setup-fields";
import { useToast } from "@/hooks/use-toast";
import { useCatalog } from "@/hooks/use-catalog";
import { useClients } from "@/hooks/use-clients";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useOrganisation } from "@/hooks/use-organisation";
import { useShiftTypes } from "@/hooks/use-shift-types";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";
import { formatTime, formatWhen, isoToZonedInput, money, zonedToIso } from "@/lib/format";
import { NDIS_CANCEL_REASONS, parseRpcError, shiftRpc, type Scope } from "@/lib/shift-rpc";
import { resolveShiftType, readableOn } from "@/lib/shift-type";
import { findWorkerSuggestions, type WorkerSuggestion } from "@/lib/shiftApi";
import { initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Detail = any;

const ACTIONS: Record<string, string> = {
  shifts_created: "Shift created",
  rescheduled: "Time changed",
  shift_split: "Split",
  shift_details_updated: "Setup changed",
  shift_cancelled: "Cancelled",
  shift_rebooked: "Rebooked",
  shift_approved: "Approved",
  shift_unapproved: "Approval removed",
  shift_rejected: "Sent back to staff",
  times_adjusted: "Recorded times corrected",
  assigned: "Staff assigned",
  unassigned: "Staff unassigned",
  sms_sent: "SMS sent",
};
const FIELD_LABELS: Record<string, string> = {
  shift_type_id: "type", bonus_amount: "bonus", planned_break_minutes: "break", break_paid: "break pay",
  address: "address", dropoff_address: "drop-off", notes: "instructions", tasks: "tasks",
};

export default function ShiftDetailSheet({
  shiftId, onClose, onChanged,
}: { shiftId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { toast } = useToast();
  const { org } = useOrganisation();
  const { items } = useCatalog();
  const { clients } = useClients();
  const { caregivers } = useCaregivers();
  const { types } = useShiftTypes();
  const [shift, setShift] = useState<Detail | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("details");
  const [addWorker, setAddWorker] = useState("");
  const [addClient, setAddClient] = useState("");
  const [scope, setScope] = useState<Scope>("this");
  const [splitTime, setSplitTime] = useState("");
  const [splitItem, setSplitItem] = useState("");
  const [splitSleepover, setSplitSleepover] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  // Bumped on every Copy so the dialog starts fresh, while staying mounted so closing it releases the page lock.
  const [copyKey, setCopyKey] = useState(0);
  const [edit, setEdit] = useState<Record<string, { in: string; out: string; brk: string }>>({});
  const [when, setWhen] = useState({ date: "", start: "", end: "" });
  const [setup, setSetup] = useState<SetupValue | null>(null);
  const [setupDirty, setSetupDirty] = useState(false);
  const [history, setHistory] = useState<any[] | null>(null);
  const [payEstimate, setPayEstimate] = useState<Record<string, number>>({});
  const formKeys = useRef<{ when?: string; edit?: string; setup?: string }>({});
  // Opening or closing the sheet discards unsaved edits. Declared before the loading effect so it runs first.
  useEffect(() => { formKeys.current = {}; setTab("details"); setHistory(null); setSetupDirty(false); setPayEstimate({}); }, [shiftId]);
  const [suggested, setSuggested] = useState<WorkerSuggestion[] | null>(null);

  const tz = org.timezone;
  const step = org.minuteInterval * 60;

  const load = useCallback(async () => {
    if (!shiftId) return;
    const [s, n] = await Promise.all([
      supabase
        .from("shifts")
        .select("*, sites(name,address), shift_clients(client_id, clients(first_name,last_name,address)), shift_workers(*, caregivers(name)), shift_segments(*, support_items(name)), shift_tasks(*, caregivers:done_by(name))")
        .eq("id", shiftId)
        .single(),
      supabase.from("shift_notes").select("*, caregivers(name), clients(first_name,last_name)").eq("shift_id", shiftId).order("timestamp", { ascending: false }),
    ]);
    if (s.error) toast({ title: "Could not load shift", description: s.error.message, variant: "destructive" });
    setShift(s.data);
    setNotes(n.data ?? []);
    if (s.data) {
      const next: Record<string, { in: string; out: string; brk: string }> = {};
      for (const w of s.data.shift_workers ?? []) {
        next[w.caregiver_id] = { in: isoToZonedInput(w.clock_in_time, tz), out: isoToZonedInput(w.clock_out_time, tz), brk: String(w.break_minutes ?? 0) };
      }
      // Reset the editable fields only when the saved values change, so a background reload
      // (after assigning staff, a new note arriving) never overwrites what someone is typing.
      const editKey = `${s.data.id}|${JSON.stringify(next)}`;
      if (formKeys.current.edit !== editKey) {
        formKeys.current.edit = editKey;
        setEdit(next);
      }
      const whenKey = `${s.data.id}|${s.data.start_time}|${s.data.end_time}`;
      if (formKeys.current.when !== whenKey) {
        formKeys.current.when = whenKey;
        const st = isoToZonedInput(s.data.start_time, tz);
        const en = isoToZonedInput(s.data.end_time, tz);
        setWhen({ date: st.slice(0, 10), start: st.slice(11, 16), end: en.slice(11, 16) });
      }
      const fresh = setupFromShift(s.data);
      const setupKey = `${s.data.id}|${JSON.stringify(fresh)}`;
      if (formKeys.current.setup !== setupKey) {
        formKeys.current.setup = setupKey;
        setSetup(fresh);
        setSetupDirty(false);
      }
      if (!s.data.approved_at && !s.data.deleted && s.data.status !== "Cancelled") {
        findWorkerSuggestions({ id: s.data.id }, [], 5).then(setSuggested).catch(() => setSuggested([]));
      } else {
        setSuggested([]);
      }
    }
  }, [shiftId, tz, toast]);

  useEffect(() => { setShift(null); void load(); }, [load]);

  // Workers write notes and tick tasks on their phones; show them here as they happen.
  useEffect(() => {
    if (!shiftId) return;
    const offNotes = subscribeToTable("shift_notes", () => void load(), { filter: `shift_id=eq.${shiftId}` });
    const offTasks = subscribeToTable("shift_tasks", () => void load(), { filter: `shift_id=eq.${shiftId}` });
    return () => { offNotes(); offTasks(); };
  }, [shiftId, load]);

  const loadHistory = useCallback(async () => {
    if (!shiftId) return;
    const { data } = await supabase.from("activity_log").select("*").eq("shift_id", shiftId).order("created_at", { ascending: false }).limit(100);
    const ids = [...new Set((data ?? []).map((r: any) => r.user_id).filter(Boolean))];
    const { data: people } = ids.length ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids) : { data: [] as any[] };
    const who = new Map((people ?? []).map((p: any) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email]));
    setHistory((data ?? []).map((r: any) => ({ ...r, who: r.user_id ? who.get(r.user_id) ?? "Office" : "System" })));
  }, [shiftId]);
  useEffect(() => { if (tab === "history") void loadHistory(); }, [tab, loadHistory]);

  // Staff cost: actual pay once approved; otherwise an estimate from the scheduled hours less any unpaid break.
  useEffect(() => {
    if (!shift || shift.approved_at || tab !== "money") return;
    const hours = Math.max(0, (new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime()) / 3_600_000 - (shift.break_paid ? 0 : Number(shift.planned_break_minutes ?? 0) / 60));
    let live = true;
    Promise.all((shift.shift_workers ?? []).map(async (w: any) => {
      const { data } = await supabase.rpc("compute_worker_pay", { p_shift: shift.id, p_caregiver: w.caregiver_id, p_hours: Number((w.hours_worked ?? hours).toFixed(2)) });
      return [w.caregiver_id, Number(data ?? 0)] as const;
    })).then((rows) => live && setPayEstimate(Object.fromEntries(rows))).catch(() => {});
    return () => { live = false; };
  }, [shift, tab]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: label });
      await load();
      if (tab === "history") void loadHistory();
      onChanged?.();
    } catch (e) {
      toast({ title: "Could not do that", description: parseRpcError(e).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const approved = !!shift?.approved_at;
  const cancelled = shift?.status === "Cancelled";
  const started = (shift?.shift_workers ?? []).some((w: any) => w.clock_in_time);
  const editable = shift && !approved && !started && !shift.deleted && !["Cancelled", "Completed"].includes(shift.status);
  const setupEditable = shift && !approved && !shift.deleted && !cancelled;
  const inSeries = !!shift?.series_id;
  const revenue = useMemo(() => (shift?.shift_segments ?? []).reduce((a: number, s: any) => a + Number(s.bill_amount), 0), [shift]);
  const workerIds = (shift?.shift_workers ?? []).map((w: any) => w.caregiver_id);
  const clientIds = (shift?.shift_clients ?? []).map((c: any) => c.client_id);
  const type = shift ? resolveShiftType({ shiftTypeId: shift.shift_type_id, isSleepover: shift.is_sleepover }, types) : null;
  const tasks = useMemo(() => [...(shift?.shift_tasks ?? [])].sort((a: any, b: any) => a.sort - b.sort), [shift]);
  const tasksDone = tasks.filter((t: any) => t.done_at).length;
  const firstClient = shift?.shift_clients?.[0]?.clients;
  const addressHint = shift?.sites?.address || firstClient?.address || "";

  const staffCost = (shift?.shift_workers ?? []).reduce(
    (a: number, w: any) => a + (approved ? Number(w.pay_amount ?? 0) : payEstimate[w.caregiver_id] ?? 0), 0,
  ) + Number(shift?.bonus_amount ?? 0) * Math.max(1, workerIds.length);
  const billable = cancelled && shift?.cancelled_by === "provider" ? 0 : revenue;
  const payable = cancelled && shift?.cancelled_by === "provider" ? 0 : staffCost;
  const margin = billable - payable;

  /** Shifts the "apply to" choice covers, for changes made outside the reschedule/split RPCs. */
  async function idsInScope(): Promise<string[]> {
    if (!shift.series_id || scope === "this") return [shift.id];
    let q = supabase.from("shifts").select("id").eq("series_id", shift.series_id).eq("deleted", false).is("approved_at", null);
    if (scope === "following") q = q.gte("start_time", shift.start_time);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => r.id);
  }

  const splitAt = () => {
    if (!splitTime) return toast({ title: "Choose a time to split at", variant: "destructive" });
    const opts = { itemNumber: splitItem || null, sleepover: splitSleepover ? true : null };
    return run("Shift split", async () => {
      const r = await shiftRpc.splitSeries(shift.id, splitTime, scope, opts);
      if (r.new_shift_ids.length === 0) throw new Error(`not_splittable: nothing was split (${r.skipped[0]?.reason ?? "check the time"})`);
      if (r.skipped.length) toast({ title: `${r.skipped.length} shift(s) could not be split`, description: "They had already started, been approved, or the time fell outside them." });
    });
  };

  const scopePicker = inSeries && (
    <select aria-label="Apply changes to" className={`${selectCls} w-auto`} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
      <option value="this">This shift only</option>
      <option value="following">This and following</option>
      <option value="all">The whole series</option>
    </select>
  );

  if (!shiftId) return null;

  const copyDefaults = shift && setup ? {
    date: when.date,
    clientIds,
    workerIds,
    copy: {
      siteId: shift.site_id,
      ratio: shift.ratio,
      family: shift.support_family,
      geofence: shift.geofence_required,
      block: { start_time: when.start, end_time: when.end, item_number: shift.item_number, is_sleepover: shift.is_sleepover },
      setup: { ...setupFromShift(shift) },
    },
  } : undefined;

  return (
    <>
      <Sheet open={!copying} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {!shift || !setup ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-4">
              <SheetHeader className="space-y-2 pr-6 text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  {type && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: type.colour, color: readableOn(type.colour) }}>
                      {type.name}
                    </span>
                  )}
                  <Badge variant="secondary">{shift.status}</Badge>
                  {approved && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" variant="secondary">Approved</Badge>}
                  {shift.approval_status === "rejected" && <Badge variant="destructive">Sent back</Badge>}
                  {Number(shift.bonus_amount) > 0 && <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700"><Gift className="h-3 w-3" />{money(shift.bonus_amount)} bonus</Badge>}
                  {Number(shift.planned_break_minutes) > 0 && <Badge variant="outline" className="gap-1"><Timer className="h-3 w-3" />{shift.planned_break_minutes} min {shift.break_paid ? "paid" : "unpaid"} break</Badge>}
                </div>
                <SheetTitle className="text-lg">{formatWhen(shift.start_time, tz)} - {formatTime(shift.end_time, tz)}</SheetTitle>
                <SheetDescription>
                  {shift.sites?.name ? `${shift.sites.name} | ` : ""}Ratio {shift.ratio}
                  {shift.item_number ? ` | Cost code ${shift.item_number}` : shift.support_family ? ` | Family ${shift.support_family}` : ""}
                </SheetDescription>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => { setCopyKey((k) => k + 1); setCopying(true); }}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</Button>
                  {cancelled && !approved && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Shift rebooked", () => shiftRpc.rebook(shift.id))}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Rebook</Button>
                  )}
                  {(editable || (!approved && !shift.deleted && !started && !cancelled)) && (
                    // Plain buttons, not a menu: a menu inside this modal drawer loses focus to the drawer and closes as it opens.
                    <>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setCancelOpen(true)}><Ban className="mr-1.5 h-3.5 w-3.5" />Cancel shift</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        className="text-destructive hover:text-destructive"
                        onClick={() => window.confirm(inSeries && scope !== "this" ? "Delete these shifts?" : "Delete this shift?") && run("Deleted", async () => { await shiftRpc.remove(shift.id, scope); onClose(); })}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete{inSeries && scope !== "this" ? ` (${scope === "all" ? "whole series" : "this and following"})` : ""}
                      </Button>
                    </>
                  )}
                </div>
              </SheetHeader>

              {approved && (
                <p className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  Read-only: this shift is approved{shift.approved_at ? ` (${formatWhen(shift.approved_at, tz)})` : ""}. Remove the approval to change it.
                </p>
              )}
              {cancelled && (
                <div className={cn(
                  "space-y-1 rounded-md border p-3 text-sm",
                  shift.cancelled_by === "client" || (!shift.cancelled_by && shift.cancel_pay)
                    ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                    : "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100",
                )}>
                  <p className="flex items-center gap-2 font-semibold">
                    {shift.cancelled_by === "client" || (!shift.cancelled_by && shift.cancel_pay)
                      ? <><Receipt className="h-4 w-4" />Client cancelled: client billed, staff paid</>
                      : <><Ban className="h-4 w-4" />We cancelled: no charge, no pay</>}
                  </p>
                  {shift.cancel_ndis_reason && <p>NDIS reason: {NDIS_CANCEL_REASONS.find((r) => r.value === shift.cancel_ndis_reason)?.label}</p>}
                  {shift.cancel_reason && <p className="opacity-80">&ldquo;{shift.cancel_reason}&rdquo;</p>}
                  {shift.cancelled_at && <p className="text-xs opacity-70">{formatWhen(shift.cancelled_at, tz)}</p>}
                </div>
              )}
              {shift.pricing_warning && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Pricing: {shift.pricing_warning}</p>}
              {shift.reject_reason && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Sent back: {shift.reject_reason}</p>}

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                  <TabsTrigger value="money" className="flex-1">Money</TabsTrigger>
                  <TabsTrigger value="notes" className="flex-1">Notes{notes.length ? ` (${notes.length})` : ""}</TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-5">
                  {editable && (
                    <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
                      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Clock3 className="h-4 w-4" />Date and time</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-3 sm:col-span-1">
                          <Label className="text-xs" htmlFor="sh-date">Date</Label>
                          <Input id="sh-date" type="date" value={when.date} disabled={inSeries && scope !== "this"} onChange={(e) => setWhen({ ...when, date: e.target.value })} />
                        </div>
                        <div><Label className="text-xs" htmlFor="sh-start">Start</Label><Input id="sh-start" type="time" step={step} value={when.start} onChange={(e) => setWhen({ ...when, start: e.target.value })} /></div>
                        <div><Label className="text-xs" htmlFor="sh-end">End</Label><Input id="sh-end" type="time" step={step} value={when.end} onChange={(e) => setWhen({ ...when, end: e.target.value })} /></div>
                      </div>
                      {when.end && when.start && when.end <= when.start && (
                        <p className="text-xs text-muted-foreground">Ends the next day (overnight).</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {scopePicker}
                        <Button
                          size="sm"
                          disabled={busy || !when.start || !when.end || !when.date}
                          onClick={() => run("Shift time updated", async () => {
                            const sameDay = isoToZonedInput(shift.start_time, tz).slice(0, 10) === when.date;
                            const r = await shiftRpc.reschedule(shift.id, when.start, when.end, scope, scope === "this" && !sameDay ? when.date : null);
                            if (r.skipped.length) toast({ title: `${r.skipped.length} shift(s) were not changed`, description: "They had started, been approved, or would double-book someone." });
                          })}
                        >
                          Save time
                        </Button>
                      </div>
                    </section>
                  )}

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Clients</h3>
                    {(shift.shift_clients ?? []).map((c: any) => (
                      <div key={c.client_id} className="flex items-center justify-between text-sm">
                        <span>{c.clients?.first_name} {c.clients?.last_name}</span>
                        {editable && clientIds.length > 1 && (
                          <Button size="icon" variant="ghost" aria-label="Remove client" disabled={busy} onClick={() => run("Client removed", () => shiftRpc.removeClient(shift.id, c.client_id))}><UserMinus className="h-4 w-4" /></Button>
                        )}
                      </div>
                    ))}
                    {editable && (
                      <div className="flex gap-2">
                        <select aria-label="Add a client" className={selectCls} value={addClient} onChange={(e) => setAddClient(e.target.value)}>
                          <option value="">Add a client (group shift)</option>
                          {clients.filter((c) => !clientIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                        </select>
                        <Button size="sm" aria-label="Add client" disabled={!addClient || busy} onClick={() => run("Client added", async () => { await shiftRpc.addClient(shift.id, addClient, scope); setAddClient(""); })}><UserPlus className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Staff ({workerIds.length} of {shift.required_workers})</h3>
                    {(shift.shift_workers ?? []).map((w: any) => (
                      <div key={w.caregiver_id} className="space-y-2 rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{w.caregivers?.name} <span className="text-xs text-muted-foreground">{w.role}</span></span>
                          {editable && !w.clock_in_time && (
                            <Button size="icon" variant="ghost" aria-label={`Unassign ${w.caregivers?.name ?? "staff"}`} disabled={busy} onClick={() => run("Staff unassigned", () => shiftRpc.removeWorker(shift.id, w.caregiver_id, scope))}><UserMinus className="h-4 w-4" /></Button>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {w.clock_in_time ? `In ${formatTime(w.clock_in_time, tz)}${w.clock_in_distance_m != null ? ` (${w.clock_in_distance_m} m from address)` : ""}` : "Not started"}
                          {w.clock_out_time ? ` | Out ${formatTime(w.clock_out_time, tz)} | ${Number(w.hours_worked ?? 0).toFixed(2)} h` : ""}
                          {w.break_minutes ? ` | ${w.break_minutes} min break` : ""}
                          {approved && w.pay_amount != null ? ` | Pay ${money(w.pay_amount)}` : ""}
                        </div>
                        {!approved && !shift.deleted && (w.clock_in_time || ["Completed", "In Progress", "Late", "No Show"].includes(shift.status)) && edit[w.caregiver_id] && (
                          <div className="grid grid-cols-7 items-end gap-1">
                            <div className="col-span-3"><Label className="text-xs">In</Label><Input type="datetime-local" step={step} value={edit[w.caregiver_id].in} onChange={(e) => setEdit({ ...edit, [w.caregiver_id]: { ...edit[w.caregiver_id], in: e.target.value } })} /></div>
                            <div className="col-span-3"><Label className="text-xs">Out</Label><Input type="datetime-local" step={step} value={edit[w.caregiver_id].out} onChange={(e) => setEdit({ ...edit, [w.caregiver_id]: { ...edit[w.caregiver_id], out: e.target.value } })} /></div>
                            <div><Label className="text-xs">Break</Label><Input type="number" min={0} value={edit[w.caregiver_id].brk} onChange={(e) => setEdit({ ...edit, [w.caregiver_id]: { ...edit[w.caregiver_id], brk: e.target.value } })} /></div>
                            <Button size="sm" variant="outline" className="col-span-7" disabled={busy}
                              onClick={() => run("Times updated", () => {
                                const v = edit[w.caregiver_id];
                                return shiftRpc.adjust(shift.id, w.caregiver_id, v.in ? zonedToIso(v.in, tz) : null, v.out ? zonedToIso(v.out, tz) : null, Number(v.brk) || 0);
                              })}>Correct recorded times</Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {editable && suggested && suggested.length > 0 && (
                      <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" />Suggested staff</p>
                        {suggested.map((sg) => (
                          <div key={sg.caregiverId} className="flex items-center gap-2 rounded-lg bg-card p-2 shadow-sm">
                            <Avatar className="h-8 w-8">
                              {sg.avatarUrl && <AvatarImage src={sg.avatarUrl} alt="" className="object-cover" />}
                              <AvatarFallback className="text-xs">{initials(sg.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                                {sg.name}
                                {sg.onTeam && <Badge className="h-5 bg-emerald-100 px-1.5 text-[10px] text-emerald-800 hover:bg-emerald-100">Team</Badge>}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{sg.reasons.join(" · ")}</p>
                            </div>
                            <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={busy}
                              onClick={() => run(`${sg.name} assigned`, () => shiftRpc.addWorker(shift.id, sg.caregiverId, scope))}>
                              <UserPlus className="mr-1 h-3.5 w-3.5" />Assign
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {editable && (
                      <div className="flex gap-2">
                        <select aria-label="Assign staff" className={selectCls} value={addWorker} onChange={(e) => setAddWorker(e.target.value)}>
                          <option value="">Assign someone else</option>
                          {caregivers.filter((c) => !workerIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <Button size="sm" aria-label="Assign" disabled={!addWorker || busy} onClick={() => run("Staff assigned", async () => { await shiftRpc.addWorker(shift.id, addWorker, scope); setAddWorker(""); })}><UserPlus className="h-4 w-4" /></Button>
                      </div>
                    )}
                    {editable && workerIds.length === 0 && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Offered to the team", () => shiftRpc.publish(shift.id))}>Offer to staff</Button>
                    )}
                  </section>

                  <section className="space-y-3 rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Shift setup</h3>
                      {!setupEditable && (shift.address || shift.dropoff_address) && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{shift.dropoff_address ? "Has drop-off" : "Custom address"}</span>
                      )}
                    </div>
                    <ShiftSetupFields
                      value={setup}
                      onChange={(v) => { setSetup(v); setSetupDirty(true); }}
                      types={types}
                      disabled={!setupEditable || busy}
                      addressPlaceholder={addressHint}
                    />
                    {setupEditable && (
                      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                        {scopePicker}
                        <Button
                          size="sm"
                          disabled={busy || !setupDirty}
                          onClick={() => run("Shift setup saved", async () => {
                            const ids = await idsInScope();
                            const n = await shiftRpc.setDetails(ids, setupToDetails(setup));
                            if (n < ids.length) toast({ title: `${ids.length - n} shift(s) were not changed`, description: "They are approved or deleted." });
                            formKeys.current.setup = undefined;
                          })}
                        >
                          Save setup{inSeries && scope !== "this" ? ` (${scope === "all" ? "whole series" : "this and following"})` : ""}
                        </Button>
                        {setupDirty && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setSetup(setupFromShift(shift)); setSetupDirty(false); }}>Undo changes</Button>
                        )}
                      </div>
                    )}
                  </section>

                  {editable && (
                    <section className="space-y-2 rounded-md border p-3">
                      <h3 className="flex items-center gap-1 text-sm font-semibold"><Scissors className="h-4 w-4" />Split this shift</h3>
                      <p className="text-xs text-muted-foreground">
                        Cuts the shift in two at a time of day. The second part can use a different cost code (for example morning then afternoon rates).
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">Split at (local time)</Label><Input type="time" step={step} value={splitTime} onChange={(e) => setSplitTime(e.target.value)} /></div>
                        <div>
                          <Label className="text-xs">Apply to</Label>
                          <select className={selectCls} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                            <option value="this">this shift only</option>
                            {inSeries && <option value="following">this and following</option>}
                            {inSeries && <option value="all">the whole series</option>}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Cost code for the second part</Label>
                          <select className={selectCls} value={splitItem} onChange={(e) => setSplitItem(e.target.value)}>
                            <option value="">Same as the first part</option>
                            {items.map((i) => <option key={i.itemNumber} value={i.itemNumber}>{i.itemNumber} - {i.name}</option>)}
                          </select>
                        </div>
                        <label className="col-span-2 flex items-center gap-2 text-sm"><Checkbox checked={splitSleepover} onCheckedChange={(v) => setSplitSleepover(!!v)} />Second part is a sleepover</label>
                      </div>
                      <Button size="sm" disabled={busy} onClick={splitAt}><Scissors className="mr-1 h-4 w-4" />Split</Button>
                    </section>
                  )}
                </TabsContent>

                <TabsContent value="money" className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "Billed", value: billable },
                      { label: approved ? "Staff cost" : "Staff cost (est.)", value: payable },
                      { label: "Margin", value: margin },
                    ].map((m) => (
                      <div key={m.label} className="rounded-xl border p-3">
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                        <p className={cn("mt-1 text-lg font-semibold tabular-nums", m.label === "Margin" && margin < 0 && "text-destructive")}>{money(m.value)}</p>
                      </div>
                    ))}
                  </div>
                  {billable > 0 && <p className="text-center text-xs text-muted-foreground">Margin {((margin / billable) * 100).toFixed(0)}% of the billed amount</p>}
                  {cancelled && <p className="rounded-md bg-muted p-2 text-xs">{shift.cancelled_by === "provider" ? "Cancelled by us, so nothing is billed or paid." : "Cancelled by the client, so it is still billed and paid."}</p>}

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Billing lines</h3>
                    {(shift.shift_segments ?? []).length === 0 && <p className="text-sm text-muted-foreground">Not priced yet. Set a support family or cost code.</p>}
                    {[...(shift.shift_segments ?? [])].sort((a: any, b: any) => a.seg_start.localeCompare(b.seg_start)).map((s: any) => (
                      <div key={s.id} className="flex flex-wrap justify-between gap-x-3 text-sm">
                        <span className="min-w-0">{formatTime(s.seg_start, tz)}-{formatTime(s.seg_end, tz)} {s.support_items?.name} <span className="text-muted-foreground">{s.item_number}</span></span>
                        <span className="tabular-nums">{Number(s.units)} x {money(s.bill_rate)} = {money(s.bill_amount)}</span>
                      </div>
                    ))}
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Staff pay</h3>
                    {(shift.shift_workers ?? []).length === 0 && <p className="text-sm text-muted-foreground">No staff assigned.</p>}
                    {(shift.shift_workers ?? []).map((w: any) => (
                      <div key={w.caregiver_id} className="flex justify-between text-sm">
                        <span>{w.caregivers?.name}</span>
                        <span className="tabular-nums">{money(approved ? w.pay_amount : payEstimate[w.caregiver_id])}</span>
                      </div>
                    ))}
                    {Number(shift.bonus_amount) > 0 && (
                      <div className="flex justify-between text-sm"><span>Shift bonus{workerIds.length > 1 ? ` x ${workerIds.length}` : ""}</span><span className="tabular-nums">{money(Number(shift.bonus_amount) * Math.max(1, workerIds.length))}</span></div>
                    )}
                    {!approved && <p className="text-xs text-muted-foreground">Estimated from the scheduled hours{Number(shift.planned_break_minutes) && !shift.break_paid ? `, less the ${shift.planned_break_minutes} min unpaid break` : ""}. Final pay is set when the shift is approved.</p>}
                  </section>
                </TabsContent>

                <TabsContent value="notes" className="space-y-4">
                  {tasks.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold">Tasks ({tasksDone} of {tasks.length} done)</h3>
                      {tasks.map((t: any) => (
                        <div key={t.id} className="flex items-start gap-2 text-sm">
                          {t.done_at ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className="min-w-0 flex-1">
                            {t.label}{t.mandatory && <Badge variant="outline" className="ml-1.5 h-5 px-1.5 text-[10px]">Required</Badge>}
                            {t.done_at && <span className="block text-xs text-muted-foreground">{t.caregivers?.name ?? "Done"} at {formatTime(t.done_at, tz)}</span>}
                          </span>
                        </div>
                      ))}
                    </section>
                  )}
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Shift notes ({notes.length})</h3>
                    {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet. Staff add them from the app during the shift.</p>}
                    {notes.map((n) => (
                      <div key={n.id} className="rounded-md bg-muted/50 p-2 text-sm">
                        <div className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
                          <span>{n.caregivers?.name} about {n.clients?.first_name} {n.clients?.last_name} | {n.category}</span>
                          <span>{formatWhen(n.timestamp, tz)}{n.follow_up ? " | follow up" : ""}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{n.note}</p>
                      </div>
                    ))}
                  </section>
                </TabsContent>

                <TabsContent value="history" className="space-y-2">
                  {history === null && <p className="text-sm text-muted-foreground">Loading...</p>}
                  {history?.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>}
                  <ol className="relative space-y-3 border-l pl-4">
                    {history?.map((h) => {
                      const fields = Array.isArray(h.meta?.fields) ? h.meta.fields.map((f: string) => FIELD_LABELS[f] ?? f).join(", ") : "";
                      return (
                        <li key={h.id} className="text-sm">
                          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border bg-background" />
                          <p className="flex items-center gap-1.5 font-medium"><History className="h-3.5 w-3.5 text-muted-foreground" />{ACTIONS[h.action] ?? h.action.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">{h.who} · {formatWhen(h.created_at, tz)}</p>
                          {fields && <p className="text-xs">Changed: {fields}</p>}
                          {h.reason && <p className="text-xs">&ldquo;{h.reason}&rdquo;</p>}
                        </li>
                      );
                    })}
                  </ol>
                </TabsContent>
              </Tabs>

              <section className="space-y-2 border-t pt-4">
                <div className="flex flex-wrap gap-2">
                  {!approved && !shift.deleted && !cancelled && (
                    <>
                      <Button disabled={busy} onClick={() => run("Shift approved", async () => {
                        try { await shiftRpc.approve(shift.id); }
                        catch (e) {
                          const { code, message } = parseRpcError(e);
                          if ((code === "not_complete" || code === "not_clocked") && window.confirm(`${message}\n\nApprove using the scheduled times instead?`)) await shiftRpc.approve(shift.id, true);
                          else throw e;
                        }
                      })}><Check className="mr-1 h-4 w-4" />Approve</Button>
                      {shift.status === "Completed" && (
                        <Button variant="outline" disabled={busy} onClick={() => {
                          const r = window.prompt("What needs fixing?");
                          if (r) void run("Sent back to staff", () => shiftRpc.reject(shift.id, r));
                        }}><X className="mr-1 h-4 w-4" />Send back</Button>
                      )}
                    </>
                  )}
                  {approved && <Button variant="outline" disabled={busy} onClick={() => run("Approval removed", () => shiftRpc.unapprove(shift.id))}>Remove approval</Button>}
                </div>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {shift && (
        <CancelShiftDialog
          open={cancelOpen}
          summary={`${formatWhen(shift.start_time, tz)} - ${formatTime(shift.end_time, tz)}`}
          onOpenChange={setCancelOpen}
          onConfirm={(c) => run("Shift cancelled", async () => {
            const n = await shiftRpc.cancel([shift.id], c.reason, c.by, { ndisReason: c.ndisReason, notify: c.notify });
            if (n === 0) throw new Error("not_cancellable: this shift has started, finished or been approved");
          })}
        />
      )}
      {copyKey > 0 && copyDefaults && (
        <CreateShiftsDialog
          key={copyKey}
          isOpen={copying}
          defaults={copyDefaults}
          onClose={() => setCopying(false)}
          onCreated={() => { onChanged?.(); onClose(); }}
        />
      )}
    </>
  );
}
