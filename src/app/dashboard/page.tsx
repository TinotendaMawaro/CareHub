"use client";

import {
  ArrowUpRight,
  Clock,
  AlertTriangle,
  UserX,
  HelpCircle,
  DollarSign,
  Activity,
  ShieldAlert,
  FileText,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatCard } from "@/components/app/stat-card";
import { useClients } from "@/hooks/use-clients";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useShifts } from "@/hooks/use-shifts";
import { useIncidents } from "@/hooks/use-incidents";
import { useBilling } from "@/hooks/use-billing";
import { useBudgetsAtRisk } from "@/hooks/use-budgets-at-risk";
import { useTimeOffRequests } from "@/hooks/use-timeOffRequests";
import { useWallPosts } from "@/hooks/use-wall-posts";
import { DashboardTour } from "@/components/auth/dashboard-tour";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import CaregiverHoursChart from "./reports/caregiver-hours-chart";
import { UpcomingShiftsWidget } from "@/components/dashboard/upcoming-shifts-widget";
import { OnLeaveWidget } from "@/components/dashboard/on-leave-widget";
import { BirthdaysWidget } from "@/components/dashboard/birthdays-widget";
import { WorkAnniversariesWidget } from "@/components/dashboard/work-anniversaries-widget";
import { MessageWallWidget } from "@/components/dashboard/message-wall-widget";
import { MissedClockInsWidget } from "@/components/dashboard/missed-clockins-widget";
import { AlertItem } from "@/components/dashboard/alert-item";

