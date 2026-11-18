"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, BarChart3, ListChecks, Plane } from "lucide-react";
import { LeaveView } from "@/components/dashboard/leave-view";
import { LiveView } from "@/components/dashboard/live-view";
import { MyTasksView } from "@/components/dashboard/my-tasks-view";
import { OperationsView } from "@/components/dashboard/operations-view";
import { useOrganisation } from "@/hooks/use-organisation";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "live", label: "Live", icon: Activity, blurb: "Real-time view of every shift, staff member and client" },
  { id: "operations", label: "Operations", icon: BarChart3, blurb: "Trends, utilisation and the overview" },
  { id: "tasks", label: "My tasks", icon: ListChecks, blurb: "Everything waiting on the office" },
  { id: "leave", label: "Leave", icon: Plane, blurb: "Who is away, what it affects, and requests to decide" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

function Dashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { org } = useOrganisation();
  const requested = params.get("view") as ViewId | null;
  const view: ViewId = VIEWS.some((v) => v.id === requested) ? requested! : "live";
  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="truncate text-sm text-muted-foreground">{org.name !== "CareHub" ? `${org.name} · ` : ""}{current.blurb}</p>
        </div>
        <nav className="inline-flex max-w-full overflow-x-auto rounded-xl border bg-card p-1 shadow-sm" role="tablist" aria-label="Dashboard views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => router.replace(`${pathname}?view=${v.id}`, { scroll: false })}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                view === v.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <v.icon className="h-4 w-4" />{v.label}
            </button>
          ))}
        </nav>
      </div>

      <div key={view} className="animate-fade-up">
        {view === "live" && <LiveView />}
        {view === "operations" && <OperationsView />}
        {view === "tasks" && <MyTasksView />}
        {view === "leave" && <LeaveView />}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
