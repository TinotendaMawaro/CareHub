"use client";

import { useEffect, useMemo, useState } from "react";
import { Pager, usePaged } from "@/components/ui/pager";
import Link from "next/link";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCaregivers } from "@/hooks/use-caregivers";
import { usePayPeriods, useTimesheets, usePeriodTotals } from "@/hooks/use-timesheets";
import { useToast } from "@/hooks/use-toast";
import { money } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  exported: "bg-blue-100 text-blue-800",
  paid: "bg-blue-100 text-blue-800",
};

export default function TimesheetsPage() {
  const { toast } = useToast();
  const { caregivers } = useCaregivers();
  const { periods } = usePayPeriods();
  const [periodId, setPeriodId] = useState("");
  const { timesheets, loading, ensureForPeriod, approve, reject, reopen } = useTimesheets(undefined, periodId || undefined);
  const { totals, reload } = usePeriodTotals(periodId || undefined);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (periodId || periods.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const current = periods.find((p) => p.periodStart <= today && today <= p.periodEnd);
    setPeriodId((current ?? periods[0]).id);
  }, [periods, periodId]);

  const period = periods.find((p) => p.id === periodId);
  const nameOf = (id: string) => caregivers.find((c) => c.id === id)?.name ?? "Unknown worker";
  const rows = useMemo(
    () => [...timesheets].sort((a, b) => nameOf(a.caregiverId).localeCompare(nameOf(b.caregiverId))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timesheets, caregivers]
  );

  async function run(id: string, label: string, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
      await reload();
      toast({ title: label });
    } catch (e) {
      toast({ title: "Could not complete that", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function onApprove(id: string) {
    const t = totals[id];
    const alsoShifts = (t?.pendingShifts ?? 0) > 0 && window.confirm(
      `${t.pendingShifts} completed shift(s) are not approved yet. Approve them with this timesheet?`
    );
    if ((t?.pendingShifts ?? 0) > 0 && !alsoShifts) return;
    await run(id, "Timesheet approved", () => approve(id, alsoShifts));
  }

  async function onReject(id: string) {
    const reason = window.prompt("What does the worker need to fix?");
    if (!reason) return;
    await run(id, "Timesheet sent back", () => reject(id, reason));
  }

  const paged = usePaged(rows, 20, rows.length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Timesheets</h1>
          <p className="text-sm text-muted-foreground">
            Pay is calculated from approved shifts. Approve shifts first, or approve a timesheet and its completed shifts together.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Pay period" /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.periodStart} to {p.periodEnd}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!periodId}
            onClick={() => run("ensure", "Timesheets created", () => ensureForPeriod(periodId))}
          >
            Create for all workers
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{period ? `${period.periodStart} to ${period.periodEnd}` : "Pay period"}</CardTitle>
          <CardDescription>{rows.length} timesheet(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Approved shifts</TableHead>
                <TableHead className="text-right">To approve</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Gross pay</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">
                  No timesheets for this period yet. Use "Create for all workers".
                </TableCell></TableRow>
              )}
              {paged.rows.map((t) => {
                const tot = totals[t.id];
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link className="hover:underline" href={`/dashboard/timesheets/${t.id}`}>{nameOf(t.caregiverId)}</Link>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLE[t.status]} variant="secondary">{t.status}</Badge>
                      {t.rejectReason && <div className="mt-1 text-xs text-red-700">{t.rejectReason}</div>}
                    </TableCell>
                    <TableCell className="text-right">{tot?.completedShifts ?? 0}</TableCell>
                    <TableCell className="text-right">{(tot?.pendingShifts ?? 0) + (tot?.inProgressShifts ?? 0)}</TableCell>
                    <TableCell className="text-right">{(tot?.approvedHours ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{money(tot?.totalGross ?? 0)}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      {["draft", "submitted", "rejected"].includes(t.status) && (
                        <Button size="sm" disabled={busy === t.id} onClick={() => onApprove(t.id)}>
                          <Check className="mr-1 h-4 w-4" />Approve
                        </Button>
                      )}
                      {["submitted", "approved"].includes(t.status) && (
                        <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => onReject(t.id)}>
                          <X className="mr-1 h-4 w-4" />Send back
                        </Button>
                      )}
                      {t.status === "approved" && (
                        <Button size="sm" variant="ghost" disabled={busy === t.id} onClick={() => run(t.id, "Timesheet reopened", () => reopen(t.id))}>
                          <RotateCcw className="mr-1 h-4 w-4" />Reopen
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pager {...paged.pager} />
        </CardContent>
      </Card>
    </div>
  );
}
