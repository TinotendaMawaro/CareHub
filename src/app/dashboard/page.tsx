"use client";

import {
  Users,
  HeartHandshake,
  CalendarClock,
  ShieldAlert,
  Activity,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  UserX,
  MapPin,
  Smartphone,
} from "lucide-react";
import Link from 'next/link';
import { useMemo } from 'react';

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

  const metrics = useMemo(() => {
    const activeShifts = shifts.filter(s => s.status === 'In Progress');
    const lateNoShowShifts = shifts.filter(s => s.status === 'Late' || s.status === 'No Show');
    const unassignedShifts = shifts.filter(s => !s.caregiverId || s.caregiverId === null);
    const onShiftCaregivers = caregivers.filter(c => c.availability === 'On Shift');
    const availableCaregivers = caregivers.filter(c => c.availability === 'Available' || !c.availability);
    const recentIncidents = incidents.filter(i => {
      const incidentDate = new Date(i.date);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return incidentDate >= thirtyDaysAgo;
    });

    return {
      activeShifts,
      lateNoShowShifts,
      unassignedShifts,
      onShiftCaregivers,
      availableCaregivers,
      recentIncidents,
    };
  }, [shifts, caregivers, incidents]);

  if (clientsLoading || caregiversLoading || shiftsLoading || incidentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Real-Time Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 md:gap-8 lg:grid-cols-6">
        <StatCard
          title="Active Shifts"
          value={metrics.activeShifts.length.toString()}
          description="In Progress"
          Icon={Clock}
        />
        <StatCard
          title="Late / No-Show"
          value={metrics.lateNoShowShifts.length.toString()}
          description="Requires attention"
          Icon={AlertTriangle}
        />
        <StatCard
          title="Unassigned Shifts"
          value={metrics.unassignedShifts.length.toString()}
          description="Need assignment"
          Icon={UserX}
        />
        <StatCard
          title="On Shift Caregivers"
          value={metrics.onShiftCaregivers.length.toString()}
          description="Currently working"
          Icon={HeartHandshake}
        />
        <StatCard
          title="Available Caregivers"
          value={metrics.availableCaregivers.length.toString()}
          description="Ready for shifts"
          Icon={Users}
        />
        <StatCard
          title="Recent Incidents"
          value={metrics.recentIncidents.length.toString()}
          description="Last 30 days"
          Icon={ShieldAlert}
        />
      </div>

      {/* Live Shift Monitoring */}
      <Card className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
        <CardHeader>
          <CardTitle>Live Shift Monitoring</CardTitle>
          <CardDescription>
            Real-time status of active shifts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Caregiver</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Elapsed Time</TableHead>
                <TableHead>Mobile Start</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.activeShifts.slice(0, 5).map(shift => {
                const client = clients.find(c => c.id === shift.clientId);
                const caregiver = caregivers.find(c => c.id === shift.caregiverId);
                const startTime = shift.clockInTime ? new Date(shift.clockInTime) : new Date(shift.startTime);
                const elapsed = Math.floor((Date.now() - startTime.getTime()) / (1000 * 60)); // minutes
                const hours = Math.floor(elapsed / 60);
                const mins = elapsed % 60;
                const elapsedStr = `${hours}h ${mins}m`;

                return (
                  <TableRow key={shift.id}>
                    <TableCell>{caregiver?.name || 'Unknown'}</TableCell>
                    <TableCell>{client?.name || 'Unknown'}</TableCell>
                    <TableCell>
                      <Badge variant="default">{shift.status}</Badge>
                    </TableCell>
                    <TableCell>{elapsedStr}</TableCell>
                    <TableCell>
                      {shift.clockInTime && <Smartphone className="h-4 w-4 text-green-500" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Alerts Panel */}
      <Card className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
        <CardHeader>
          <CardTitle>Alerts Panel</CardTitle>
          <CardDescription>
            Real-time alerts requiring attention
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {metrics.lateNoShowShifts.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">{metrics.lateNoShowShifts.length} Late/No-Show Shifts</p>
                <p className="text-sm text-yellow-600">Immediate attention required</p>
              </div>
            </div>
          )}
          {metrics.unassignedShifts.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <UserX className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-blue-800">{metrics.unassignedShifts.length} Unassigned Shifts</p>
                <p className="text-sm text-blue-600">Need caregiver assignment</p>
              </div>
            </div>
          )}
          {metrics.recentIncidents.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800">{metrics.recentIncidents.length} New Incidents</p>
                <p className="text-sm text-red-600">Review incident reports</p>
              </div>
            </div>
          )}
          {/* Placeholder for shift notes */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <Activity className="h-5 w-5 text-gray-600" />
            <div>
              <p className="font-medium text-gray-800">Shift Notes</p>
              <p className="text-sm text-gray-600">Feature coming soon</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* EVV Snapshot Placeholder */}
      <Card className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
        <CardHeader>
          <CardTitle>EVV Snapshot</CardTitle>
          <CardDescription>
            Live caregiver locations during shifts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 bg-gray-100 rounded-lg">
            <div className="text-center">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Map integration coming soon</p>
              <p className="text-sm text-gray-400">Live tracking of caregiver locations</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
