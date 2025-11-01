import {
  Users,
  HeartHandshake,
  CalendarClock,
  ShieldAlert,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import Link from 'next/link';

import { StatCard } from "@/components/app/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { clients, caregivers, shifts, incidentReports, getClientName, getCaregiverName } from "@/lib/data";
import CaregiverHoursChart from "./reports/caregiver-hours-chart";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function DashboardPage() {
  const upcomingShifts = shifts.filter(s => s.status === 'Upcoming' || s.status === 'In Progress');

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <StatCard
          title="Active Clients"
          value={clients.length.toString()}
          description="+2 since last month"
          Icon={Users}
        />
        <StatCard
          title="Available Caregivers"
          value={caregivers.filter((c) => c.availability === "Available").length.toString()}
          description={`${caregivers.filter((c) => c.availability === "On Shift").length} on shift`}
          Icon={HeartHandshake}
        />
        <StatCard
          title="Upcoming Shifts"
          value={upcomingShifts.length.toString()}
          description="In the next 7 days"
          Icon={CalendarClock}
        />
        <StatCard
          title="Incidents Reported"
          value={incidentReports.length.toString()}
          description="In the last 30 days"
          Icon={ShieldAlert}
        />
      </div>

      <div className="grid gap-4 md:gap-8 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Caregiver Hours</CardTitle>
            <CardDescription>
              Total hours logged by caregivers this week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CaregiverHoursChart />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center">
             <div className="grid gap-2">
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Updates on shifts and client interactions.
              </CardDescription>
            </div>
            <Button asChild size="sm" className="ml-auto gap-1">
              <Link href="/dashboard/scheduling">
                View All
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-8">
            {shifts.slice(0, 5).map(shift => {
              const client = clients.find(c => c.id === shift.clientId);
              return (
              <div key={shift.id} className="flex items-center gap-4">
                <Avatar className="hidden h-9 w-9 sm:flex">
                  <AvatarImage src={client?.avatarUrl} alt="Avatar" />
                  <AvatarFallback>{getClientName(shift.clientId).charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="grid gap-1">
                  <p className="text-sm font-medium leading-none">
                    Shift for {getClientName(shift.clientId)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Assigned to {getCaregiverName(shift.caregiverId)}
                  </p>
                </div>
                <div className="ml-auto font-medium">
                  <Badge variant={shift.status === 'Completed' ? 'secondary' : 'default'}>{shift.status}</Badge>
                </div>
              </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
