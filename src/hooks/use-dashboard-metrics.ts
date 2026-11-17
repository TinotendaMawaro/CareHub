"use client";

import { useMemo } from "react";
import type {
  Shift,
  Caregiver,
  IncidentReport,
  Billing,
  TimeOffRequest,
  WallPost,
  Client,
} from "@/lib/types";

export interface DashboardMetrics {
  activeShifts: Shift[];
  lateNoShowShifts: Shift[];
  unassignedShifts: Shift[];
  onShiftCaregivers: Caregiver[];
  availableCaregivers: Caregiver[];
  recentIncidents: IncidentReport[];
  revenueMTD: string;
  outstandingInvoices: string;
  paidMTD: string;
  overdueInvoices: string;
  upcomingShifts: Shift[];
  onLeave: TimeOffRequest[];
  birthdays: Client[];
  workAnniversaries: { name: string; years: number }[];
  recentWallPosts: WallPost[];
}

export function useDashboardMetrics({
  shifts,
  caregivers,
  incidents,
  billing,
  timeOffRequests,
  wallPosts,
  clients,
}: {
  shifts: Shift[];
  caregivers: Caregiver[];
  incidents: IncidentReport[];
  billing: Billing[];
  timeOffRequests: TimeOffRequest[];
  wallPosts: WallPost[];
  clients: Client[];
}): DashboardMetrics {
  return useMemo(() => {
    const activeShifts = shifts.filter((s) => s.status === "In Progress");
    const lateNoShowShifts = shifts.filter(
      (s) => s.status === "Late" || s.status === "No Show"
    );
    const unassignedShifts = shifts.filter(
      (s) => !s.caregiverId || s.caregiverId === null
    );
    const onShiftCaregivers = caregivers.filter(
      (c) => c.availability === "On Shift"
    );
    const availableCaregivers = caregivers.filter(
      (c) => c.availability === "Available" || !c.availability
    );
    const recentIncidents = incidents.filter((i) => {
      const incidentDate = new Date(i.date);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return incidentDate >= thirtyDaysAgo;
    });

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthBilling = billing.filter((b) => {
      const created = new Date(b.createdAt);
      return (
        created.getMonth() === currentMonth &&
        created.getFullYear() === currentYear
      );
    });
    const revenueMTD = `$${monthBilling
      .reduce((sum, b) => sum + (b.total || 0), 0)
      .toLocaleString()}`;
    const outstandingInvoices = billing
      .filter((b) => b.status === "Sent" || b.status === "Overdue")
      .length.toString();
    const paidMTD = `$${monthBilling
      .filter((b) => b.status === "Paid")
      .reduce((sum, b) => sum + (b.total || 0), 0)
      .toLocaleString()}`;
    const overdueInvoices = billing
      .filter((b) => b.status === "Overdue")
      .length.toString();

    const upcomingShifts = shifts
      .filter((s) => {
        const shiftDate = new Date(s.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return (
          shiftDate >= today &&
          (s.status === "Scheduled" || s.status === "In Progress")
        );
      })
      .slice(0, 5);

    const onLeave = timeOffRequests
      .filter((t) => t.status === "Approved")
      .slice(0, 5);

    const today = new Date();
    const todayMonthDay = `${today.getMonth() + 1}-${today.getDate()}`;
    const birthdays = clients
      .filter(
        (c) =>
          c.dateOfBirth &&
          `${new Date(c.dateOfBirth).getMonth() + 1}-${new Date(c.dateOfBirth).getDate()}` ===
            todayMonthDay
      )
      .slice(0, 5);

    const workAnniversaries: { name: string; years: number }[] = [];

    const recentWallPosts = wallPosts.slice(0, 3);

    return {
      activeShifts,
      lateNoShowShifts,
      unassignedShifts,
      onShiftCaregivers,
      availableCaregivers,
      recentIncidents,
      revenueMTD,
      outstandingInvoices,
      paidMTD,
      overdueInvoices,
      upcomingShifts,
      onLeave,
      birthdays,
      workAnniversaries,
      recentWallPosts,
    };
  }, [shifts, caregivers, incidents, billing, timeOffRequests, wallPosts, clients]);
}
