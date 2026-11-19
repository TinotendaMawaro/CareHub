"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ShiftTable from "@/components/scheduling/ShiftTable";
import CreateShiftsDialog from "@/components/shifts/create-shifts-dialog";
import ShiftDetailSheet from "@/components/shifts/shift-detail-sheet";
import { useShifts } from "@/hooks/use-shifts";
import { useToast } from "@/hooks/use-toast";
import { parseRpcError, shiftRpc } from "@/lib/shift-rpc";
import type { Shift } from "@/lib/types";

export default function SchedulingPage() {
  return (
    <Suspense fallback={null}>
      <SchedulingInner />
    </Suspense>
  );
}

function SchedulingInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { shifts, loading, caregivers } = useShifts();
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [openId, setOpenId] = useState<string | null>(null);

  // Move Scheduled -> Late -> No Show as time passes.
  useEffect(() => {
    void shiftRpc.syncStatuses().catch(() => {});
  }, []);

  /** Run one or more RPCs and report the outcome. The realtime subscription refreshes the table. */
  async function act(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast({ title: label });
    } catch (e) {
      toast({ title: "Could not do that", description: parseRpcError(e).message, variant: "destructive" });
    }
  }

  async function approveOne(s: Shift) {
    await act("Shift approved", async () => {
      try {
        await shiftRpc.approve(s.id);
      } catch (e) {
        const { code, message } = parseRpcError(e);
        if ((code === "not_complete" || code === "not_clocked") && window.confirm(`${message}\n\nApprove using the scheduled times instead?`)) {
          await shiftRpc.approve(s.id, true);
        } else throw e;
      }
    });
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-lg">Loading shifts...</div>;
  }

  return (
    <>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-headline text-2xl font-bold sm:text-3xl">Shifts</h1>
          <p className="text-muted-foreground">Create, staff, split and approve shifts for clients and staff.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button variant="outline" asChild>
            <Link href="/dashboard/schedule"><CalendarDays className="mr-2 h-4 w-4" />Calendar</Link>
          </Button>
          <Button onClick={() => setCreating(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />New shifts
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ShiftTable
            shifts={shifts}
            caregivers={caregivers}
            onEdit={(s) => setOpenId(s.id)}
            onNotes={(s) => setOpenId(s.id)}
            onHistory={(s) => setOpenId(s.id)}
            onIncidents={(s) => { window.location.href = `/dashboard/incidents?shiftId=${s.id}`; }}
            // Office staff can start or end a shift on a worker's behalf (recorded as a time correction).
            onStart={(s) => s.caregiverId
              ? act("Shift started", () => shiftRpc.adjust(s.id, s.caregiverId!, new Date().toISOString(), null))
              : toast({ title: "Assign staff first", variant: "destructive" })}
            onStop={(s) => s.caregiverId && s.clockInTime
              ? act("Shift ended", () => shiftRpc.adjust(s.id, s.caregiverId!, new Date(s.clockInTime!).toISOString(), new Date().toISOString()))
              : undefined}
            onApprove={approveOne}
            onCancel={(s, c) => act("Shift cancelled", () => shiftRpc.cancel([s.id], c.reason, c.by, { ndisReason: c.ndisReason, notify: c.notify }))}
            onBulkApprove={(ids) => act("Approval finished", async () => {
              const r = await shiftRpc.approveMany(ids);
              if (r.failed.length) throw new Error(`${r.approved} approved, ${r.failed.length} could not be: ${r.failed[0].error}`);
            })}
            onBulkAssign={(ids, cg) => act("Staff assigned", async () => { for (const id of ids) await shiftRpc.addWorker(id, cg); })}
            onBulkUnassign={(ids) => act("Staff unassigned", async () => {
              for (const id of ids) {
                const s = shifts.find((x) => x.id === id);
                for (const w of s?.workerIds ?? (s?.caregiverId ? [s.caregiverId] : [])) await shiftRpc.removeWorker(id, w);
              }
            })}
            onBulkCancel={(ids, c) => act("Shifts cancelled", () => shiftRpc.cancel(ids, c.reason, c.by, { ndisReason: c.ndisReason, notify: c.notify }))}
            onBulkDelete={(ids) => {
              if (!window.confirm(`Delete ${ids.length} shift(s)? Started or approved shifts are kept.`)) return;
              void act("Shifts deleted", async () => { for (const id of ids) await shiftRpc.remove(id); });
            }}
            onBulkPublish={(ids) => act("Offered to staff", async () => { for (const id of ids) await shiftRpc.publish(id); })}
          />
        </CardContent>
      </Card>

      <CreateShiftsDialog isOpen={creating} onClose={() => { setCreating(false); if (params.get("new")) router.replace("/dashboard/scheduling"); }} />
      <ShiftDetailSheet shiftId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
