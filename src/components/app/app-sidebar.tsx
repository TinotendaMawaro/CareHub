"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3, CalendarDays, CalendarRange, CheckCheck, ChevronDown, ChevronsUpDown, ClipboardCheck, Clock,
  DollarSign, FileText, FolderOpen, HeartHandshake, LayoutDashboard, LogOut, MessageSquare, Receipt,
  Search, Settings, ShieldAlert, UserCog, UserRound, Users, Wallet, Briefcase, LineChart, Shield,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CommandPalette } from "@/components/ui/command-palette";
import { CareHubLogoWithText } from "@/components/ui/carehub-logo";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useOrganisation } from "@/hooks/use-organisation";
import { useNavCounts } from "@/hooks/use-nav-counts";
import { initials } from "@/lib/avatar";
import { ROLE_LABEL } from "@/lib/roles";

type CountKey = "approvals" | "incidents" | "chat" | "onboarding" | "documents";
type Leaf = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: CountKey; adminOnly?: boolean };
type Section = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; items: Leaf[] };

const HOME: Leaf = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard };

const SECTIONS: Section[] = [
  {
    id: "scheduling", label: "Scheduling", icon: CalendarRange,
    items: [
      { href: "/dashboard/scheduling", label: "Shifts", icon: CalendarRange },
      { href: "/dashboard/schedule", label: "Calendar", icon: CalendarDays },
      { href: "/dashboard/roster", label: "Roster", icon: Briefcase },
      { href: "/dashboard/approvals", label: "Approvals", icon: CheckCheck, badge: "approvals" },
    ],
  },
  {
    id: "people", label: "People", icon: Users,
    items: [
      { href: "/dashboard/clients", label: "Clients", icon: Users },
      { href: "/dashboard/caregivers", label: "Staff", icon: HeartHandshake },
      { href: "/dashboard/onboarding", label: "Onboarding", icon: ClipboardCheck, badge: "onboarding" },
      { href: "/dashboard/users", label: "Users & access", icon: UserCog },
    ],
  },
  {
    id: "communication", label: "Communication", icon: MessageSquare,
    items: [{ href: "/dashboard/chat", label: "Chat", icon: MessageSquare, badge: "chat" }],
  },
  {
    id: "documentation", label: "Documentation", icon: FolderOpen,
    items: [
      { href: "/dashboard/documents", label: "Document hub", icon: FolderOpen, badge: "documents" },
      { href: "/dashboard/shift-note", label: "Shift notes", icon: FileText },
      { href: "/dashboard/incidents", label: "Incidents", icon: ShieldAlert, badge: "incidents" },
    ],
  },
  {
    id: "finance", label: "Finance", icon: Wallet,
    items: [
      { href: "/dashboard/timesheets", label: "Timesheets", icon: Clock },
      { href: "/dashboard/invoices", label: "Invoices", icon: Receipt },
      { href: "/dashboard/pricing", label: "Prices & pay", icon: DollarSign },
    ],
  },
  {
    id: "insights", label: "Insights", icon: BarChart3,
    items: [{ href: "/dashboard/reports", label: "Reports", icon: LineChart }],
  },
  {
    id: "admin", label: "Admin", icon: Settings,
    items: [
      { href: "/dashboard/settings?tab=organisation", label: "Organisation", icon: Settings },
      { href: "/dashboard/settings?tab=roles", label: "Roles & permissions", icon: Shield },
      { href: "/dashboard/settings?tab=security", label: "Security", icon: ShieldAlert },
      { href: "/dashboard/settings?tab=terms", label: "Policies & terms", icon: FileText },
    ],
  },
];

const STORE_KEY = "carehub.sidebar.open";

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Is `href` (which may carry ?tab=) the page we are on? */
function matches(href: string, pathname: string, tab: string | null): boolean {
  const [path, query] = href.split("?");
  if (path === "/dashboard") return pathname === "/dashboard";
  if (!pathname.startsWith(path)) return false;
  if (!query) return true;
  const want = new URLSearchParams(query).get("tab");
  return (tab ?? "organisation") === want;
}

