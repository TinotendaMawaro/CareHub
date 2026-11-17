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
          <div className="flex-1 min-w-0 flex flex-col min-h-screen">
            <AppHeader />
            <main className="flex-1 mesh-bg p-3 sm:p-5 md:p-8 animate-fade-up">{children}</main>
          </div>
      </SidebarProvider>
    </AuthGuard>
  );
}
