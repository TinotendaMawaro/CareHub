"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClockOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWhen } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";

type Row = {
  shift_id: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  caregivers: { name: string } | null;
  shifts: { id: string; start_time: string; end_time: string } | null;
};

/**
 * Shifts from the last 7 days that ended without a clean clock-in/out.
 * These are the ones the office should chase before approving timesheets.
 */
export function MissedClockInsWidget() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data } = await supabase
        .from("shift_workers")
        .select("shift_id,clock_in_time,clock_out_time,caregivers(name),shifts!inner(id,start_time,end_time,status,deleted)")
        .eq("shifts.deleted", false)
        .neq("shifts.status", "Cancelled")
        .gte("shifts.end_time", from)
        .lte("shifts.end_time", new Date().toISOString())
        .or("clock_in_time.is.null,clock_out_time.is.null")
        .order("shift_id", { ascending: false })
        .limit(50);
      if (!alive) return;
      setRows(((data ?? []) as unknown as Row[]).filter((r) => r.shifts));
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Card className="transition-all duration-200 hover:shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlarmClockOff className="h-5 w-5" />
          Missed clock in/out
          {loaded && rows.length > 0 && <Badge variant="destructive">{rows.length}</Badge>}
        </CardTitle>
        <CardDescription>Finished shifts from the last 7 days without a complete clock record</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loaded && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Every finished shift this week was clocked properly.</p>
        )}
        {rows.slice(0, 6).map((r) => (
          <div key={`${r.shift_id}`} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.caregivers?.name ?? "Unassigned"}</p>
              <p className="text-xs text-muted-foreground">{r.shifts ? formatWhen(r.shifts.start_time) : ""}</p>
            </div>
            <Badge variant="outline" className="shrink-0 text-amber-600">
              {!r.clock_in_time ? "No clock-in" : "No clock-out"}
            </Badge>
          </div>
        ))}
        {rows.length > 6 && (
          <Link href="/dashboard/approvals" className="block pt-1 text-xs font-medium text-primary hover:underline">
            Review all {rows.length} in Approvals
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
