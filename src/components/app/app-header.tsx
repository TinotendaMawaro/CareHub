"use client";

import { useRouter } from "next/navigation";
import { LogOut, Search, Settings, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "@/components/ui/notification-dropdown";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { initials } from "@/lib/avatar";
import { ROLE_LABEL } from "@/lib/roles";

/** The sidebar owns the search palette; it listens for Ctrl/Cmd+K. */
function openSearch() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
}

export function AppHeader() {
  const router = useRouter();
  const { user, role, profile, isAdmin, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const name = profile?.fullName || user?.email || "Account";

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/60 glass-bar px-3 sm:gap-4 sm:px-4 lg:h-[60px] lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <div className="min-w-0 flex-1">
        <button
          onClick={openSearch}
          className="flex w-full max-w-md items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted/60"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Search pages and actions</span>
          <kbd className="ml-auto hidden rounded border px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
        </button>
      </div>
      <NotificationDropdown
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onClearAll={clearAll}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
            <Avatar className="h-8 w-8 ring-2 ring-background shadow-sm">
              {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" className="object-cover" />}
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(name)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{role ? ROLE_LABEL[role] : user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/dashboard/profile")} className="gap-2"><UserRound className="h-4 w-4" />My profile and photo</DropdownMenuItem>
          {isAdmin && <DropdownMenuItem onSelect={() => router.push("/dashboard/settings")} className="gap-2"><Settings className="h-4 w-4" />Settings</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout(true)} className="gap-2 text-destructive focus:text-destructive"><LogOut className="h-4 w-4" />Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
