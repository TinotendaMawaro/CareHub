"use client";

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
import CaregiverHoursChart from "./reports/caregiver-hours-chart";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useClients } from "@/hooks/use-clients";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useShifts } from "@/hooks/use-shifts";
import { useIncidents } from "@/hooks/use-incidents";

export default function DashboardPage() {
  const { clients, loading: clientsLoading } = useClients();
  const { caregivers, loading: caregiversLoading } = useCaregivers();
  const { shifts, loading: shiftsLoading } = useShifts();
  const { incidents, loading: incidentsLoading } = useIncidents();

  const upcomingShifts = shifts.filter(s => s.status === 'Pending' || s.status === 'Accepted' || s.status === 'In Progress');
  const availableCaregivers = caregivers.filter(c => c.availability === 'Available' || !c.availability);
  const onShiftCaregivers = caregivers.filter(c => c.availability === 'On Shift');

  if (clientsLoading || caregiversLoading || shiftsLoading || incidentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <StatCard
          title="Active Clients"
          value={clients.length.toString()}
          description="+2 since last month"
          Icon={Users}
        />
        <StatCard
          title="Available Caregivers"
          value={availableCaregivers.length.toString()}
          description={`${onShiftCaregivers.length} on shift`}
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
          value={incidents.length.toString()}
          description="In the last 30 days"
          Icon={ShieldAlert}
        />
      </div>

      <div className="grid gap-4 md:gap-8 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
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

        <Card className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
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
          <CardContent className="grid gap-4 md:gap-8">
            {shifts.slice(0, 5).map(shift => {
              const client = clients.find(c => c.id === shift.clientId);
              return (
              <div key={shift.id} className="flex items-center gap-4">
                <Avatar className="hidden h-9 w-9 sm:flex">
                  <AvatarImage src={client?.avatarUrl} alt="Avatar" />
                  <AvatarFallback>{client?.name?.charAt(0) || 'C'}</AvatarFallback>
                </Avatar>
                <div className="grid gap-1">
                  <p className="text-sm font-medium leading-none">
                    Shift for {client?.name || 'Unknown Client'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Assigned to {shift.caregiverName || 'Unknown Caregiver'}
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
