"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pager, usePaged } from "@/components/ui/pager";
import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ShiftDetailSheet from "@/components/shifts/shift-detail-sheet";
import { useOrganisation } from "@/hooks/use-organisation";
import { useToast } from "@/hooks/use-toast";
import { formatWhen } from "@/lib/format";
import { parseRpcError, shiftRpc } from "@/lib/shift-rpc";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";

type Row = {
  id: string; start_time: string; end_time: string; status: string; approval_status: string; reject_reason: string | null;
  shift_workers: { caregiver_id: string; clock_in_time: string | null; clock_out_time: string | null; hours_worked: number | null; caregivers: { name: string } | null }[];
  shift_clients: { clients: { first_name: string; last_name: string } | null }[];
};

/** What the approver needs to know before signing off. */
function issueFor(r: Row): { label: string; tone: string; ready: boolean } {
  if (r.approval_status === "rejected") return { label: "Sent back", tone: "bg-red-100 text-red-800", ready: false };
  const w = r.shift_workers;
  if (w.length === 0) return { label: "No worker", tone: "bg-slate-100 text-slate-700", ready: false };
  if (w.some((x) => x.clock_in_time && !x.clock_out_time)) return { label: "Forgot to end", tone: "bg-amber-100 text-amber-800", ready: false };
  if (w.some((x) => !x.clock_in_time)) return { label: "Not started", tone: "bg-amber-100 text-amber-800", ready: false };
  return { label: "Ready", tone: "bg-emerald-100 text-emerald-800", ready: true };
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const { org } = useOrganisation();
  const [from, setFrom] = useState(() => new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("shifts")
      .select("id,start_time,end_time,status,approval_status,reject_reason,shift_workers(caregiver_id,clock_in_time,clock_out_time,hours_worked,caregivers(name)),shift_clients(clients(first_name,last_name))")
      .eq("deleted", false)
      .is("approved_at", null)
      .neq("status", "Cancelled")
      .lte("end_time", new Date().toISOString())
      .gte("date", from)
      .lte("date", to)
      .order("start_time", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Could not load shifts", description: error.message, variant: "destructive" });
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, [from, to, toast]);

  useEffect(() => { void load(); return subscribeToTable("shifts", () => void load()); }, [load]);

  const ready = useMemo(() => rows.filter((r) => issueFor(r).ready), [rows]);
  const allReadyPicked = ready.length > 0 && ready.every((r) => picked.has(r.id));

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function approvePicked(useScheduled = false) {
    const ids = [...picked];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const r = await shiftRpc.approveMany(ids, useScheduled);
      toast({
        title: `${r.approved} shift${r.approved === 1 ? "" : "s"} approved`,
        description: r.failed.length ? `${r.failed.length} could not be approved: ${parseRpcError(new Error(r.failed[0].error)).message}` : undefined,
        variant: r.failed.length ? "destructive" : undefined,
      });
      setPicked(new Set());
      await load();
    } catch (e) {
      toast({ title: "Approval failed", description: parseRpcError(e).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const paged = usePaged(rows, 20, rows.length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Approve finished shifts so they flow to timesheets (pay) and invoices (billing). Approved shifts are locked.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Shifts to approve</CardTitle>
            <CardDescription>{rows.length} waiting, {ready.length} ready</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPicked(allReadyPicked ? new Set() : new Set(ready.map((r) => r.id)))}>
              {allReadyPicked ? "Clear selection" : "Select all ready"}
            </Button>
            <Button disabled={picked.size === 0 || busy} onClick={() => approvePicked()}>
              <Check className="mr-1 h-4 w-4" />Approve {picked.size || ""}
            </Button>
            <Button variant="ghost" asChild><Link href="/dashboard/timesheets">Timesheets</Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>When</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead>Workers</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nothing waiting for approval in this range.</TableCell></TableRow>
              )}
              {paged.rows.map((r) => {
                const issue = issueFor(r);
                const hrs = r.shift_workers.reduce((a, w) => a + Number(w.hours_worked ?? 0), 0);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label="Select shift" />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatWhen(r.start_time, org.timezone)}</TableCell>
                    <TableCell>{r.shift_clients.map((c) => `${c.clients?.first_name} ${c.clients?.last_name}`).join(", ")}</TableCell>
                    <TableCell>{r.shift_workers.map((w) => w.caregivers?.name).join(", ") || "-"}</TableCell>
                    <TableCell className="text-right">{hrs ? hrs.toFixed(2) : "-"}</TableCell>
                    <TableCell>
                      <Badge className={issue.tone} variant="secondary">{issue.label}</Badge>
                      {r.reject_reason && <div className="mt-1 text-xs text-red-700">{r.reject_reason}</div>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pager {...paged.pager} />
        </CardContent>
      </Card>

      <ShiftDetailSheet shiftId={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />
    </div>
  );
}
