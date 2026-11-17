"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "./use-auth";
import type { Organisation } from "@/lib/types";

const DEFAULT_ORG: Organisation = {
  name: "CareHub",
  brandColor: "#64B5F6",
  accentColor: "#4DB6AC",
  timezone: "Australia/Sydney",
  currency: "AUD",
  invoicePrefix: "INV",
  invoiceTermsDays: 14,
  gstRate: 0,
  xeroAccountCode: "200",
  xeroTaxType: "GST Free Income",
  defaultGeofenceRequired: true,
  defaultGeofenceRadiusM: 150,
  enforceGeofenceOnEnd: false,
  clockInEarlyMinutes: 15,
  requireNoteOnEnd: true,
};

export function mapOrganisation(r: any): Organisation {
  return {
    name: r.name ?? DEFAULT_ORG.name,
    legalName: r.legal_name ?? undefined,
    abn: r.abn ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    address: r.address ?? undefined,
    website: r.website ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    brandColor: r.brand_color ?? DEFAULT_ORG.brandColor,
    accentColor: r.accent_color ?? DEFAULT_ORG.accentColor,
    timezone: r.timezone ?? DEFAULT_ORG.timezone,
    state: r.state ?? undefined,
    currency: r.currency ?? DEFAULT_ORG.currency,
    invoicePrefix: r.invoice_prefix ?? DEFAULT_ORG.invoicePrefix,
    invoiceTermsDays: Number(r.invoice_terms_days ?? DEFAULT_ORG.invoiceTermsDays),
    gstRate: Number(r.gst_rate ?? 0),
    invoiceFooter: r.invoice_footer ?? undefined,
    bankDetails: r.bank_details ?? undefined,
    xeroAccountCode: r.xero_account_code ?? DEFAULT_ORG.xeroAccountCode,
    xeroTaxType: r.xero_tax_type ?? DEFAULT_ORG.xeroTaxType,
    defaultGeofenceRequired: r.default_geofence_required ?? DEFAULT_ORG.defaultGeofenceRequired,
    defaultGeofenceRadiusM: Number(r.default_geofence_radius_m ?? DEFAULT_ORG.defaultGeofenceRadiusM),
    enforceGeofenceOnEnd: !!r.enforce_geofence_on_end,
    clockInEarlyMinutes: Number(r.clock_in_early_minutes ?? DEFAULT_ORG.clockInEarlyMinutes),
    requireNoteOnEnd: r.require_note_on_end ?? DEFAULT_ORG.requireNoteOnEnd,
  };
}

export function toOrganisationRow(d: Partial<Organisation>): Record<string, unknown> {
  const map: Record<string, string> = {
    name: "name", legalName: "legal_name", abn: "abn", email: "email", phone: "phone", address: "address",
    website: "website", logoUrl: "logo_url", brandColor: "brand_color", accentColor: "accent_color",
    timezone: "timezone", state: "state", currency: "currency", invoicePrefix: "invoice_prefix",
    invoiceTermsDays: "invoice_terms_days", gstRate: "gst_rate", invoiceFooter: "invoice_footer",
    bankDetails: "bank_details", xeroAccountCode: "xero_account_code", xeroTaxType: "xero_tax_type",
    defaultGeofenceRequired: "default_geofence_required", defaultGeofenceRadiusM: "default_geofence_radius_m",
    enforceGeofenceOnEnd: "enforce_geofence_on_end", clockInEarlyMinutes: "clock_in_early_minutes",
    requireNoteOnEnd: "require_note_on_end",
  };
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (map[k] && v !== undefined) row[map[k]] = v === "" ? null : v;
  return row;
}

/** "#64B5F6" -> "207 89% 68%" (the space-separated HSL triple the theme tokens use). */
export function hexToHslTriple(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Text colour (as an HSL triple) that stays readable on the given brand colour. */
function readableOn(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "222 47% 11%" : "0 0% 100%";
}

type Ctx = {
  org: Organisation;
  loaded: boolean;
  reload: () => Promise<void>;
  save: (patch: Partial<Organisation>) => Promise<void>;
};

const OrganisationContext = createContext<Ctx>({
  org: DEFAULT_ORG, loaded: false, reload: async () => {}, save: async () => {},
});

export function OrganisationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organisation>(DEFAULT_ORG);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    // Signed in: the full row. Signed out (login screen): just name, logo and colours.
    const { data } = user
      ? await supabase.from("organisation").select("*").maybeSingle()
      : await supabase.from("organisation_public").select("*").maybeSingle();
    if (data) setOrg(mapOrganisation(data));
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Apply brand colours to the theme tokens.
  useEffect(() => {
    const root = document.documentElement;
    const primary = hexToHslTriple(org.brandColor);
    if (primary) {
      root.style.setProperty("--primary", primary);
      root.style.setProperty("--ring", primary);
      root.style.setProperty("--sidebar-primary", primary);
      root.style.setProperty("--primary-foreground", readableOn(org.brandColor));
    }
    const accent = hexToHslTriple(org.accentColor);
    if (accent) root.style.setProperty("--chart-2", accent);
    document.title = org.name;
  }, [org.brandColor, org.accentColor, org.name]);

  const save = useCallback(
    async (patch: Partial<Organisation>) => {
      const { error } = await supabase.from("organisation").update(toOrganisationRow(patch)).eq("id", true);
      if (error) throw new Error(error.message);
      await reload();
    },
    [reload]
  );

  const value = useMemo(() => ({ org, loaded, reload, save }), [org, loaded, reload, save]);
  return <OrganisationContext.Provider value={value}>{children}</OrganisationContext.Provider>;
}

export const useOrganisation = () => useContext(OrganisationContext);
