
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogIn,
  LayoutDashboard,
  Users,
  HeartHandshake,
  CalendarDays,
  LineChart,
  ShieldAlert,
  Settings,
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
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/caregivers", label: "Caregivers", icon: HeartHandshake },
  { href: "/dashboard/scheduling", label: "Scheduling", icon: CalendarDays },
  { href: "/dashboard/reports", label: "Reports", icon: LineChart },
  { href: "/dashboard/incidents", label: "Incidents", icon: ShieldAlert, badge: "2" },
];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 p-2">
            <LogIn className="w-8 h-8 text-primary" />
            <span className="text-lg font-semibold font-headline">CareHub</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={pathname === item.href}
                  tooltip={{ children: item.label }}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                  {item.badge && <Badge className="ml-auto">{item.badge}</Badge>}
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton tooltip={{ children: "Settings" }}>
                    <Settings className="h-5 w-5" />
                    <span>Settings</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
