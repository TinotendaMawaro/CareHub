"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Check, Hourglass, Plane, Plus, Search, Stethoscope, Trash2, UserRound, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pager, usePaged } from "@/components/ui/pager";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useOrganisation } from "@/hooks/use-organisation";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/avatar";
import { isoToZonedInput } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayLabel } from "@/lib/week";
import { cn } from "@/lib/utils";

export const LEAVE_TYPES = ["Annual leave", "Personal/carer's leave", "Sick leave", "Unpaid leave", "Unavailable", "Other"] as const;
type Status = "Pending" | "Approved" | "Rejected";
type Req = {
  id: string; caregiver_id: string; start_date: string; end_date: string; reason: string | null; status: Status; leave_type: string; requested_at: string;
  caregivers: { name: string; profile_picture_url: string | null } | null;
};
type Conflict = { shifts: number; clients: string[] };

const selectCls = "h-9 rounded-lg border border-input bg-card px-2 text-sm shadow-sm";
const fmt = (ymd: string) => { const l = dayLabel(ymd); return `${l.weekday} ${l.day} ${l.month}`; };
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000) + 1;

export function LeaveView() {
  const { org } = useOrganisation();
  const { toast } = useToast();
  const today = isoToZonedInput(new Date(), org.timezone).slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 30));
  const [status, setStatus] = useState<Status | "all">("all");
  const [type, setType] = useState<string>("all");
  const [q, setQ] = useState("");
  const [reqs, setReqs] = useState<Req[]>([]);
  const [conflicts, setConflicts] = useState<Record<string, Conflict>>({});
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("time_off_requests")
      .select("id,caregiver_id,start_date,end_date,reason,status,leave_type,requested_at,caregivers(name,profile_picture_url)")
      .lte("start_date", to).gte("end_date", from)
      .order("start_date");
    const list = (data ?? []) as unknown as Req[];
    setReqs(list);
    setLoaded(true);

    // Shifts each person is rostered on while they'd be away.
    const active = list.filter((r) => r.status !== "Rejected");
    if (active.length === 0) return setConflicts({});
    const min = active.reduce((a, r) => (r.start_date < a ? r.start_date : a), active[0].start_date);
    const max = active.reduce((a, r) => (r.end_date > a ? r.end_date : a), active[0].end_date);
    const { data: sw } = await supabase
      .from("shift_workers")
      .select("caregiver_id, shifts!inner(id,date,status,deleted,shift_clients(clients(first_name,last_name)))")
      .in("caregiver_id", [...new Set(active.map((r) => r.caregiver_id))])
      .eq("shifts.deleted", false).neq("shifts.status", "Cancelled")
      .gte("shifts.date", min).lte("shifts.date", max);
    const out: Record<string, Conflict> = {};
    for (const r of active) {
      const hits = ((sw ?? []) as any[]).filter((x) => x.caregiver_id === r.caregiver_id && x.shifts.date >= r.start_date && x.shifts.date <= r.end_date);
      if (hits.length) {
        out[r.id] = {
          shifts: hits.length,
          clients: [...new Set(hits.flatMap((h) => (h.shifts.shift_clients ?? []).map((c: any) => [c.clients?.first_name, c.clients?.last_name].filter(Boolean).join(" "))))].filter(Boolean),
        };
      }
    }
    setConflicts(out);
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return reqs.filter((r) => (status === "all" || r.status === status) && (type === "all" || r.leave_type === type) && (!s || (r.caregivers?.name ?? "").toLowerCase().includes(s)));
  }, [reqs, status, type, q]);
  const paged = usePaged(shown, 10, `${status}|${type}|${q}|${from}|${to}`);

  const approved = reqs.filter((r) => r.status === "Approved");
  const kpi = {
    today: new Set(approved.filter((r) => r.start_date <= today && r.end_date >= today).map((r) => r.caregiver_id)).size,
    upcoming: approved.filter((r) => r.start_date > today).length,
    pending: reqs.filter((r) => r.status === "Pending").length,
    conflicts: Object.values(conflicts).reduce((a, c) => a + c.shifts, 0),
    sick: new Set(approved.filter((r) => r.leave_type === "Sick leave" && r.start_date <= today && r.end_date >= today).map((r) => r.caregiver_id)).size,
    clients: new Set(Object.values(conflicts).flatMap((c) => c.clients)).size,
  };

  async function decide(r: Req, next: Status) {
    const { error } = await supabase.from("time_off_requests").update({ status: next }).eq("id", r.id);
    if (error) return toast({ title: "Could not update", description: error.message, variant: "destructive" });
    toast({ title: `${next === "Approved" ? "Approved" : "Declined"}: ${r.caregivers?.name}`, description: next === "Approved" && conflicts[r.id] ? `${conflicts[r.id].shifts} rostered shift(s) overlap. Reassign them on the Calendar.` : undefined });
    await load();
  }
  async function remove(r: Req) {
    if (!window.confirm(`Delete this leave for ${r.caregivers?.name}?`)) return;
    const { error } = await supabase.from("time_off_requests").delete().eq("id", r.id);
    if (error) return toast({ title: "Could not delete", description: error.message, variant: "destructive" });
    await load();
  }

  const Kpi = ({ label, value, sub, icon: Icon, tone, onClick }: { label: string; value: number; sub: string; icon: React.ComponentType<{ className?: string }>; tone?: "warn" | "bad"; onClick?: () => void }) => (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="h-full p-4 transition-all hover:shadow-md">
        <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className={cn("h-4 w-4", value && tone === "bad" ? "text-destructive" : value && tone === "warn" ? "text-amber-600" : "text-muted-foreground")} /></div>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </Card>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="On leave today" value={kpi.today} sub="Staff" icon={Plane} />
        <Kpi label="Upcoming leave" value={kpi.upcoming} sub="Approved requests" icon={CalendarClock} onClick={() => setStatus("Approved")} />
        <Kpi label="Pending" value={kpi.pending} sub="Waiting for a decision" icon={Hourglass} tone="warn" onClick={() => setStatus("Pending")} />
        <Kpi label="Shift conflicts" value={kpi.conflicts} sub="Rostered while away" icon={AlertTriangle} tone="bad" />
        <Kpi label="Sick leave" value={kpi.sick} sub="Staff off sick today" icon={Stethoscope} />
        <Kpi label="Clients impacted" value={kpi.clients} sub="By leave conflicts" icon={UserRound} tone="warn" />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 w-48 pl-8" placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select aria-label="Status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as Status | "all")}>
              <option value="all">Any status</option><option>Pending</option><option>Approved</option><option value="Rejected">Declined</option>
            </select>
            <select aria-label="Leave type" className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All types</option>{LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <div className="flex items-center gap-1 text-sm">
              <Input type="date" className="h-9 w-[150px]" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
              <span className="text-muted-foreground">to</span>
              <Input type="date" className="h-9 w-[150px]" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
            </div>
            <Button className="ml-auto" size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Add leave</Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead><TableHead>Dates</TableHead><TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead>Conflicts</TableHead><TableHead className="hidden lg:table-cell">Reason</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.rows.map((r) => {
                  const c = conflicts[r.id];
                  const startsIn = daysBetween(today, r.start_date) - 1;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar className="h-8 w-8">
                            {r.caregivers?.profile_picture_url && <AvatarImage src={r.caregivers.profile_picture_url} alt="" className="object-cover" />}
                            <AvatarFallback className="text-xs">{initials(r.caregivers?.name)}</AvatarFallback>
                          </Avatar>
                          <span className="max-w-[160px] truncate font-medium">{r.caregivers?.name ?? "Staff"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="text-sm">{fmt(r.start_date)}{r.end_date !== r.start_date ? ` - ${fmt(r.end_date)}` : ""}</p>
                        <p className="text-xs text-muted-foreground">{daysBetween(r.start_date, r.end_date)} day{daysBetween(r.start_date, r.end_date) === 1 ? "" : "s"}</p>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm sm:table-cell">{r.leave_type}</TableCell>
                      <TableCell>
                        {c ? (
                          <Link href="/dashboard/schedule" className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive hover:underline" title={c.clients.join(", ")}>
                            <AlertTriangle className="h-3 w-3" />{c.shifts} shift{c.shifts === 1 ? "" : "s"}
                          </Link>
                        ) : <span className="text-xs text-muted-foreground">None</span>}
                      </TableCell>
                      <TableCell className="hidden max-w-[220px] truncate text-sm text-muted-foreground lg:table-cell" title={r.reason ?? ""}>{r.reason || "-"}</TableCell>
                      <TableCell>
                        {r.status === "Approved" && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>}
                        {r.status === "Rejected" && <Badge variant="secondary">Declined</Badge>}
                        {r.status === "Pending" && (
                          <div>
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>
                            {startsIn >= 0 && <p className="mt-0.5 text-[11px] text-muted-foreground">{startsIn === 0 ? "Starts today" : `Starts in ${startsIn} day${startsIn === 1 ? "" : "s"}`}</p>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status === "Pending" && (
                            <>
                              <Button size="sm" variant="outline" className="h-8" onClick={() => void decide(r, "Approved")}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => void decide(r, "Rejected")}><X className="mr-1 h-3.5 w-3.5" />Decline</Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Delete leave" onClick={() => void remove(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {loaded && paged.rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No leave in this period.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pager {...paged.pager} />
        </CardContent>
      </Card>

      <AddLeaveDialog open={adding} onOpenChange={setAdding} defaultDate={today} onDone={load} />
    </div>
  );
}

function AddLeaveDialog({ open, onOpenChange, defaultDate, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; defaultDate: string; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ caregiver: "", type: "Annual leave", from: defaultDate, to: defaultDate, reason: "", status: "Approved" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ caregiver: "", type: "Annual leave", from: defaultDate, to: defaultDate, reason: "", status: "Approved" });
    void supabase.from("caregivers").select("id,name").eq("contract_status", "Active").order("name").then(({ data }) => setStaff((data ?? []) as { id: string; name: string }[]));
  }, [open, defaultDate]);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("time_off_requests").insert({
      caregiver_id: form.caregiver, start_date: form.from, end_date: form.to, reason: form.reason.trim() || null, leave_type: form.type, status: form.status,
    });
    setBusy(false);
    if (error) return toast({ title: "Could not add leave", description: error.message, variant: "destructive" });
    toast({ title: "Leave added" });
    onOpenChange(false);
    await onDone();
  }

  const bad = form.to < form.from;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add leave</DialogTitle><DialogDescription>Record leave or unavailability for a staff member.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Staff</Label>
            <select aria-label="Staff member" className={`${selectCls} w-full`} value={form.caregiver} onChange={(e) => setForm({ ...form, caregiver: e.target.value })}>
              <option value="">Choose...</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><Label>Type</Label>
            <select aria-label="Leave type" className={`${selectCls} w-full`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>From</Label><Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} /></div>
            <div><Label>To</Label><Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
          </div>
          {bad && <p className="text-xs text-destructive">The end date is before the start date.</p>}
          <div><Label>Status</Label>
            <select aria-label="Status" className={`${selectCls} w-full`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Approved</option><option>Pending</option>
            </select>
          </div>
          <div><Label>Reason (optional)</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || !form.caregiver || bad}>{busy ? "Saving..." : "Add leave"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
