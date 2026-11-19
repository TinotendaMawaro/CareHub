"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCaregivers } from "@/hooks/use-caregivers";
import { usePayPeriods, useTimesheetAdjustments, useTimesheetTotals, useTimesheets } from "@/hooks/use-timesheets";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { formatWhen, money } from "@/lib/format";

type Line = {
  id: string; start_time: string; end_time: string; status: string; approved_at: string | null;
  approval_status: string; clientName: string; hours: number | null; pay: number | null;
};

export default function TimesheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { caregivers } = useCaregivers();
  const { periods } = usePayPeriods();
  const { timesheets, reload } = useTimesheets();
  const { total } = useTimesheetTotals(id);
  const { adjustments, addAdjustment } = useTimesheetAdjustments(id);
  const [lines, setLines] = useState<Line[]>([]);
  const [adj, setAdj] = useState({ kind: "allowance", hours: "0", amount: "0", reason: "" });

  const timesheet = timesheets.find((t) => t.id === id);
  const caregiver = caregivers.find((c) => c.id === timesheet?.caregiverId);
  const period = periods.find((p) => p.id === timesheet?.payPeriodId);

  const loadLines = useCallback(async () => {
    if (!timesheet || !period) return;
    const { data, error } = await supabase
      .from("shifts")
      .select("id,start_time,end_time,status,approved_at,approval_status,clients(first_name,last_name),shift_workers!inner(caregiver_id,approved_hours,hours_worked,pay_amount)")
      .eq("shift_workers.caregiver_id", timesheet.caregiverId)
      .eq("deleted", false)
      .gte("date", period.periodStart)
      .lte("date", period.periodEnd)
      .order("start_time");
    if (error) {
      toast({ title: "Could not load shifts", description: error.message, variant: "destructive" });
      return;
    }
    setLines(
      (data ?? []).map((s: any) => {
        const w = s.shift_workers[0];
        return {
          id: s.id, start_time: s.start_time, end_time: s.end_time, status: s.status, approved_at: s.approved_at,
          approval_status: s.approval_status,
          clientName: s.clients ? `${s.clients.first_name} ${s.clients.last_name}` : "",
          hours: w.approved_hours ?? w.hours_worked, pay: w.pay_amount,
        };
      })
    );
  }, [timesheet, period, toast]);

  useEffect(() => { void loadLines(); }, [loadLines]);

  async function approveShift(shiftId: string) {
    const { error } = await supabase.rpc("approve_shift", { p_shift: shiftId, p_use_scheduled: false });
    if (error) return toast({ title: "Could not approve", description: error.message, variant: "destructive" });
    await Promise.all([loadLines(), reload()]);
  }

  async function submitAdjustment() {
    if (!adj.reason.trim()) return toast({ title: "Give a reason", variant: "destructive" });
    try {
      await addAdjustment({
        timesheetId: id, kind: adj.kind as any, hours: Number(adj.hours) || 0, amount: Number(adj.amount) || 0, reason: adj.reason.trim(),
      });
      setAdj({ kind: "allowance", hours: "0", amount: "0", reason: "" });
    } catch (e) {
      toast({ title: "Could not add adjustment", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }

  if (!timesheet) return <p className="text-sm text-muted-foreground">Loading timesheet...</p>;
  const locked = ["approved", "exported", "paid"].includes(timesheet.status);

  return (
    <div className="space-y-4">
      <Link href="/dashboard/timesheets" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 h-4 w-4" />Timesheets
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{caregiver?.name ?? "Worker"}</h1>
          <p className="text-sm text-muted-foreground">{period ? `${period.periodStart} to ${period.periodEnd}` : ""}</p>
        </div>
        <Badge variant="secondary">{timesheet.status}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Approved shifts", String(total?.completedShifts ?? 0)],
          ["To approve", String((total?.pendingShifts ?? 0) + (total?.inProgressShifts ?? 0))],
          ["Approved hours", (total?.approvedHours ?? 0).toFixed(2)],
          ["Gross pay", money(total?.totalGross ?? 0)],
        ].map(([k, v]) => (
          <Card key={k}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="text-xl font-semibold">{v}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Shifts</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>Client</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Hours</TableHead><TableHead className="text-right">Pay</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {lines.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No shifts in this period.</TableCell></TableRow>}
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{formatWhen(l.start_time)}</TableCell>
                  <TableCell>{l.clientName}</TableCell>
                  <TableCell><Badge variant="outline">{l.approved_at ? "Approved" : l.status}</Badge></TableCell>
                  <TableCell className="text-right">{l.hours != null ? Number(l.hours).toFixed(2) : "-"}</TableCell>
                  <TableCell className="text-right">{l.pay != null ? money(l.pay) : "-"}</TableCell>
                  <TableCell className="text-right">
                    {!l.approved_at && l.status === "Completed" && !locked && (
                      <Button size="sm" variant="outline" onClick={() => approveShift(l.id)}><Check className="mr-1 h-4 w-4" />Approve</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjustments</CardTitle>
          <CardDescription>Allowances, unpaid breaks, travel time and corrections. Each needs a reason.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {adjustments.map((a) => (
            <div key={a.id} className="flex justify-between border-b pb-2 text-sm">
              <span>{a.kind.replace("_", " ")}: {a.reason}</span>
              <span>{a.hours ? `${a.hours} h ` : ""}{money(a.amount)}</span>
            </div>
          ))}
          {!locked && (
            <div className="grid gap-3 sm:grid-cols-5">
              <div>
                <Label>Type</Label>
                <Select value={adj.kind} onValueChange={(v) => setAdj({ ...adj, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["allowance", "travel_time", "unpaid_break", "correction"].map((k) => <SelectItem key={k} value={k}>{k.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Hours</Label><Input type="number" step="0.25" value={adj.hours} onChange={(e) => setAdj({ ...adj, hours: e.target.value })} /></div>
              <div><Label>Amount</Label><Input type="number" step="0.01" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Reason</Label><Input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></div>
              <div className="sm:col-span-5"><Button onClick={submitAdjustment}>Add adjustment</Button></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
