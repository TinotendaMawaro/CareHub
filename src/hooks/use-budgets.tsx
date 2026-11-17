"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { refreshOnChange } from "@/lib/supabase/realtime";
import {
  mapParticipantPlan,
  toParticipantPlanRow,
  mapPlanBudget,
  toPlanBudgetRow,
  mapBudgetSummary,
  mapBudgetAdjustment,
  toBudgetAdjustmentRow,
  mapSupportCategory,
  mapNewExpense,
  toNewExpenseRow,
} from "@/lib/supabase/mappers";
import type {
  ParticipantPlan,
  PlanBudget,
  BudgetSummary,
  BudgetAdjustment,
  SupportCategory,
  NewExpense,
} from "@/lib/types";
import { useClients } from "./use-clients";
import { useAuth } from "./use-auth";

export function useSupportCategories() {
  const [items, setItems] = useState<SupportCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from("support_categories")
          .select("*")
          .order("category_no");
        setItems((data ?? []).map(mapSupportCategory));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return { categories: items, loading };
}

export function useParticipantPlans(clientId?: string) {
  const [plans, setPlans] = useState<ParticipantPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setPlans([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("participant_plans")
          .select("*")
          .eq("client_id", clientId)
          .order("start_date", { ascending: false });
        setPlans((data ?? []).map(mapParticipantPlan));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    void load();
    return refreshOnChange("participant_plans", load);
  }, [clientId]);

  const createPlan = async (plan: Partial<ParticipantPlan>) => {
    const { data } = await supabase
      .from("participant_plans")
      .insert(toParticipantPlanRow(plan))
      .select("*")
      .single();
    if (data) {
      setPlans((prev) => [mapParticipantPlan(data), ...prev]);
    }
    return data;
  };

  const updatePlan = async (id: string, patch: Partial<ParticipantPlan>) => {
    const { data } = await supabase
      .from("participant_plans")
      .update(toParticipantPlanRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (data) {
      setPlans((prev) => prev.map((p) => (p.id === id ? mapParticipantPlan(data) : p)));
    }
    return data;
  };

  return { plans, loading, createPlan, updatePlan };
}

export function usePlanBudgets(planId?: string) {
  const [items, setItems] = useState<PlanBudget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) {
      setItems([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("plan_budgets")
          .select("*")
          .eq("plan_id", planId)
          .order("category_no");
        setItems((data ?? []).map(mapPlanBudget));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [planId]);

  const upsertBudget = async (budget: Partial<PlanBudget>) => {
    const { data } = await supabase
      .from("plan_budgets")
      .upsert(toPlanBudgetRow(budget), { onConflict: "plan_id,category_no" })
      .select("*")
      .single();
    if (data) {
      setItems((prev) => {
        const idx = prev.findIndex((b) => b.planId === budget.planId && b.categoryNo === budget.categoryNo);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = mapPlanBudget(data);
          return next;
        }
        return [...prev, mapPlanBudget(data)];
      });
    }
    return data;
  };

  return { budgets: items, loading, upsertBudget };
}

export function useBudgetSummary(planId?: string) {
  const [items, setItems] = useState<BudgetSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) {
      setItems([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("budget_summary")
          .select("*")
          .eq("plan_id", planId);
        setItems((data ?? []).map(mapBudgetSummary));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [planId]);

  return { summary: items, loading };
}

export function useBudgetAdjustments(planId?: string) {
  const [items, setItems] = useState<BudgetAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) {
      setItems([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("budget_adjustments")
          .select("*")
          .eq("plan_id", planId)
          .order("created_at", { ascending: false });
        setItems((data ?? []).map(mapBudgetAdjustment));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    void load();
    return refreshOnChange("budget_adjustments", load);
  }, [planId]);

  const addAdjustment = async (patch: Partial<BudgetAdjustment>) => {
    const { data } = await supabase
      .from("budget_adjustments")
      .insert(toBudgetAdjustmentRow(patch))
      .select("*")
      .single();
    if (data) {
      setItems((prev) => [mapBudgetAdjustment(data), ...prev]);
    }
    return data;
  };

  return { adjustments: items, loading, addAdjustment };
}

export function useExpensesNew(clientId?: string, planId?: string) {
  const [items, setItems] = useState<NewExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId && !planId) {
      setItems([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        let q = supabase.from("expenses").select("*");
        if (clientId) q = q.eq("client_id", clientId);
        if (planId) q = q.eq("plan_id", planId);
        const { data } = await q.order("incurred_on", { ascending: false });
        setItems((data ?? []).map(mapNewExpense));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    void load();
    return refreshOnChange("expenses", load);
  }, [clientId, planId]);

  const addExpense = async (expense: Partial<NewExpense>) => {
    const { data } = await supabase
      .from("expenses")
      .insert(toNewExpenseRow(expense))
      .select("*")
      .single();
    if (data) {
      setItems((prev) => [mapNewExpense(data), ...prev]);
    }
    return data;
  };

  const updateExpense = async (id: string, patch: Partial<NewExpense>) => {
    const { data } = await supabase
      .from("expenses")
      .update(toNewExpenseRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (data) {
      setItems((prev) => prev.map((e) => (e.id === id ? mapNewExpense(data) : e)));
    }
    return data;
  };

  return { expenses: items, loading, addExpense, updateExpense };
}
