"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useTimesheets } from "@/hooks/use-timesheets";
import { supabase } from "@/lib/supabase/client";
import { mapTimesheetTotal } from "@/lib/supabase/mappers";
import { useShifts } from "@/hooks/use-shifts";
import ShiftTable from "@/components/scheduling/ShiftTable";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CaregiverProfilePage() {
  const params = useParams();
  const caregiverId = params.id as string;
  const { caregivers } = useCaregivers();
  const caregiver = caregivers.find((c) => c.id === caregiverId);
  const { timesheets, loading } = useTimesheets(caregiverId);
  const [totals, setTotals] = useState<Record<string, any>>({});
  const { isAdmin } = useAuth();
  const { shifts, caregivers: allCaregivers } = useShifts();
  const caregiverShifts = useMemo(() => shifts.filter((s) => s.caregiverId === caregiverId), [shifts, caregiverId]);

  useEffect(() => {
    if (timesheets.length === 0) return;
    let active = true;
    void supabase
      .from("timesheet_totals")
      .select("*")
      .in("timesheet_id", timesheets.map((t) => t.id))
      .then(({ data }) => {
        if (!active) return;
        const next: Record<string, any> = {};
        for (const row of data ?? []) next[row.timesheet_id] = mapTimesheetTotal(row);
        setTotals(next);
      });
    return () => {
      active = false;
    };
  }, [timesheets]);

  if (!caregiver) {
    return <div className="p-6">Caregiver not found.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/caregivers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold font-headline">{caregiver.name}</h1>
            <p className="text-sm text-muted-foreground">Support worker profile</p>
          </div>
        </div>
        <Badge variant="outline">{caregiver.availability}</Badge>
      </div>

      <Tabs defaultValue="timesheets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="timesheets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fortnightly Timesheets</CardTitle>
              <CardDescription>Pay history and current period.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : timesheets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timesheets yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Gross Pay</TableHead>
                      <TableHead className="text-right">Adjustments</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timesheets.map((t) => {
                      const total = totals[t.id];
                      return (
                        <TableRow key={t.id}>
                          <TableCell>{t.payPeriodId}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                t.status === "approved"
                                  ? "default"
                                  : t.status === "rejected"
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {total ? `$${total.totalGross.toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {total ? `$${total.adjustments.toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/dashboard/timesheets/${t.id}`}>View</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>Shifts for {caregiver.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <ShiftTable shifts={caregiverShifts} caregivers={allCaregivers} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Worker Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{caregiver.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{caregiver.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{caregiver.phone}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Experience</p>
                <p className="font-medium">{caregiver.experience} years</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
