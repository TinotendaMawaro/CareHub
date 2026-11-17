"use client";

import type { Shift } from "@/lib/types";

interface SchedulingTableProps {
  shifts: Shift[];
  onEdit?: (shift: Shift) => void;
  onDelete?: (shift: Shift) => void;
  onStart?: (shift: Shift) => void;
  onApprove?: (shift: Shift) => void;
  onStop?: (shift: Shift) => void;
  onCancel?: (shift: Shift, opts: { withoutPay: boolean; reason: string }) => void;
}

export default function SchedulingTable({ shifts, onEdit, onDelete, onStart, onApprove, onStop, onCancel }: SchedulingTableProps) {
  return (
    <div className="text-sm text-muted-foreground">
      SchedulingTable is deprecated. Use the ShiftTable component from{" "}
      <code>@/components/scheduling/ShiftTable</code> for the full feature set.
    </div>
  );
}
