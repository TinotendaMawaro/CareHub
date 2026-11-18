"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarX2, CheckCheck, CheckCircle2, ClipboardCheck, FileClock, FileWarning, Flag, Plane, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ShiftDetailSheet from "@/components/shifts/shift-detail-sheet";
import { useAuth } from "@/hooks/use-auth";
import { useOrganisation } from "@/hooks/use-organisation";
import { EXPIRING_SOON_DAYS } from "@/lib/documents";
import { formatTime, formatWhen } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Task = { key: string; title: string; detail: string; count: number; href: string; icon: React.ComponentType<{ className?: string }>; urgent?: boolean };
type Open = { id: string; start_time: string; end_time: string; required_workers: number | null; shift_workers: { caregiver_id: string }[]; shift_clients: { clients: { first_name: string | null; last_name: string | null } | null }[] };

export function MyTasksView() {
  const { profile } = useAuth();
  const { org } = useOrganisation();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [open, setOpen] = useState<Open[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const now = new Date();
    const head = { count: "exact" as const, head: true };
    const week = new Date(now.getTime() + 7 * 86_400_000).toISOString();
    const horizon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000).toISOString().slice(0, 10);
    void Promise.all([
      supabase.from("shifts").select("id", head).eq("deleted", false).eq("status", "Completed").is("approved_at", null),
      supabase.from("documents").select("id", head).eq("archived", false).eq("status", "pending_review"),
      supabase.from("onboarding_tasks").select("id", head).eq("status", "submitted"),
      supabase.from("incidents").select("id", head).eq("status", "Reported"),
      supabase.from("shifts").select("id,start_time,end_time,required_workers,shift_workers(caregiver_id),shift_clients(clients(first_name,last_name))")
        .eq("deleted", false).eq("status", "Scheduled").gte("start_time", now.toISOString()).lt("start_time", week).order("start_time"),
      supabase.from("time_off_requests").select("id", head).eq("status", "Pending"),
      supabase.from("documents").select("id", head).eq("archived", false).neq("status", "rejected").not("expiry_date", "is", null).lte("expiry_date", horizon),
      supabase.from("shift_notes").select("id", head).eq("follow_up", true).gte("timestamp", new Date(now.getTime() - 14 * 86_400_000).toISOString()),
    ]).then(([approve, docs, onboarding, incidents, upcoming, leave, expiring, followUp]) => {
      if (!alive) return;
      const unfilled = ((upcoming.data ?? []) as unknown as Open[]).filter((s) => s.shift_workers.length < (s.required_workers ?? 1));
      setOpen(unfilled);
      setTasks([
        { key: "incidents", title: "Incidents to triage", detail: "Reported and not yet reviewed", count: incidents.count ?? 0, href: "/dashboard/incidents", icon: ShieldAlert, urgent: true },
        { key: "unfilled", title: "Unfilled shifts", detail: "Next 7 days, still need staff", count: unfilled.length, href: "/dashboard/schedule", icon: CalendarX2, urgent: true },
        { key: "approve", title: "Shifts to approve", detail: "Finished, waiting for approval", count: approve.count ?? 0, href: "/dashboard/approvals", icon: CheckCheck },
        { key: "docs", title: "Documents to review", detail: "Uploaded by staff", count: docs.count ?? 0, href: "/dashboard/documents?filter=pending", icon: FileClock },
        { key: "expiring", title: "Expired or expiring documents", detail: `Within ${EXPIRING_SOON_DAYS} days`, count: expiring.count ?? 0, href: "/dashboard/documents?filter=attention", icon: FileWarning },
        { key: "onboarding", title: "Onboarding to check", detail: "Steps submitted by new staff", count: onboarding.count ?? 0, href: "/dashboard/onboarding", icon: ClipboardCheck },
        { key: "leave", title: "Leave requests", detail: "Waiting for a decision", count: leave.count ?? 0, href: "/dashboard?view=leave", icon: Plane },
        { key: "followup", title: "Notes flagged for follow-up", detail: "Last 14 days", count: followUp.count ?? 0, href: "/dashboard/shift-note", icon: Flag },
      ]);
    });
    return () => { alive = false; };
  }, []);

  const total = tasks?.reduce((a, t) => a + t.count, 0) ?? 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-0 bg-gradient-to-r from-primary/90 to-primary/60 text-primary-foreground shadow-lg">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm opacity-90">{greeting}{profile?.firstName ? `, ${profile.firstName}` : ""}</p>
            <p className="mt-1 text-2xl font-semibold">{tasks === null ? "Checking your queues..." : total === 0 ? "You're all caught up" : `${total} item${total === 1 ? "" : "s"} waiting on the office`}</p>
          </div>
          <CheckCircle2 className="h-12 w-12 opacity-30" />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(tasks ?? []).map((t) => (
          <Link key={t.key} href={t.href} className="group block">
            <Card className={cn("h-full p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md", t.count > 0 && t.urgent && "border-destructive/30")}>
              <div className="flex items-start justify-between">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", t.count === 0 ? "bg-muted text-muted-foreground" : t.urgent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                  <t.icon className="h-4.5 w-4.5" />
                </span>
                <span className={cn("text-2xl font-semibold tabular-nums", t.count === 0 && "text-muted-foreground")}>{t.count}</span>
              </div>
              <p className="mt-3 font-medium">{t.title}</p>
              <p className="text-xs text-muted-foreground">{t.count === 0 ? "All clear" : t.detail}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">Open <ArrowRight className="h-3 w-3" /></span>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next shifts needing staff</CardTitle>
          <CardDescription>Click one to see suggested staff and assign someone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {open.length === 0 && <p className="text-sm text-muted-foreground">Every shift in the next 7 days has staff.</p>}
          {open.slice(0, 8).map((s) => {
            const name = s.shift_clients.map((c) => [c.clients?.first_name, c.clients?.last_name].filter(Boolean).join(" ")).join(", ") || "Client";
            const need = Math.max(1, (s.required_workers ?? 1) - s.shift_workers.length);
            return (
              <button key={s.id} type="button" onClick={() => setOpenId(s.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{formatWhen(s.start_time, org.timezone)} - {formatTime(s.end_time, org.timezone)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Needs {need}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <ShiftDetailSheet shiftId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
