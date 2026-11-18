"use client";

import { ShiftBoard } from "@/components/scheduling/shift-board";

export default function RosterPage() {
  return (
    <ShiftBoard
      defaultMode="client"
      title="Roster"
      description="Each client's week: who is supporting them and when. Switch to By staff to balance workloads."
    />
  );
}
