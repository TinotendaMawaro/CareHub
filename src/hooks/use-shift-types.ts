"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";
import type { ShiftType } from "@/lib/types";

const map = (r: any): ShiftType => ({ id: r.id, name: r.name, colour: r.colour, isDefault: !!r.is_default, sort: Number(r.sort ?? 0) });

/** The organisation's active shift types, kept live. */
export function useShiftTypes() {
  const [types, setTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("shift_types").select("*").eq("active", true).order("sort").order("name");
    setTypes((data ?? []).map(map));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return subscribeToTable("shift_types", () => void load());
  }, [load]);

  const save = useCallback(async (t: { id?: string; name: string; colour: string }) => {
    const row = { name: t.name.trim(), colour: t.colour.toUpperCase() };
    const { error } = t.id
      ? await supabase.from("shift_types").update(row).eq("id", t.id)
      : await supabase.from("shift_types").insert({ ...row, sort: types.length });
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "There is already a type with that name." : error.message);
    await load();
  }, [load, types.length]);

  /** Hidden rather than deleted, so past shifts keep their colour in reports. */
  const archive = useCallback(async (id: string) => {
    const { error } = await supabase.from("shift_types").update({ active: false, is_default: false }).eq("id", id);
    if (error) throw new Error(error.message);
    await load();
  }, [load]);

  const makeDefault = useCallback(async (id: string) => {
    const { error: e1 } = await supabase.from("shift_types").update({ is_default: false }).eq("is_default", true);
    if (e1) throw new Error(e1.message);
    const { error } = await supabase.from("shift_types").update({ is_default: true }).eq("id", id);
    if (error) throw new Error(error.message);
    await load();
  }, [load]);

  return { types, loading, save, archive, makeDefault, reload: load };
}
