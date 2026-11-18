"use client";

import { ShiftBoard } from "@/components/scheduling/shift-board";

export default function CalendarPage() {
  return (
    <ShiftBoard
      defaultMode="staff"
      title="Calendar"
      description="The week at a glance. Drag shifts between staff or days, click one to edit it, or click an empty cell to add one."
    />
  );
}
