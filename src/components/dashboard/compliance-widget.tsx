"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganisation } from "@/hooks/use-organisation";
import { type DocumentRow, EXPIRING_SOON_DAYS, expiryLabel, expiryState, ownerName, ymdIn } from "@/lib/documents";
import { supabase } from "@/lib/supabase/client";

/** Documents that have lapsed or will within 30 days, plus worker uploads waiting for review. */
export function ComplianceWidget() {
  const { org } = useOrganisation();
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [pending, setPending] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const today = ymdIn(new Date(), org.timezone);

  useEffect(() => {
    let alive = true;
    const horizon = new Date(Date.now() + (EXPIRING_SOON_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
    void Promise.all([
      supabase
        .from("documents")
        .select("id,title,category,caregiver_id,client_id,expiry_date,status,caregivers(name),clients(first_name,last_name)")
        .eq("archived", false)
        .neq("status", "rejected")
        .not("expiry_date", "is", null)
        .lte("expiry_date", horizon)
        .order("expiry_date")
        .limit(50),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("archived", false).eq("status", "pending_review"),
    ]).then(([due, pend]) => {
      if (!alive) return;
      setRows((due.data ?? []) as unknown as DocumentRow[]);
      setPending(pend.count ?? 0);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const flagged = rows.filter((r) => expiryState(r.expiry_date, today) !== "valid");
  const expired = flagged.filter((r) => expiryState(r.expiry_date, today) === "expired").length;

  return (
    <Card className="transition-all duration-200 hover:shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="h-5 w-5" />
          Compliance
          {loaded && expired > 0 && <Badge variant="destructive">{expired} expired</Badge>}
        </CardTitle>
        <CardDescription>Documents expired or expiring in the next {EXPIRING_SOON_DAYS} days</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loaded && flagged.length === 0 && pending === 0 && (
          <p className="text-sm text-muted-foreground">Everything is current. Nothing expires in the next {EXPIRING_SOON_DAYS} days.</p>
        )}
        {flagged.slice(0, 6).map((r) => {
          const s = expiryState(r.expiry_date, today);
          return (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{ownerName(r)}</p>
                <p className="truncate text-xs text-muted-foreground">{r.title}</p>
              </div>
              <Badge variant="outline" className={`shrink-0 ${s === "expired" ? "border-destructive/40 text-destructive" : "border-amber-300 text-amber-700"}`}>
                {expiryLabel(r.expiry_date, today)}
              </Badge>
            </div>
          );
        })}
        {pending > 0 && (
          <Link href="/dashboard/documents?filter=pending" className="block pt-1 text-xs font-medium text-primary hover:underline">
            {pending} uploaded by workers, waiting for review
          </Link>
        )}
        {(flagged.length > 6 || (flagged.length > 0 && pending === 0)) && (
          <Link href="/dashboard/documents?filter=attention" className="block pt-1 text-xs font-medium text-primary hover:underline">
            Review all in Documents
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
