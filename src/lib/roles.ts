import type { AppRole } from "@/hooks/use-auth";

export const ROLES: AppRole[] = ["admin", "manager", "office", "caregiver"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrator",
  manager: "Manager",
  office: "Office",
  caregiver: "Staff",
};

export const ROLE_DESCRIPTION: Record<AppRole, string> = {
  admin: "Full access, including settings, pricing, roles and security.",
  manager: "Runs the roster and approvals. Cannot change settings, pricing or roles.",
  office: "Day-to-day scheduling, clients, staff and documents.",
  caregiver: "Uses the mobile app: their shifts, notes, incidents and documents.",
};

/**
 * What each role can do. This mirrors the database's row level security (is_admin / is_office
 * checks), which is what actually enforces it; the table is the readable summary.
 */
export const PERMISSIONS: { area: string; action: string; roles: AppRole[] }[] = [
  { area: "Dashboard", action: "Use the web dashboard", roles: ["admin", "manager", "office"] },
  { area: "Shifts", action: "Create, edit, split, assign and cancel shifts", roles: ["admin", "manager", "office"] },
  { area: "Shifts", action: "Approve timesheets and shifts", roles: ["admin", "manager", "office"] },
  { area: "Shifts", action: "See own shifts, start and end them with GPS", roles: ["caregiver"] },
  { area: "Clients", action: "Add and edit clients and their teams", roles: ["admin", "manager", "office"] },
  { area: "Clients", action: "Read care details of clients they support", roles: ["caregiver"] },
  { area: "Staff", action: "Add staff and office users", roles: ["admin", "manager", "office"] },
  { area: "Staff", action: "Create administrators and managers, change roles", roles: ["admin"] },
  { area: "Staff", action: "Deactivate accounts, reset two-factor authentication", roles: ["admin"] },
  { area: "Documents", action: "Upload, approve and archive all documents", roles: ["admin", "manager", "office"] },
  { area: "Documents", action: "Upload own documents for review", roles: ["caregiver"] },
  { area: "Notes & incidents", action: "Write shift notes and report incidents", roles: ["admin", "manager", "office", "caregiver"] },
  { area: "Finance", action: "Timesheets, invoices and Xero export", roles: ["admin", "manager", "office"] },
  { area: "Finance", action: "Edit prices, cost codes and pay rates", roles: ["admin"] },
  { area: "Settings", action: "Organisation, branding, security and terms", roles: ["admin"] },
];
