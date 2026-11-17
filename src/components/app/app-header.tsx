"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Home, LineChart, Package, Package2, Search, ShoppingCart, Users, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { SidebarTrigger } from "../ui/sidebar";
import AppSidebar from "./app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { NotificationDropdown } from "@/components/ui/notification-dropdown";
import { useNotifications } from "@/hooks/use-notifications";

export function AppHeader() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const userAvatar = PlaceHolderImages.find((p) => p.id === "avatar-1");
  const [uploading, setUploading] = useState(false);

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const handleProfileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);

      await supabase.auth.updateUser({
        data: { avatar_url: urlData.publicUrl },
      });
      await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", user.id);

      window.location.reload();
    } catch (error) {
      console.error("Error uploading profile picture:", error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-2 border-b border-border/60 glass-bar px-2 sm:gap-4 sm:px-4 lg:h-[60px] lg:px-6">
      <SidebarTrigger className="md:hidden" />
      <div className="w-full flex-1">
        <form>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-1/3"
            />
          </div>
        </form>
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
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={(user?.user_metadata?.avatar_url as string | undefined) || (userAvatar?.imageUrl)} alt="User avatar" />
              <AvatarFallback>{(user?.user_metadata?.full_name as string | undefined)?.charAt(0) || "A"}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{(user?.user_metadata?.full_name as string | undefined) || "Admin"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <label className="cursor-pointer flex items-center gap-2">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading..." : "Upload Profile Picture"}
              <input
                type="file"
                accept="image/*"
                onChange={handleProfileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Support</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout(true)}>
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
