"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { refreshOnChange } from "@/lib/supabase/realtime";
import {
  mapPayrollSettings,
  toPayrollSettingsRow,
  mapPayPeriod,
  mapTimesheet,
  mapTimesheetAdjustment,
  toTimesheetAdjustmentRow,
  mapTimesheetTotal,
} from "@/lib/supabase/mappers";
import type {
  PayrollSettings,
  PayPeriod,
  Timesheet,
  TimesheetAdjustment,
  TimesheetTotal,
} from "@/lib/types";
import { useAuth } from "./use-auth";

export function usePayrollSettings() {
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      const { data } = await supabase.from("settings_payroll").select("*").maybeSingle();
      if (active && data) setSettings(mapPayrollSettings(data));
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const updateSettings = async (patch: Partial<PayrollSettings>) => {
    setSaving(true);
    const { error } = await supabase
      .from("settings_payroll")
      .update(toPayrollSettingsRow(patch))
      .eq("id", settings?.id ?? true);
    if (!error && settings) setSettings({ ...settings, ...patch });
    setSaving(false);
    return error;
  };

  return { settings, loading, saving, updateSettings };
}

export function usePayPeriods() {
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const load = useCallback(async () => {
    // Make sure periods exist around today before listing them.
    await supabase.rpc("ensure_pay_periods");
    const { data } = await supabase
      .from("pay_periods")
      .select("*")
      .order("period_start", { ascending: false });
    setPeriods((data ?? []).map(mapPayPeriod));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    return refreshOnChange("pay_periods", load);
  }, [user, load]);

  return { periods, loading, reload: load };
}

/** Timesheets, optionally narrowed to one worker and/or one pay period. */
export function useTimesheets(caregiverId?: string, payPeriodId?: string) {
  const [items, setItems] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    let q = supabase.from("timesheets").select("*").order("created_at", { ascending: false });
    if (caregiverId) q = q.eq("caregiver_id", caregiverId);
    if (payPeriodId) q = q.eq("pay_period_id", payPeriodId);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else {
      setError(null);
      setItems((data ?? []).map(mapTimesheet));
    }
    setLoading(false);
  }, [caregiverId, payPeriodId]);

  useEffect(() => {
    if (!user) return;
    void load();
    return refreshOnChange("timesheets", load);
  }, [user, load]);

  /** Creates a draft timesheet for every active worker in the period. */
  const ensureForPeriod = async (periodId: string) => {
    const { error: err } = await supabase.rpc("ensure_timesheets", { p_period: periodId });
    if (err) throw new Error(err.message);
    await load();
  };

  const act = async (fn: string, args: Record<string, unknown>) => {
    const { error: err } = await supabase.rpc(fn, args);
    if (err) throw new Error(err.message);
    await load();
  };

  return {
    timesheets: items,
    loading,
    error,
    reload: load,
    ensureForPeriod,
    submit: (id: string) => act("submit_timesheet", { p_ts: id }),
    approve: (id: string, approveShifts = false) =>
      act("approve_timesheet", { p_ts: id, p_approve_shifts: approveShifts }),
    reject: (id: string, reason: string) => act("reject_timesheet", { p_ts: id, p_reason: reason }),
    reopen: (id: string) => act("reopen_timesheet", { p_ts: id }),
  };
}

export function useTimesheetAdjustments(timesheetId?: string) {
  const [items, setItems] = useState<TimesheetAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!timesheetId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("timesheet_adjustments")
      .select("*")
      .eq("timesheet_id", timesheetId)
      .order("created_at", { ascending: false });
    setItems((data ?? []).map(mapTimesheetAdjustment));
    setLoading(false);
  }, [timesheetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addAdjustment = async (adjustment: Partial<TimesheetAdjustment>) => {
    const { error } = await supabase
      .from("timesheet_adjustments")
      .insert(toTimesheetAdjustmentRow(adjustment));
    if (error) throw new Error(error.message);
    await load();
  };

  return { adjustments: items, loading, addAdjustment };
}

/** Roll-ups for one timesheet, or for every timesheet in a period. */
export function useTimesheetTotals(timesheetId?: string) {
  const [total, setTotal] = useState<TimesheetTotal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!timesheetId) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from("timesheet_totals")
        .select("*")
        .eq("timesheet_id", timesheetId)
        .maybeSingle();
      if (active) {
        setTotal(data ? mapTimesheetTotal(data) : null);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [timesheetId]);

  return { total, loading };
}

export function usePeriodTotals(payPeriodId?: string) {
  const [totals, setTotals] = useState<Record<string, TimesheetTotal>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!payPeriodId) {
      setTotals({});
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("timesheet_totals").select("*").eq("pay_period_id", payPeriodId);
    const map: Record<string, TimesheetTotal> = {};
    for (const row of data ?? []) {
      const t = mapTimesheetTotal(row);
      map[t.timesheetId] = t;
    }
    setTotals(map);
    setLoading(false);
  }, [payPeriodId]);

  useEffect(() => {
    void load();
    const a = refreshOnChange("timesheets", load);
    const b = refreshOnChange("shifts", load);
    return () => {
      a();
      b();
    };
  }, [load]);

  return { totals, loading, reload: load };
}
