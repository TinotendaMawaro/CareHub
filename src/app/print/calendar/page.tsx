"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useOrganisation } from "@/hooks/use-organisation";
import { useShiftTypes } from "@/hooks/use-shift-types";
import { supabase } from "@/lib/supabase/client";
import { formatTime, isoToZonedInput, zonedToIso } from "@/lib/format";
import { resolveShiftType } from "@/lib/shift-type";
import { addMonths, dayLabel, monthGrid, monthLabel } from "@/lib/week";
import { cn } from "@/lib/utils";

/**
 * A month calendar for one staff member or client, laid out for paper (A4 landscape).
 * Open from the calendar icon on staff and client pages: /print/calendar?kind=staff&id=...&month=2026-11
 */
export default function PrintCalendarPage() {
  return (
    <Suspense fallback={null}>
      <PrintCalendar />
    </Suspense>
  );
}

type Row = { id: string; start: string; end: string; date: string; status: string; label: string; typeId: string | null; sleepover: boolean; cancelled: boolean };

function PrintCalendar() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { org } = useOrganisation();
  const { types } = useShiftTypes();
  const tz = org.timezone;
  const kind = params.get("kind") === "client" ? "client" : "staff";
  const id = params.get("id") ?? "";
  const today = isoToZonedInput(new Date(), tz).slice(0, 10);
  const month = /^\d{4}-\d{2}$/.test(params.get("month") ?? "") ? `${params.get("month")}-01` : `${today.slice(0, 7)}-01`;
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!authLoading && !user) router.replace("/"); }, [authLoading, user, router]);

  const weeks = useMemo(() => monthGrid(month), [month]);

  useEffect(() => {
    if (!user || !id) return;
    let live = true;
    setRows(null);
    (async () => {
      const from = zonedToIso(`${weeks[0][0]}T00:00`, tz);
      const to = zonedToIso(`${weeks[5][6]}T23:59`, tz);
      const who = kind === "staff"
        ? await supabase.from("caregivers").select("name").eq("id", id).maybeSingle()
        : await supabase.from("clients").select("first_name,last_name").eq("id", id).maybeSingle();
      const join = kind === "staff" ? "who:shift_workers!inner(caregiver_id)" : "who:shift_clients!inner(client_id)";
      const res = await supabase
        .from("shifts")
        .select(`id, date, start_time, end_time, status, is_sleepover, shift_type_id, ${join}, shift_clients(clients(first_name,last_name)), shift_workers(caregivers(name))`)
        .eq(kind === "staff" ? "who.caregiver_id" : "who.client_id", id)
        .eq("deleted", false)
        .gte("start_time", from)
        .lte("start_time", to)
        .order("start_time");
      if (!live) return;
      if (res.error) { setError(res.error.message); return; }
      const w: any = who.data;
      setName(kind === "staff" ? w?.name ?? "Staff member" : w ? `${w.first_name} ${w.last_name}` : "Client");
      setRows((res.data ?? []).map((s: any) => {
        const others = kind === "staff"
          ? (s.shift_clients ?? []).map((c: any) => `${c.clients?.first_name ?? ""} ${c.clients?.last_name ?? ""}`.trim())
          : (s.shift_workers ?? []).map((x: any) => x.caregivers?.name).filter(Boolean);
        return {
          id: s.id, start: s.start_time, end: s.end_time, date: s.date, status: s.status,
          label: others.join(", ") || (kind === "client" ? "Staff to be confirmed" : "Client"),
          typeId: s.shift_type_id, sleepover: !!s.is_sleepover, cancelled: s.status === "Cancelled",
        };
      }));
    })().catch((e) => live && setError(String(e?.message ?? e)));
    return () => { live = false; };
  }, [user, id, kind, weeks, tz]);

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return m;
  }, [rows]);
  const totalHours = (rows ?? []).filter((r) => !r.cancelled && r.date.slice(0, 7) === month.slice(0, 7))
    .reduce((a, r) => a + (new Date(r.end).getTime() - new Date(r.start).getTime()) / 3_600_000, 0);
  const go = (n: number) => router.replace(`/print/calendar?kind=${kind}&id=${id}&month=${addMonths(month, n).slice(0, 7)}`);
  const back = kind === "staff" ? `/dashboard/caregivers/${id}` : `/dashboard/clients/${id}`;

  if (!id) return <p className="p-8 text-sm">Choose a staff member or client first.</p>;

  return (
    <div className="min-h-screen bg-background p-4 text-foreground print:bg-white print:p-0 print:text-black sm:p-8">
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild><Link href={back}><ArrowLeft className="mr-1 h-4 w-4" />Back</Link></Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button onClick={() => window.print()} disabled={!rows}><Printer className="mr-1.5 h-4 w-4" />Print</Button>
        </div>
      </div>

      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground print:text-gray-500">{org.name} · {kind === "staff" ? "Staff roster" : "Client schedule"}</p>
          <h1 className="text-2xl font-bold">{name || " "}</h1>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{monthLabel(month)}</p>
          <p className="text-xs text-muted-foreground print:text-gray-500">{rows ? `${totalHours.toFixed(1)} hours booked` : "Loading..."}</p>
        </div>
      </header>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-xs print:min-w-0">
          <thead>
            <tr>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <th key={d} className="border bg-muted/60 px-1 py-1 font-semibold print:bg-gray-100">{d}</th>)}</tr>
          </thead>
          <tbody>
            {weeks.map((wk) => (
              <tr key={wk[0]}>
                {wk.map((d) => {
                  const inMonth = d.slice(0, 7) === month.slice(0, 7);
                  return (
                    <td key={d} className={cn("h-24 border p-1 align-top", !inMonth && "bg-muted/30 text-muted-foreground print:bg-gray-50", d === today && "ring-2 ring-inset ring-primary print:ring-0")}>
                      <div className="mb-0.5 text-right text-[11px] font-semibold">{dayLabel(d).day}</div>
                      <div className="space-y-0.5">
                        {(byDay.get(d) ?? []).map((r) => {
                          const t = resolveShiftType({ shiftTypeId: r.typeId, isSleepover: r.sleepover }, types);
                          return (
                            <div key={r.id} className={cn("break-inside-avoid rounded border-l-[3px] bg-muted/40 px-1 py-0.5 leading-tight print:bg-white", r.cancelled && "line-through opacity-50")} style={{ borderLeftColor: t.colour }}>
                              <span className="font-semibold tabular-nums">{formatTime(r.start, tz)}-{formatTime(r.end, tz)}</span>
                              <span className="block truncate">{r.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {types.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground print:text-gray-600">
          {types.map((t) => <span key={t.id} className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: t.colour }} />{t.name}</span>)}
          <span className="ml-auto">Printed {isoToZonedInput(new Date(), tz).replace("T", " ")}</span>
        </div>
      )}
    </div>
  );
}
