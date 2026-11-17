"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { SupportFamily, SupportItem } from "@/lib/types";

export type Site = { id: string; name: string; kind: string; address?: string; lat?: number; lng?: number };

/** Price guide (cost codes + families) and sites: small, rarely changing lookups. */
export function useCatalog() {
  const { user } = useAuth();
  const [families, setFamilies] = useState<SupportFamily[]>([]);
  const [items, setItems] = useState<SupportItem[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const [f, i, s] = await Promise.all([
        supabase.from("support_families").select("*").order("label"),
        supabase.from("support_items").select("*").eq("active", true).order("item_number"),
        supabase.from("sites").select("*").eq("active", true).order("name"),
      ]);
      if (!active) return;
      setFamilies((f.data ?? []).map((r: any) => ({ familyKey: r.family_key, label: r.label, category: r.category ?? undefined })));
      setItems(
        (i.data ?? []).map((r: any) => ({
          itemNumber: r.item_number, name: r.name, familyKey: r.family_key, timeBand: r.time_band, ratio: r.ratio,
          unit: r.unit, isSleepover: !!r.is_sleepover, priceNational: Number(r.price_national),
          priceRemote: r.price_remote == null ? undefined : Number(r.price_remote),
          priceVeryRemote: r.price_very_remote == null ? undefined : Number(r.price_very_remote), active: !!r.active,
        }))
      );
      setSites((s.data ?? []).map((r: any) => ({ id: r.id, name: r.name, kind: r.kind, address: r.address ?? undefined, lat: r.lat ?? undefined, lng: r.lng ?? undefined })));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  return { families, items, sites, loading };
}
