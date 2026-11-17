"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";

export type BudgetAtRisk = { id: string; name: string; percentUsed: number; timeElapsed: number; category: string };

/**
 * Participants whose most-used budget category is being spent faster than their plan period is passing.
 * Real data: active plans and the budget_summary view (approved shifts spent, booked shifts committed).
 */
export function useBudgetsAtRisk(clientNames: Record<string, string>) {
  const { user, isOffice } = useAuth();
  const [items, setItems] = useState<BudgetAtRisk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !isOffice) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      const { data: plans } = await supabase
        .from("participant_plans")
        .select("id, client_id, start_date, end_date")
        .eq("status", "active");
      if (!plans?.length) {
        if (active) { setItems([]); setLoading(false); }
        return;
      }
      const { data: rows } = await supabase
        .from("budget_summary")
        .select("plan_id, name, percent_used")
        .in("plan_id", plans.map((p) => p.id));
      const now = Date.now();
      const out: BudgetAtRisk[] = [];
      for (const p of plans) {
        const top = (rows ?? []).filter((r) => r.plan_id === p.id).sort((a, b) => Number(b.percent_used) - Number(a.percent_used))[0];
        if (!top) continue;
        const start = Date.parse(p.start_date);
        const end = Date.parse(p.end_date);
        const timeElapsed = end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 100;
        const percentUsed = Math.min(100, Number(top.percent_used));
        out.push({ id: p.client_id, name: clientNames[p.client_id] ?? "Participant", percentUsed, timeElapsed, category: top.name });
      }
      if (active) {
        setItems(out.filter((x) => x.percentUsed >= x.timeElapsed).sort((a, b) => b.percentUsed - a.percentUsed).slice(0, 5));
        setLoading(false);
      }
    })();
    return () => { active = false; };
    // clientNames changes identity every render; the plan data does not depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isOffice, Object.keys(clientNames).length]);

  return { budgetsAtRisk: items, loading };
}
