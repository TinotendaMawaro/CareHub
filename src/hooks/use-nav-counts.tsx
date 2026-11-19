"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";
import { useAuth } from "./use-auth";

/** Live counts for sidebar badges: work waiting for the office. */
export function useNavCounts() {
  const { user, isOffice } = useAuth();
  const [counts, setCounts] = useState({ approvals: 0, incidents: 0, chat: 0, onboarding: 0, documents: 0 });

  const load = useCallback(async () => {
    const head = { count: "exact" as const, head: true };
    const [approvals, incidents, chat, onboarding, docs] = await Promise.all([
      supabase.from("shifts").select("id", head).eq("deleted", false).eq("status", "Completed").is("approved_at", null),
      supabase.from("incidents").select("id", head).eq("status", "Reported"),
      supabase.from("chat_overview").select("unread"),
      supabase.from("onboarding_tasks").select("id", head).eq("status", "submitted"),
      supabase.rpc("document_expiry_summary", { p_days: 30 }),
    ]);
    setCounts({
      approvals: approvals.count ?? 0,
      incidents: incidents.count ?? 0,
      chat: (chat.data ?? []).reduce((a: number, r: any) => a + Number(r.unread ?? 0), 0),
      onboarding: onboarding.count ?? 0,
      // Waiting for review plus already expired: things the office must act on.
      documents: (() => { const r = (docs.data as any[] | null)?.[0]; return r ? Number(r.pending_review) + Number(r.expired) : 0; })(),
    });
  }, []);

  useEffect(() => {
    if (!user || !isOffice) return;
    void load();
    const offs = ["shifts", "incidents", "chat_messages", "onboarding_tasks", "documents"].map((t) => subscribeToTable(t, () => void load()));
    return () => offs.forEach((o) => o());
  }, [user, isOffice, load]);

  return counts;
}
