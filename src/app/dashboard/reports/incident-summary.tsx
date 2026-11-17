"use client";

import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import type { IncidentReport } from "@/lib/types";

/** AI trend summary, generated only when asked. Names are never sent to the model. */
export default function IncidentSummary({ reports }: { reports: IncidentReport[] }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/ai/incident-summary", {
        method: "POST",
        headers: { Authorization: `Bearer ${s.session?.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setSummary(json.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" />Incident trends</CardTitle>
        <CardDescription>
          {reports.length} incident report{reports.length === 1 ? "" : "s"}. An AI summary of recent descriptions (no names are shared) highlights recurring issues.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={generate} disabled={busy || reports.length === 0} variant="outline">
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Summarising...</> : summary ? "Refresh summary" : "Generate summary"}
        </Button>
        {error && <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{error}</p>}
        {summary && (
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            {summary.split("\n").map((line, i) =>
              /^\s*[*-]/.test(line)
                ? <p key={i} className="m-0 ml-4 before:mr-2 before:content-['•']">{line.replace(/^\s*[*-]\s*/, "")}</p>
                : <p key={i} className="m-0">{line}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