function CountPill({ n, muted }: { n: number; muted?: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        muted ? "bg-sidebar-accent text-sidebar-foreground/80" : "bg-primary text-primary-foreground",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function SidebarInner() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const router = useRouter();
  const { user, role, profile, isAdmin, logout } = useAuth();
  const { org } = useOrganisation();
  const counts = useNavCounts();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  // Restore what the user had expanded; always expand the section holding the current page.
  React.useEffect(() => {
    const saved = readOpen();
    const active = SECTIONS.find((s) => s.items.some((i) => matches(i.href, pathname, tab)));
    setOpen({ ...saved, ...(active ? { [active.id]: true } : {}) });
  }, [pathname, tab]);

  const toggle = (id: string) => {
    setOpen((o) => {
      const next = { ...o, [id]: !o[id] };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  // Ctrl/Cmd+K opens search from anywhere in the dashboard.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    router.push(href);
    if (isMobile) setOpenMobile(false);
  };

  const sectionCount = (s: Section) => s.items.reduce((a, i) => a + (i.badge ? counts[i.badge] : 0), 0);
  const name = profile?.fullName || user?.email || "Account";

  const commandItems = [
    { title: "Dashboard", subtitle: "Live view and operations", onSelect: () => go("/dashboard") },
    ...SECTIONS.flatMap((s) => s.items.filter((i) => !i.adminOnly || isAdmin).map((i) => ({ title: i.label, subtitle: s.label, onSelect: () => go(i.href) }))),
    { title: "New shifts", subtitle: "Create one or many shifts", onSelect: () => go("/dashboard/scheduling?new=1") },
    { title: "My profile", subtitle: "Photo, details and password", onSelect: () => go("/dashboard/profile") },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 p-2">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            {org.logoUrl ? (
              <img src={org.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-0.5" />
            ) : org.name === "CareHub" ? (
              <CareHubLogoWithText size={32} />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{initials(org.name)}</span>
            )}
            {(org.logoUrl || org.name !== "CareHub") && (
              <span className="truncate font-semibold group-data-[collapsible=icon]:hidden" title={org.name}>{org.name}</span>
            )}
          </Link>
        </div>
        <button
          onClick={() => setCommandOpen(true)}
          className="mx-2 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
          aria-label="Search"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Search</span>
          <kbd className="ml-auto rounded border border-sidebar-border px-1.5 text-[10px] font-medium group-data-[collapsible=icon]:hidden">Ctrl K</kbd>
        </button>
        <CommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          items={commandItems}
          placeholder="Go to a page or action..."
          emptyMessage="Nothing matches."
        />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2 py-1">
        <SidebarGroup className="p-0 py-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/dashboard"} tooltip={HOME.label}>
                <Link href="/dashboard" onClick={() => isMobile && setOpenMobile(false)}>
                  <HOME.icon className="h-5 w-5" />
                  <span>{HOME.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.adminOnly || isAdmin);
          const total = sectionCount(section);
          const isOpen = !!open[section.id];
          const activeHere = items.some((i) => matches(i.href, pathname, tab));
          return (
            <SidebarGroup key={section.id} className="p-0 py-0.5">
              <SidebarMenu>
                <SidebarMenuItem>
                  {collapsed ? (
                    // Icon rail: the section icon opens a menu of its pages.
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton isActive={activeHere} tooltip={section.label} className="relative">
                          <section.icon className="h-5 w-5" />
                          {total > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />}
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" className="min-w-52">
                        <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                        {items.map((i) => (
                          <DropdownMenuItem key={i.href} onSelect={() => go(i.href)} className="gap-2">
                            <i.icon className="h-4 w-4" />{i.label}
                            {i.badge && <CountPill n={counts[i.badge]} />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <SidebarMenuButton
                      onClick={() => toggle(section.id)}
                      aria-expanded={isOpen}
                      className={cn("font-medium text-sidebar-foreground/75", activeHere && "text-sidebar-foreground")}
                    >
                      <section.icon className="h-5 w-5" />
                      <span>{section.label}</span>
                      {!isOpen && <CountPill n={total} muted />}
                      <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-60 transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90", !isOpen && total > 0 ? "ml-1" : "ml-auto")} />
                    </SidebarMenuButton>
                  )}
                  {!collapsed && (
                    <div className={cn("grid transition-all duration-200 ease-out", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                      <div className="overflow-hidden">
                        <SidebarMenuSub className="mr-0 pr-0">
                          {items.map((i) => (
                            <SidebarMenuSubItem key={i.href}>
                              <SidebarMenuSubButton asChild isActive={matches(i.href, pathname, tab)}>
                                <Link href={i.href} onClick={() => isMobile && setOpenMobile(false)} tabIndex={isOpen ? 0 : -1}>
                                  <i.icon className="h-4 w-4" />
                                  <span className="truncate">{i.label}</span>
                                  {i.badge && <CountPill n={counts[i.badge]} />}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </div>
                    </div>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" tooltip={name}>
                  <Avatar className="h-8 w-8 rounded-lg">
                    {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" className="object-cover" />}
                    <AvatarFallback className="rounded-lg bg-primary text-xs font-semibold text-primary-foreground">{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold">{name}</span>
                    <span className="truncate text-xs text-sidebar-foreground/60">{role ? ROLE_LABEL[role] : ""}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" className="min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => go("/dashboard/profile")} className="gap-2"><UserRound className="h-4 w-4" />My profile and photo</DropdownMenuItem>
                {isAdmin && <DropdownMenuItem onSelect={() => go("/dashboard/settings")} className="gap-2"><Settings className="h-4 w-4" />Settings</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void logout(true)} className="gap-2 text-destructive focus:text-destructive"><LogOut className="h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export default function AppSidebar() {
  return (
    <React.Suspense fallback={null}>
      <SidebarInner />
    </React.Suspense>
  );
}
