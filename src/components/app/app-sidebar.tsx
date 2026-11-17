"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  HeartHandshake,
  CalendarDays,
  CalendarRange,
  LineChart,
  ShieldAlert,
  Settings,
  UserPlus,
  FileText,
  FolderOpen,
  LogOut,
  Search,
  DollarSign,
  UserCog,
  CheckCheck,
  Receipt,
  MessageSquare,
  ClipboardCheck,
  Clock,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/ui/command-palette";
import { CareHubLogoWithText } from "@/components/ui/carehub-logo";
import { useAuth } from "@/hooks/use-auth";
import { useOrganisation } from "@/hooks/use-organisation";
import { useNavCounts } from "@/hooks/use-nav-counts";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: "approvals" | "incidents" | "chat" | "onboarding" | "documents" };

const operationsItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/scheduling", label: "Shifts", icon: CalendarRange },
  { href: "/dashboard/schedule", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/roster", label: "Roster", icon: CalendarRange },
  { href: "/dashboard/approvals", label: "Approvals", icon: CheckCheck, badge: "approvals" },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare, badge: "chat" },
];

const peopleItems: NavItem[] = [
  { href: "/dashboard/clients", label: "Participants", icon: Users },
  { href: "/dashboard/caregivers", label: "Support workers", icon: HeartHandshake },
  { href: "/dashboard/onboarding", label: "Onboarding", icon: ClipboardCheck, badge: "onboarding" },
  { href: "/dashboard/users", label: "Team", icon: UserCog },
];

const recordsItems: NavItem[] = [
  { href: "/dashboard/documents", label: "Documents", icon: FolderOpen, badge: "documents" },
  { href: "/dashboard/shift-note", label: "Shift notes", icon: FileText },
  { href: "/dashboard/incidents", label: "Incidents", icon: ShieldAlert, badge: "incidents" },
  { href: "/dashboard/timesheets", label: "Timesheets", icon: Clock },
  { href: "/dashboard/invoices", label: "Invoices", icon: Receipt },
  { href: "/dashboard/reports", label: "Reports", icon: LineChart },
];

const adminItems: NavItem[] = [
  { href: "/dashboard/pricing", label: "Pricing and pay", icon: DollarSign },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const quickActions = [
  { title: "New shifts", subtitle: "Create one or many shifts", href: "/dashboard/scheduling" },
  { title: "Approvals", subtitle: "Approve finished shifts", href: "/dashboard/approvals" },
  { title: "Invoices", subtitle: "Generate and export invoices", href: "/dashboard/invoices" },
  { title: "Chat", subtitle: "Message the team", href: "/dashboard/chat" },
  { title: "New participant", subtitle: "Add a new client record", href: "/dashboard/clients" },
  { title: "New support worker", subtitle: "Add a new caregiver", href: "/dashboard/caregivers" },
  { title: "View roster", subtitle: "Open weekly roster", href: "/dashboard/roster" },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { org } = useOrganisation();
  const counts = useNavCounts();
  const [commandOpen, setCommandOpen] = React.useState(false);

  const initials = (user?.email?.charAt(0) ?? "U").toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between p-2">
          {org.logoUrl ? (
            <div className="flex min-w-0 items-center gap-2">
              <img src={org.logoUrl} alt={org.name} className="h-8 w-8 rounded object-contain" />
              <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">{org.name}</span>
            </div>
          ) : org.name !== "CareHub" ? (
            <span className="truncate font-semibold">{org.name}</span>
          ) : (
            <CareHubLogoWithText size={32} />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCommandOpen(true)}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          items={quickActions.map((action) => ({
            title: action.title,
            subtitle: action.subtitle,
            onSelect: () => {
              window.location.href = action.href;
            },
          }))}
          placeholder="Search participants, workers, shifts..."
          emptyMessage="No results found."
        />
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationsItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={{ children: item.label }}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                      {item.badge && counts[item.badge] > 0 && <Badge className="ml-auto">{counts[item.badge]}</Badge>}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {peopleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={{ children: item.label }}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                      {item.badge && counts[item.badge] > 0 && <Badge className="ml-auto">{counts[item.badge]}</Badge>}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Records</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recordsItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={{ children: item.label }}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                      {item.badge && counts[item.badge] > 0 && <Badge className="ml-auto">{counts[item.badge]}</Badge>}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={{ children: item.label }}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                      {item.badge && counts[item.badge] > 0 && <Badge className="ml-auto">{counts[item.badge]}</Badge>}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={{ children: user?.email ?? "Account" }}>
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {initials}
              </div>
              <span className="truncate">{user?.email ?? "Account"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={{ children: "Logout" }} onClick={() => logout(true)}>
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
