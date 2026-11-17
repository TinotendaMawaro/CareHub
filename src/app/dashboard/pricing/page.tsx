"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, Plus, Upload } from "lucide-react";
import { parsePriceBook, type PriceBookParse } from "@/lib/price-book";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { money } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";

const BANDS = ["weekday_day", "weekday_evening", "weekday_night", "saturday", "sunday", "public_holiday", "any"];
const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Bulk price-book import: paste rows or upload the NDIS price limits CSV. Admin only (RLS enforces it too). */
function ImportPriceBookCard({ onDone }: { onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed: PriceBookParse | null = useMemo(() => (text.trim() ? parsePriceBook(text) : null), [text]);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast({ title: "File too large", description: "Keep imports under 10 MB.", variant: "destructive" });
    setText(await file.text());
  }

  async function runImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    try {
      const fam = await supabase.from("support_families").upsert(
        parsed.families.map((f) => ({ ...f, default_worker_level: "level_2" })),
        { onConflict: "family_key", ignoreDuplicates: true },
      );
      if (fam.error) throw fam.error;
      for (let i = 0; i < parsed.rows.length; i += 200) {
        const chunk = parsed.rows.slice(i, i + 200).map(({ family_label: _label, ...row }) => row);
        const { error } = await supabase.from("support_items").upsert(chunk, { onConflict: "item_number" });
        if (error) throw error;
      }
      toast({ title: `Imported ${parsed.rows.length} cost codes`, description: `${parsed.families.length} support families, ${parsed.skipped} rows skipped.` });
      setText("");
      await onDone();
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><FileUp className="h-4 w-4" />Import a price book</CardTitle>
        <CardDescription>
          Upload the NDIS Pricing Arrangements CSV, or paste rows with item number, name, unit and prices.
          Time of day, sleepover and support family are worked out from each item name. Existing item numbers are updated, nothing is deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input type="file" accept=".csv,.tsv,.txt" className="w-72" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="text-sm text-muted-foreground">or paste below</span>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="font-mono text-xs"
          placeholder={'01_002_0107_1_1,Assistance With Self-Care Activities - Standard - Weekday Night,Hour,$82.57,$115.60,$123.86'}
        />
        {parsed && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            {parsed.rows.length === 0 ? (
              <p className="text-muted-foreground">No cost codes recognised yet. Rows need an NDIS item number like 01_002_0107_1_1 and a price.</p>
            ) : (
              <>
                <p className="font-medium">{parsed.rows.length} cost codes across {parsed.families.length} families ready to import{parsed.skipped > 0 && `, ${parsed.skipped} rows skipped`}.</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {parsed.rows.slice(0, 5).map((r) => (
                    <li key={r.item_number} className="font-mono">{r.item_number} · {r.name} · {r.time_band}{r.is_sleepover ? " · sleepover" : ""} · {money(r.price_national)}/{r.unit.toLowerCase()}</li>
                  ))}
                  {parsed.rows.length > 5 && <li>…and {parsed.rows.length - 5} more</li>}
                </ul>
              </>
            )}
          </div>
        )}
        <Button onClick={runImport} disabled={busy || !parsed || parsed.rows.length === 0}>
          <Upload className="mr-1 h-4 w-4" />{busy ? "Importing..." : `Import${parsed?.rows.length ? ` ${parsed.rows.length} cost codes` : ""}`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PricingPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [item, setItem] = useState({ item_number: "", name: "", family_key: "", time_band: "weekday_day", ratio: "1:1", unit: "Hour", is_sleepover: false, price_national: "", price_remote: "", price_very_remote: "" });
  const [rate, setRate] = useState({ worker_level: "level_2", time_band: "weekday_day", hourly_rate: "", each_rate: "", effective_from: new Date().toISOString().slice(0, 10) });
  const [holiday, setHoliday] = useState({ date: "", state: "NSW", name: "" });
  const [family, setFamily] = useState({ family_key: "", label: "" });

  const load = useCallback(async () => {
    const [i, f, r, h] = await Promise.all([
      supabase.from("support_items").select("*").order("item_number"),
      supabase.from("support_families").select("*").order("label"),
      supabase.from("pay_rates").select("*").order("worker_level").order("effective_from", { ascending: false }),
      supabase.from("public_holidays").select("*").order("date", { ascending: false }).limit(100),
    ]);
    setItems(i.data ?? []); setFamilies(f.data ?? []); setRates(r.data ?? []); setHolidays(h.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fail = (title: string, message: string) => toast({ title, description: message, variant: "destructive" });
  const insert = async (table: string, row: Record<string, unknown>, ok: string) => {
    const { error } = await supabase.from(table).insert(row);
    if (error) return fail("Could not save", error.message);
    toast({ title: ok });
    await load();
    return true;
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.item_number} ${i.name} ${i.family_key}`.toLowerCase().includes(s)) : items;
  }, [items, q]);

  async function addItem() {
    const p = Number(item.price_national);
    if (!item.item_number.trim() || !item.name.trim() || !item.family_key || !(p >= 0) || item.price_national === "") return fail("Missing details", "Item number, name, family and a price are required.");
    const ok = await insert("support_items", {
      item_number: item.item_number.trim(), name: item.name.trim(), family_key: item.family_key, time_band: item.time_band, ratio: item.ratio,
      unit: item.unit, is_sleepover: item.is_sleepover, price_national: p,
      price_remote: item.price_remote === "" ? null : Number(item.price_remote), price_very_remote: item.price_very_remote === "" ? null : Number(item.price_very_remote),
    }, "Cost code added");
    if (ok) setItem({ ...item, item_number: "", name: "", price_national: "", price_remote: "", price_very_remote: "" });
  }

  async function toggleActive(i: any, active: boolean) {
    const { error } = await supabase.from("support_items").update({ active }).eq("item_number", i.item_number);
    if (error) return fail("Could not update", error.message);
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Pricing and pay</h1>
        <p className="text-sm text-muted-foreground">
          The price guide holds the cost codes a shift is billed under. Pick a cost code on a shift, or leave it automatic and the code is chosen from the support family and time of day.
          {!isAdmin && " Only administrators can change prices."}
        </p>
      </div>
      <Tabs defaultValue="items">
        <TabsList><TabsTrigger value="items">Cost codes</TabsTrigger><TabsTrigger value="rates">Worker pay rates</TabsTrigger><TabsTrigger value="holidays">Public holidays</TabsTrigger></TabsList>

        <TabsContent value="items" className="space-y-4">
          {isAdmin && <ImportPriceBookCard onDone={load} />}
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle className="text-base">Add a cost code</CardTitle><CardDescription>Copy the item number and prices from the current NDIS Pricing Arrangements and Price Limits.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-4">
                <div><Label>Item number</Label><Input value={item.item_number} onChange={(e) => setItem({ ...item, item_number: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Name</Label><Input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} /></div>
                <div>
                  <Label>Support family</Label>
                  <select className={selectCls} value={item.family_key} onChange={(e) => setItem({ ...item, family_key: e.target.value })}>
                    <option value="">Choose...</option>{families.map((f) => <option key={f.family_key} value={f.family_key}>{f.label}</option>)}
                  </select>
                </div>
                <div><Label>Time of day</Label><select className={selectCls} value={item.time_band} onChange={(e) => setItem({ ...item, time_band: e.target.value })}>{BANDS.map((b) => <option key={b}>{b}</option>)}</select></div>
                <div><Label>Ratio</Label><select className={selectCls} value={item.ratio} onChange={(e) => setItem({ ...item, ratio: e.target.value })}>{["1:1", "1:2", "1:3", "1:4", "1:5"].map((b) => <option key={b}>{b}</option>)}</select></div>
                <div><Label>Unit</Label><select className={selectCls} value={item.unit} onChange={(e) => setItem({ ...item, unit: e.target.value })}>{["Hour", "Each", "Day", "Week"].map((b) => <option key={b}>{b}</option>)}</select></div>
                <label className="flex items-end gap-2 pb-2 text-sm"><Switch checked={item.is_sleepover} onCheckedChange={(v) => setItem({ ...item, is_sleepover: v })} />Sleepover</label>
                <div><Label>Price</Label><Input type="number" step="0.01" value={item.price_national} onChange={(e) => setItem({ ...item, price_national: e.target.value })} /></div>
                <div><Label>Remote</Label><Input type="number" step="0.01" value={item.price_remote} onChange={(e) => setItem({ ...item, price_remote: e.target.value })} /></div>
                <div><Label>Very remote</Label><Input type="number" step="0.01" value={item.price_very_remote} onChange={(e) => setItem({ ...item, price_very_remote: e.target.value })} /></div>
                <div className="flex items-end"><Button onClick={addItem}><Plus className="mr-1 h-4 w-4" />Add</Button></div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{items.length} cost codes</CardTitle>
              <Input className="w-64" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Name</TableHead><TableHead>Family</TableHead><TableHead>Time</TableHead><TableHead>Ratio</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Active</TableHead></TableRow></TableHeader>
                <TableBody>
                  {shown.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No cost codes yet. Add your first one above.</TableCell></TableRow>}
                  {shown.map((i) => (
                    <TableRow key={i.item_number} className={i.active ? "" : "opacity-50"}>
                      <TableCell className="font-mono text-xs">{i.item_number}</TableCell>
                      <TableCell>{i.name} {i.is_sleepover && <Badge variant="outline">sleepover</Badge>}</TableCell>
                      <TableCell>{i.family_key}</TableCell><TableCell>{i.time_band}</TableCell><TableCell>{i.ratio}</TableCell>
                      <TableCell className="text-right">{money(i.price_national)}/{String(i.unit).toLowerCase()}</TableCell>
                      <TableCell className="text-right"><Switch disabled={!isAdmin} checked={i.active} onCheckedChange={(v) => void toggleActive(i, v)} aria-label="Active" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle className="text-base">Add a support family</CardTitle><CardDescription>Families group cost codes (for example "Community access" and "Supported independent living").</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div><Label>Key</Label><Input value={family.family_key} onChange={(e) => setFamily({ ...family, family_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="community_access" /></div>
                <div><Label>Label</Label><Input value={family.label} onChange={(e) => setFamily({ ...family, label: e.target.value })} /></div>
                <Button onClick={async () => { if (family.family_key && family.label && (await insert("support_families", { ...family, default_worker_level: "level_2" }, "Family added"))) setFamily({ family_key: "", label: "" }); }}>Add</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rates" className="space-y-4">
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle className="text-base">Add a pay rate</CardTitle><CardDescription>The newest rate on or before the shift date applies. Use time of day "any" for a sleepover (each) rate.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-6">
                <div><Label>Level</Label><Input value={rate.worker_level} onChange={(e) => setRate({ ...rate, worker_level: e.target.value })} /></div>
                <div><Label>Time of day</Label><select className={selectCls} value={rate.time_band} onChange={(e) => setRate({ ...rate, time_band: e.target.value })}>{BANDS.map((b) => <option key={b}>{b}</option>)}</select></div>
                <div><Label>Hourly</Label><Input type="number" step="0.01" value={rate.hourly_rate} onChange={(e) => setRate({ ...rate, hourly_rate: e.target.value })} /></div>
                <div><Label>Each (sleepover)</Label><Input type="number" step="0.01" value={rate.each_rate} onChange={(e) => setRate({ ...rate, each_rate: e.target.value })} /></div>
                <div><Label>From</Label><Input type="date" value={rate.effective_from} onChange={(e) => setRate({ ...rate, effective_from: e.target.value })} /></div>
                <div className="flex items-end"><Button onClick={() => rate.hourly_rate !== "" && insert("pay_rates", { ...rate, hourly_rate: Number(rate.hourly_rate), each_rate: rate.each_rate === "" ? null : Number(rate.each_rate) }, "Pay rate added")}>Add</Button></div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Time of day</TableHead><TableHead className="text-right">Hourly</TableHead><TableHead className="text-right">Each</TableHead><TableHead>From</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rates.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No pay rates yet. Without them, shift pay is calculated as $0.</TableCell></TableRow>}
                  {rates.map((r) => <TableRow key={r.id}><TableCell>{r.worker_level}</TableCell><TableCell>{r.time_band}</TableCell><TableCell className="text-right">{money(r.hourly_rate)}</TableCell><TableCell className="text-right">{r.each_rate != null ? money(r.each_rate) : ""}</TableCell><TableCell>{r.effective_from}</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Public holidays</CardTitle><CardDescription>Shifts on these dates use the public holiday cost code and pay rate. State "ALL" applies everywhere.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div><Label>Date</Label><Input type="date" value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} /></div>
                <div><Label>State</Label><Input className="w-24" value={holiday.state} onChange={(e) => setHoliday({ ...holiday, state: e.target.value.toUpperCase() })} /></div>
                <div><Label>Name</Label><Input value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} /></div>
                <Button onClick={async () => { if (holiday.date && holiday.name && (await insert("public_holidays", holiday, "Holiday added"))) setHoliday({ ...holiday, date: "", name: "" }); }}>Add</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>State</TableHead><TableHead>Name</TableHead></TableRow></TableHeader>
                <TableBody>{holidays.map((h) => <TableRow key={`${h.date}${h.state}`}><TableCell>{h.date}</TableCell><TableCell>{h.state}</TableCell><TableCell>{h.name}</TableCell></TableRow>)}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
