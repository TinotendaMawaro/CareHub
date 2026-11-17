"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock } from "lucide-react";
import type { TimeOffRequest, Caregiver } from "@/lib/types";

interface OnLeaveWidgetProps {
  timeOffRequests: TimeOffRequest[];
  caregivers: Caregiver[];
}

export function OnLeaveWidget({
  timeOffRequests,
  caregivers,
}: OnLeaveWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          On Leave
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {timeOffRequests.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No approved leave requests.
            </p>
          )}
          {timeOffRequests.map((leave) => {
            const caregiver = caregivers.find(
              (c) => c.id === leave.caregiverId
            );
            return (
              <div
                key={leave.id}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <p className="font-medium">
                    {caregiver?.name || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {leave.startDate} - {leave.endDate}
                  </p>
                </div>
                <Badge variant="secondary">{leave.reason}</Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
