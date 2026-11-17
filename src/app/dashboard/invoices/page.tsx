"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, FilePlus2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { money } from "@/lib/format";
import { parseRpcError } from "@/lib/shift-rpc";
import { supabase } from "@/lib/supabase/client";

type Inv = {
  id: string; number: string; status: string; period_start: string; period_end: string; issue_date: string; due_date: string;
  subtotal: number; gst_amount: number; total: number; exported_at: string | null; void_reason: string | null;
  clients: { first_name: string; last_name: string } | null;
};
type Line = { id: string; description: string; quantity: number; unit_price: number; amount: number };

const TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700", approved: "bg-blue-100 text-blue-800", sent: "bg-indigo-100 text-indigo-800",
  paid: "bg-emerald-100 text-emerald-800", void: "bg-red-100 text-red-800",
};

function monthRange() {
  const d = new Date();
  const first = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0)).toISOString().slice(0, 10);
  return [first, last];
}

export default function InvoicesPage() {
  const { toast } = useToast();
  const [range, setRange] = useState(monthRange);
  const [rows, setRows] = useState<Inv[]>([]);
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("invoices").select("*, clients(first_name,last_name)").order("created_at", { ascending: false }).limit(300);
    if (error) toast({ title: "Could not load invoices", description: error.message, variant: "destructive" });
    setRows((data ?? []) as unknown as Inv[]);
    setLoading(false);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); toast({ title: label }); await load(); }
    catch (e) { toast({ title: "Could not do that", description: parseRpcError(e).message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };

  const generate = () => run("Invoices generated", async () => {
    const ids = (await rpc("generate_invoices", { p_from: range[0], p_to: range[1] })) as string[];
    if (!ids.length) throw new Error("nothing: no approved, un-invoiced shifts in that range. Approve shifts first.");
    toast({ title: `${ids.length} draft invoice${ids.length === 1 ? "" : "s"} created` });
  });

  async function toggleOpen(id: string) {
    setOpen(open === id ? null : id);
    if (!lines[id]) {
      const { data } = await supabase.from("invoice_lines").select("id,description,quantity,unit_price,amount").eq("invoice_id", id).order("description");
      setLines((l) => ({ ...l, [id]: (data ?? []) as Line[] }));
    }
  }

  async function exportXero() {
    const ids = [...picked];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch(`/api/invoices/export?ids=${ids.join(",")}`, { headers: { Authorization: `Bearer ${s.session?.access_token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Export failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: `carehub-xero-invoices-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ title: "Xero file downloaded", description: "In Xero: Business > Invoices > Import. Draft invoices must be approved here first." });
      setPicked(new Set());
      await load();
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  }

  const totals = useMemo(() => rows.filter((r) => r.status !== "void").reduce((a, r) => a + Number(r.total), 0), [rows]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Built from approved shifts, one invoice per participant. Export to Xero as a CSV import.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">From</Label><Input type="date" value={range[0]} onChange={(e) => setRange([e.target.value, range[1]])} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={range[1]} onChange={(e) => setRange([range[0], e.target.value])} /></div>
          <Button onClick={generate} disabled={busy}><FilePlus2 className="mr-1 h-4 w-4" />Generate invoices</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>All invoices</CardTitle>
            <CardDescription>{rows.length} invoices, {money(totals)} excluding void</CardDescription>
          </div>
          <Button variant="outline" disabled={picked.size === 0 || busy} onClick={exportXero}>
            <Download className="mr-1 h-4 w-4" />Export {picked.size || ""} to Xero (CSV)
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" /><TableHead className="w-8" />
                <TableHead>Number</TableHead><TableHead>Participant</TableHead><TableHead>Period</TableHead>
                <TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">No invoices yet. Approve shifts, then generate.</TableCell></TableRow>}
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <TableRow>
                    <TableCell>{["approved", "sent", "paid"].includes(r.status) && <Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label="Select invoice" />}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => toggleOpen(r.id)}>{open === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button></TableCell>
                    <TableCell className="font-medium">{r.number}</TableCell>
                    <TableCell>{r.clients?.first_name} {r.clients?.last_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.period_start} to {r.period_end}</TableCell>
                    <TableCell>{r.due_date}</TableCell>
                    <TableCell>
                      <Badge className={TONE[r.status]} variant="secondary">{r.status}</Badge>
                      {r.exported_at && <span className="ml-1 text-xs text-muted-foreground">exported</span>}
                    </TableCell>
                    <TableCell className="text-right">{money(r.total)}</TableCell>
                    <TableCell className="space-x-1 whitespace-nowrap text-right">
                      {r.status === "draft" && <Button size="sm" disabled={busy} onClick={() => run("Invoice approved", () => rpc("set_invoice_status", { p_id: r.id, p_status: "approved" }))}>Approve</Button>}
                      {r.status === "approved" && <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Marked as sent", () => rpc("set_invoice_status", { p_id: r.id, p_status: "sent" }))}>Mark sent</Button>}
                      {["approved", "sent"].includes(r.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => run("Marked as paid", () => rpc("set_invoice_status", { p_id: r.id, p_status: "paid" }))}>Mark paid</Button>}
                      {["draft", "approved", "sent"].includes(r.status) && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
                          const reason = window.prompt("Why is this invoice being voided? Its shifts become available to invoice again.");
                          if (reason) void run("Invoice voided", () => rpc("void_invoice", { p_id: r.id, p_reason: reason }));
                        }}>Void</Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {open === r.id && (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={8}>
                        <div className="space-y-1 py-1 text-sm">
                          {(lines[r.id] ?? []).map((l) => (
                            <div key={l.id} className="flex justify-between"><span>{l.description}</span><span>{Number(l.quantity)} x {money(l.unit_price)} = {money(l.amount)}</span></div>
                          ))}
                          {Number(r.gst_amount) > 0 && <div className="flex justify-between text-muted-foreground"><span>GST</span><span>{money(r.gst_amount)}</span></div>}
                          {r.void_reason && <div className="text-red-700">Voided: {r.void_reason}</div>}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
