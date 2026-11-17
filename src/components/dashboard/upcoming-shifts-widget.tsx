"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import type { Shift, Client } from "@/lib/types";
import { formatTime, formatWhen } from "@/lib/format";

interface UpcomingShiftsWidgetProps {
  shifts: Shift[];
  clients: Client[];
}

export function UpcomingShiftsWidget({
  shifts,
  clients,
}: UpcomingShiftsWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Upcoming Shifts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {shifts.length === 0 && (
            <p className="text-sm text-muted-foreground">No upcoming shifts.</p>
          )}
          {shifts.map((shift) => {
            const client = clients.find((c) => c.id === shift.clientId);
            return (
              <div
                key={shift.id}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <p className="font-medium">{client?.name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(shift.startTime)} to {formatTime(shift.endTime)}
                  </p>
                </div>
                <Badge
                  variant={
                    shift.status === "In Progress" ? "default" : "outline"
                  }
                >
                  {shift.status}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