export default function DashboardPage() {
  const { user } = useAuth();
  const { clients, loading: clientsLoading } = useClients();
  const { caregivers, loading: caregiversLoading } = useCaregivers();
  const { shifts, loading: shiftsLoading } = useShifts(clients, caregivers);
  const { incidents, loading: incidentsLoading } = useIncidents(clients);
  const { billing, loading: billingLoading } = useBilling();
  const { timeOffRequests, loading: timeOffLoading } = useTimeOffRequests();
  const { posts: wallPosts, loading: wallPostsLoading } = useWallPosts();
  const [showTour, setShowTour] = useState(false);

  const metrics = useDashboardMetrics({
    shifts,
    caregivers,
    incidents,
    billing,
    timeOffRequests,
    wallPosts,
    clients,
  });

  const clientNames = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.fullName])), [clients]);
  const { budgetsAtRisk, loading: budgetsLoading } = useBudgetsAtRisk(clientNames);

  useEffect(() => {
    const completed = localStorage.getItem("carehub-tour-completed");
    if (!completed && user) {
      setShowTour(true);
    }
  }, [user]);

  const handleTourComplete = () => {
    localStorage.setItem("carehub-tour-completed", "true");
    setShowTour(false);
  };

  const handleTourSkip = () => {
    setShowTour(false);
  };

  const loading =
    clientsLoading ||
    caregiversLoading ||
    shiftsLoading ||
    incidentsLoading ||
    billingLoading ||
    budgetsLoading ||
    timeOffLoading ||
    wallPostsLoading;

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 md:gap-8 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="space-y-1 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 md:gap-6">
        {/* Real-Time Cards */}
        <div data-tour="stats" className="grid gap-4 grid-cols-2 md:grid-cols-3 md:gap-8 lg:grid-cols-6">
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
            Icon={Clock}
          />
          <StatCard
            title="Available Caregivers"
            value={metrics.availableCaregivers.length.toString()}
            description="Ready for shifts"
            Icon={Clock}
          />
          <StatCard
            title="Recent Incidents"
            value={metrics.recentIncidents.length.toString()}
            description="Last 30 days"
            Icon={AlertTriangle}
          />
        </div>

        {/* Money Strip */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatCard
            title="Revenue (MTD)"
            value={metrics.revenueMTD}
            description="Billed this month"
            Icon={DollarSign}
          />
          <StatCard
            title="Outstanding"
            value={metrics.outstandingInvoices}
            description="Awaiting payment"
            Icon={Clock}
          />
          <StatCard
            title="Paid (MTD)"
            value={metrics.paidMTD}
            description="Collected this month"
            Icon={ArrowUpRight}
          />
          <StatCard
            title="Overdue"
            value={metrics.overdueInvoices}
            description="Requires follow-up"
            Icon={AlertTriangle}
          />
        </div>

        {/* Budget Risk, Waitlist & Missed Clock-ins */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <Card data-tour="budgets-risk" className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Budgets at risk
              </CardTitle>
              <CardDescription>
                Participants ranked by percent used against time elapsed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {budgetsAtRisk.length === 0 ? (
                <p className="text-sm text-muted-foreground">No participant is spending faster than their plan period. Add plans and budgets on a participant to track them here.</p>
              ) : (
                <div className="space-y-3">
                  {budgetsAtRisk.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.category}: {item.percentUsed.toFixed(1)}% used · {item.timeElapsed.toFixed(1)}% of plan elapsed</p>
                      </div>
                      <Badge variant={item.percentUsed > 90 ? "destructive" : item.percentUsed > 75 ? "outline" : "secondary"}>
                        {item.percentUsed > 90 ? "At risk" : item.percentUsed > 75 ? "Watch" : "OK"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-tour="waitlist" className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserX className="h-5 w-5" />
                Waitlist
              </CardTitle>
              <CardDescription>
                Unassigned future shifts requiring attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.unassignedShifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unassigned shifts.</p>
              ) : (
                <div className="space-y-3">
                  {metrics.unassignedShifts.slice(0, 5).map((shift) => (
                    <div key={shift.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">{shift.clientName}</p>
                        <p className="text-xs text-muted-foreground">{shift.date}</p>
                        <p className="text-xs text-muted-foreground mt-1">Notes: (none)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{shift.status}</Badge>
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/dashboard/scheduling?highlight=${shift.id}`}>Assign</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                  {metrics.unassignedShifts.length > 5 && (
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href="/dashboard/schedule?tab=unassigned">View all</Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <MissedClockInsWidget />
        </div>

        {/* Compact Widgets */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <UpcomingShiftsWidget shifts={metrics.upcomingShifts} clients={clients} />
          <OnLeaveWidget timeOffRequests={metrics.onLeave} caregivers={caregivers} />
          <BirthdaysWidget birthdays={metrics.birthdays} />
          <WorkAnniversariesWidget workAnniversaries={metrics.workAnniversaries} />
          <MessageWallWidget posts={metrics.recentWallPosts} />
        </div>

        {/* Live Shift Monitoring */}
        <Card data-tour="live-shifts" className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
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
                {metrics.activeShifts.slice(0, 5).map((shift) => {
                  const client = clients.find((c) => c.id === shift.clientId);
                  const caregiver = caregivers.find(
                    (c) => c.id === shift.caregiverId
                  );
                  const startTime = shift.clockInTime
                    ? new Date(shift.clockInTime)
                    : new Date(shift.startTime);
                  const elapsed = Math.floor(
                    (Date.now() - startTime.getTime()) / (1000 * 60)
                  );
                  const hours = Math.floor(elapsed / 60);
                  const mins = elapsed % 60;
                  const elapsedStr = `${hours}h ${mins}m`;

                  return (
                    <TableRow key={shift.id}>
                      <TableCell>{caregiver?.name || "Unknown"}</TableCell>
                      <TableCell>{client?.name || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="default">{shift.status}</Badge>
                      </TableCell>
                      <TableCell>{elapsedStr}</TableCell>
                      <TableCell>
                        {shift.clockInTime && (
                          <Activity className="h-4 w-4 text-green-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Alerts Panel */}
        <Card data-tour="alerts" className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
          <CardHeader>
            <CardTitle>Alerts Panel</CardTitle>
            <CardDescription>
              Real-time alerts requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {metrics.lateNoShowShifts.length > 0 && (
              <AlertItem
                icon={<AlertTriangle className="h-5 w-5" />}
                count={metrics.lateNoShowShifts.length}
                title="Late/No-Show Shifts"
                description="Immediate attention required"
                iconColor="text-yellow-600"
                bgColor="bg-yellow-50"
                borderColor="border border-yellow-200"
                titleColor="text-yellow-800"
                descriptionColor="text-yellow-600"
              />
            )}
            {metrics.unassignedShifts.length > 0 && (
              <AlertItem
                icon={<UserX className="h-5 w-5" />}
                count={metrics.unassignedShifts.length}
                title="Unassigned Shifts"
                description="Need caregiver assignment"
                iconColor="text-blue-600"
                bgColor="bg-blue-50"
                borderColor="border border-blue-200"
                titleColor="text-blue-800"
                descriptionColor="text-blue-600"
              />
            )}
            {metrics.recentIncidents.length > 0 && (
              <AlertItem
                icon={<ShieldAlert className="h-5 w-5" />}
                count={metrics.recentIncidents.length}
                title="New Incidents"
                description="Review incident reports"
                iconColor="text-red-600"
                bgColor="bg-red-50"
                borderColor="border border-red-200"
                titleColor="text-red-800"
                descriptionColor="text-red-600"
              />
            )}
          {/* Placeholder for shift notes */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <Activity className="h-5 w-5 text-gray-600" />
            <div>
              <p className="font-medium text-gray-800">Shift Notes</p>
              <p className="text-sm text-gray-600">Feature coming soon</p>
            </div>
          </div>
          {/* Timesheets due */}
          <Link href="/dashboard/timesheets" className="block">
            <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100">
              <FileText className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="font-medium text-indigo-800">Timesheets due</p>
                <p className="text-sm text-indigo-600">Open timesheets</p>
              </div>
            </div>
          </Link>
        </CardContent>
      </Card>

        <div className="grid gap-4 md:gap-8 lg:grid-cols-2 xl:grid-cols-3">
          <Card data-tour="charts" className="xl:col-span-2 transition-all duration-200 hover:shadow-lg hover:scale-[1.02]">
            <CardHeader>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="Help menu"
                    data-tour="navigation"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setShowTour(true)} className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />
                    Restart Dashboard Tour
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              {shifts.slice(0, 5).map((shift) => {
                const client = clients.find((c) => c.id === shift.clientId);
                return (
                  <div key={shift.id} className="flex items-center gap-4">
                    <Avatar className="hidden h-9 w-9 sm:flex">
                      <AvatarImage src={client?.avatarUrl} alt="Avatar" />
                      <AvatarFallback>
                        {client?.name?.charAt(0) || "C"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid gap-1">
                      <p className="text-sm font-medium leading-none">
                        Shift for {client?.name || "Unknown Client"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Assigned to{" "}
                        {shift.caregiverName || "Unknown Caregiver"}
                      </p>
                    </div>
                    <div className="ml-auto font-medium">
                      <Badge
                        variant={
                          shift.status === "Completed"
                            ? "secondary"
                            : "default"
                        }
                      >
                        {shift.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
      <DashboardTour
        isOpen={showTour}
        onClose={handleTourSkip}
        onComplete={handleTourComplete}
      />
    </>
  );
}

