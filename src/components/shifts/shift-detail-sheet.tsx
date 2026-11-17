"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Scissors, UserMinus, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useCatalog } from "@/hooks/use-catalog";
import { useClients } from "@/hooks/use-clients";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useOrganisation } from "@/hooks/use-organisation";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";
import { formatTime, formatWhen, isoToZonedInput, money, zonedToIso } from "@/lib/format";
import { parseRpcError, shiftRpc, type Scope } from "@/lib/shift-rpc";

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Detail = any;

export default function ShiftDetailSheet({
  shiftId, onClose, onChanged,
}: { shiftId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { toast } = useToast();
  const { org } = useOrganisation();
  const { items, families } = useCatalog();
  const { clients } = useClients();
  const { caregivers } = useCaregivers();
  const [shift, setShift] = useState<Detail | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [addWorker, setAddWorker] = useState("");
  const [addClient, setAddClient] = useState("");
  const [scope, setScope] = useState<Scope>("this");
  const [splitTime, setSplitTime] = useState("");
  const [splitItem, setSplitItem] = useState("");
  const [splitSleepover, setSplitSleepover] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPay, setCancelPay] = useState(false);
  const [edit, setEdit] = useState<Record<string, { in: string; out: string; brk: string }>>({});

  const tz = org.timezone;

  const load = useCallback(async () => {
    if (!shiftId) return;
    const [s, n] = await Promise.all([
      supabase
        .from("shifts")
        .select("*, sites(name), shift_clients(client_id, clients(first_name,last_name)), shift_workers(*, caregivers(name)), shift_segments(*, support_items(name))")
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
      setEdit(next);
    }
  }, [shiftId, tz, toast]);

  useEffect(() => { setShift(null); void load(); }, [load]);

  // Workers write notes on their phones; show them here as they arrive.
  useEffect(() => {
    if (!shiftId) return;
    return subscribeToTable("shift_notes", () => void load(), { filter: `shift_id=eq.${shiftId}` });
  }, [shiftId, load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: label });
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: "Could not do that", description: parseRpcError(e).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const approved = !!shift?.approved_at;
  const started = (shift?.shift_workers ?? []).some((w: any) => w.clock_in_time);
  const editable = shift && !approved && !started && !shift.deleted && !["Cancelled", "Completed"].includes(shift.status);
  const inSeries = !!shift?.series_id;
  const total = useMemo(() => (shift?.shift_segments ?? []).reduce((a: number, s: any) => a + Number(s.bill_amount), 0), [shift]);
  const workerIds = (shift?.shift_workers ?? []).map((w: any) => w.caregiver_id);
  const clientIds = (shift?.shift_clients ?? []).map((c: any) => c.client_id);

  const splitAt = () => {
    if (!splitTime) return toast({ title: "Choose a time to split at", variant: "destructive" });
    const opts = { itemNumber: splitItem || null, sleepover: splitSleepover ? true : null };
    return run("Shift split", async () => {
      const r = await shiftRpc.splitSeries(shift.id, splitTime, scope, opts);
      if (r.new_shift_ids.length === 0) throw new Error(`not_splittable: nothing was split (${r.skipped[0]?.reason ?? "check the time"})`);
      if (r.skipped.length) toast({ title: `${r.skipped.length} shift(s) could not be split`, description: "They had already started, been approved, or the time fell outside them." });
    });
  };

  if (!shiftId) return null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {!shift ? (
          <p className="p-6 text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-5">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {formatWhen(shift.start_time, tz)} - {formatTime(shift.end_time, tz)}
                <Badge variant="secondary">{shift.status}</Badge>
                {approved && <Badge className="bg-emerald-100 text-emerald-800" variant="secondary">Approved</Badge>}
                {shift.approval_status === "rejected" && <Badge variant="destructive">Sent back</Badge>}
              </SheetTitle>
              <SheetDescription>
                {shift.sites?.name ? `${shift.sites.name} | ` : ""}Ratio {shift.ratio} | {shift.is_sleepover ? "Sleepover" : "Active"}
                {shift.item_number ? ` | Cost code ${shift.item_number}` : shift.support_family ? ` | Family ${shift.support_family}` : ""}
              </SheetDescription>
            </SheetHeader>

            {shift.pricing_warning && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Pricing: {shift.pricing_warning}</p>}
            {shift.reject_reason && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Sent back: {shift.reject_reason}</p>}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Participants</h3>
              {(shift.shift_clients ?? []).map((c: any) => (
                <div key={c.client_id} className="flex items-center justify-between text-sm">
                  <span>{c.clients?.first_name} {c.clients?.last_name}</span>
                  {editable && clientIds.length > 1 && (
                    <Button size="icon" variant="ghost" disabled={busy} onClick={() => run("Participant removed", () => shiftRpc.removeClient(shift.id, c.client_id))}><UserMinus className="h-4 w-4" /></Button>
                  )}
                </div>
              ))}
              {editable && (
                <div className="flex gap-2">
                  <select className={selectCls} value={addClient} onChange={(e) => setAddClient(e.target.value)}>
                    <option value="">Add a participant</option>
                    {clients.filter((c) => !clientIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                  </select>
                  <Button size="sm" disabled={!addClient || busy} onClick={() => run("Participant added", async () => { await shiftRpc.addClient(shift.id, addClient, scope); setAddClient(""); })}><UserPlus className="h-4 w-4" /></Button>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Support workers ({workerIds.length} of {shift.required_workers})</h3>
              {(shift.shift_workers ?? []).map((w: any) => (
                <div key={w.caregiver_id} className="space-y-2 rounded-md border p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{w.caregivers?.name} <span className="text-xs text-muted-foreground">{w.role}</span></span>
                    {editable && !w.clock_in_time && (
                      <Button size="icon" variant="ghost" disabled={busy} onClick={() => run("Worker removed", () => shiftRpc.removeWorker(shift.id, w.caregiver_id, scope))}><UserMinus className="h-4 w-4" /></Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {w.clock_in_time ? `In ${formatTime(w.clock_in_time, tz)}${w.clock_in_distance_m != null ? ` (${w.clock_in_distance_m} m from address)` : ""}` : "Not started"}
                    {w.clock_out_time ? ` | Out ${formatTime(w.clock_out_time, tz)} | ${Number(w.hours_worked ?? 0).toFixed(2)} h` : ""}
                    {approved && w.pay_amount != null ? ` | Pay ${money(w.pay_amount)}` : ""}
                  </div>
                  {!approved && !shift.deleted && (w.clock_in_time || ["Completed", "In Progress", "Late", "No Show"].includes(shift.status)) && edit[w.caregiver_id] && (
                    <div className="grid grid-cols-7 items-end gap-1">
                      <div className="col-span-3"><Label className="text-xs">In</Label><Input type="datetime-local" value={edit[w.caregiver_id].in} onChange={(e) => setEdit({ ...edit, [w.caregiver_id]: { ...edit[w.caregiver_id], in: e.target.value } })} /></div>
                      <div className="col-span-3"><Label className="text-xs">Out</Label><Input type="datetime-local" value={edit[w.caregiver_id].out} onChange={(e) => setEdit({ ...edit, [w.caregiver_id]: { ...edit[w.caregiver_id], out: e.target.value } })} /></div>
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
              {editable && (
                <div className="flex gap-2">
                  <select className={selectCls} value={addWorker} onChange={(e) => setAddWorker(e.target.value)}>
                    <option value="">Add a support worker</option>
                    {caregivers.filter((c) => !workerIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button size="sm" disabled={!addWorker || busy} onClick={() => run("Worker added", async () => { await shiftRpc.addWorker(shift.id, addWorker, scope); setAddWorker(""); })}><UserPlus className="h-4 w-4" /></Button>
                </div>
              )}
              {editable && inSeries && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  Apply staffing changes to
                  <select className={`${selectCls} w-auto`} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                    <option value="this">this shift only</option>
                    <option value="following">this and following</option>
                    <option value="all">the whole series</option>
                  </select>
                </div>
              )}
              {editable && workerIds.length === 0 && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Offered to the team", () => shiftRpc.publish(shift.id))}>Offer to support workers</Button>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Price</h3>
              {(shift.shift_segments ?? []).length === 0 && <p className="text-sm text-muted-foreground">Not priced yet.</p>}
              {(shift.shift_segments ?? []).sort((a: any, b: any) => a.seg_start.localeCompare(b.seg_start)).map((s: any) => (
                <div key={s.id} className="flex justify-between text-sm">
                  <span>{formatTime(s.seg_start, tz)}-{formatTime(s.seg_end, tz)} {s.support_items?.name} <span className="text-muted-foreground">{s.item_number}</span></span>
                  <span>{Number(s.units)} x {money(s.bill_rate)} = {money(s.bill_amount)}</span>
                </div>
              ))}
              {(shift.shift_segments ?? []).length > 0 && <div className="flex justify-between border-t pt-2 text-sm font-semibold"><span>Total billed</span><span>{money(total)}</span></div>}
            </section>

            {editable && (
              <section className="space-y-2 rounded-md border p-3">
                <h3 className="flex items-center gap-1 text-sm font-semibold"><Scissors className="h-4 w-4" />Split this shift</h3>
                <p className="text-xs text-muted-foreground">
                  Cuts the shift in two at a time of day. The second part can use a different cost code (for example morning then afternoon rates).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Split at (local time)</Label><Input type="time" value={splitTime} onChange={(e) => setSplitTime(e.target.value)} /></div>
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

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Shift notes ({notes.length})</h3>
              {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="rounded-md bg-muted/50 p-2 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{n.caregivers?.name} about {n.clients?.first_name} {n.clients?.last_name} | {n.category}</span>
                    <span>{formatWhen(n.timestamp, tz)}{n.follow_up ? " | follow up" : ""}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{n.note}</p>
                </div>
              ))}
            </section>

            <section className="space-y-2 border-t pt-4">
              <div className="flex flex-wrap gap-2">
                {!approved && !shift.deleted && (
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
                        if (r) void run("Sent back to worker", () => shiftRpc.reject(shift.id, r));
                      }}><X className="mr-1 h-4 w-4" />Send back</Button>
                    )}
                  </>
                )}
                {approved && <Button variant="outline" disabled={busy} onClick={() => run("Approval removed", () => shiftRpc.unapprove(shift.id))}>Remove approval</Button>}
              </div>
              {editable && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label className="text-xs">Cancel this shift</Label>
                  <Input placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={cancelPay} onCheckedChange={(v) => setCancelPay(!!v)} />Short-notice cancellation (worker is paid, participant is billed)</label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Shift cancelled", () => shiftRpc.cancel([shift.id], cancelReason || null, cancelPay))}>Cancel shift</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => window.confirm(inSeries && scope !== "this" ? "Delete these shifts?" : "Delete this shift?") && run("Deleted", async () => { await shiftRpc.remove(shift.id, scope); onClose(); })}>Delete{inSeries && scope !== "this" ? ` (${scope})` : ""}</Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
