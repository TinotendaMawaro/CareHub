import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app/app-header";
import AppSidebar from "@/components/app/app-sidebar";
import { AuthGuard } from "@/hooks/use-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SidebarProvider>
          <AppSidebar />
          <div className="flex-1 flex flex-col min-h-screen">
            <AppHeader />
            <main className="flex-1 bg-muted/40 p-2 sm:p-4 md:p-6">{children}</main>
          </div>
      </SidebarProvider>
    </AuthGuard>
  );
}
