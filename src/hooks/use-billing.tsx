"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { refreshOnChange } from "@/lib/supabase/realtime";
import { useAuth } from "./use-auth";
import type { Billing } from "@/lib/types";

/**
 * Invoices in the shape the dashboard's revenue cards expect.
 * Overdue is derived (due date passed and not paid), never stored.
 */
export function mapInvoiceToBilling(r: any, today = new Date().toISOString().slice(0, 10)): Billing {
  const status: Billing["status"] =
    r.status === "void" ? "Cancelled"
    : r.status === "paid" ? "Paid"
    : r.status === "draft" ? "Draft"
    : r.due_date < today ? "Overdue"
    : "Sent";
  return {
    id: r.id,
    clientId: r.client_id,
    invoiceNumber: r.number,
    period: { startDate: new Date(r.period_start), endDate: new Date(r.period_end) },
    services: [],
    subtotal: Number(r.subtotal),
    tax: Number(r.gst_amount),
    total: Number(r.total),
    currency: "AUD",
    dueDate: new Date(r.due_date),
    status,
    paymentDate: r.paid_at ? new Date(r.paid_at) : undefined,
    createdAt: new Date(r.created_at),
  };
}

export function useBilling() {
  const { user, isOffice } = useAuth();
  const [billing, setBilling] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("invoices")
      .select("id,client_id,number,period_start,period_end,due_date,status,subtotal,gst_amount,total,paid_at,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (err) setError(err.message);
    else {
      setError(null);
      setBilling((data ?? []).map((r) => mapInvoiceToBilling(r)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user || !isOffice) {
      setLoading(false);
      return;
    }
    void load();
    return refreshOnChange("invoices", load);
  }, [user, isOffice, load]);

  return { billing, loading, error };
}
