"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase } from "lucide-react";

interface WorkAnniversary {
  name: string;
  years: number;
}

interface WorkAnniversariesWidgetProps {
  workAnniversaries: WorkAnniversary[];
}

export function WorkAnniversariesWidget({
  workAnniversaries,
}: WorkAnniversariesWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Work Anniversaries
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {workAnniversaries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No anniversaries this week.
            </p>
          )}
          {workAnniversaries.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-sm"
            >
              <span className="font-medium">{item.name}</span>
              <Badge variant="outline">{item.years} years</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
