"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type ShiftExtras = {
  notes: number;
  expenses: number;
  expenseTotal: number;
  km: number;
  tasks: number;
  tasksDone: number;
  requiredOpen: number;
  value: number; // billed, ex GST
};

const EMPTY: ShiftExtras = { notes: 0, expenses: 0, expenseTotal: 0, km: 0, tasks: 0, tasksDone: 0, requiredOpen: 0, value: 0 };
const CHUNK = 150;

async function rowsFor(table: string, select: string, ids: string[]) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase.from(table).select(select).in("shift_id", ids.slice(i, i + CHUNK));
    out.push(...(data ?? []));
  }
  return out;
}

/** Notes, expenses, mileage, tasks and billed value for the shifts on screen (one round trip per table). */
export function useShiftExtras(ids: string[]) {
  const [extras, setExtras] = useState<Record<string, ShiftExtras>>({});
  const key = [...ids].sort().join(",");

  useEffect(() => {
    if (!key) { setExtras({}); return; }
    const list = key.split(",");
    let live = true;
    (async () => {
      const [notes, expenses, mileage, tasks, segs] = await Promise.all([
        rowsFor("shift_notes", "shift_id", list),
        rowsFor("expenses", "shift_id, amount", list),
        rowsFor("mileage", "shift_id, distance", list),
        rowsFor("shift_tasks", "shift_id, mandatory, done_at", list),
        rowsFor("shift_segments", "shift_id, bill_amount", list),
      ]);
      const m: Record<string, ShiftExtras> = {};
      const get = (id: string) => (m[id] ??= { ...EMPTY });
      for (const r of notes) get(r.shift_id).notes++;
      for (const r of expenses) { const e = get(r.shift_id); e.expenses++; e.expenseTotal += Number(r.amount ?? 0); }
      for (const r of mileage) get(r.shift_id).km += Number(r.distance ?? 0);
      for (const r of tasks) {
        const e = get(r.shift_id);
        e.tasks++;
        if (r.done_at) e.tasksDone++;
        else if (r.mandatory) e.requiredOpen++;
      }
      for (const r of segs) get(r.shift_id).value += Number(r.bill_amount ?? 0);
      if (live) setExtras(m);
    })().catch(() => {});
    return () => { live = false; };
  }, [key]);

  return (id: string) => extras[id] ?? EMPTY;
}
