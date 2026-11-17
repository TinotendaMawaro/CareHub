"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cake } from "lucide-react";
import type { Client } from "@/lib/types";

interface BirthdaysWidgetProps {
  birthdays: Client[];
}

export function BirthdaysWidget({ birthdays }: BirthdaysWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cake className="h-5 w-5" />
          Birthdays Today
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {birthdays.length === 0 && (
            <p className="text-sm text-muted-foreground">No birthdays today.</p>
          )}
          {birthdays.map((client) => (
            <div
              key={client.id}
              className="flex items-center gap-2 text-sm"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={client.avatarUrl} alt={client.name} />
                <AvatarFallback>
                  {client.name?.charAt(0) || "C"}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{client.name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
