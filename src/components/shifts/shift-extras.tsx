"use client";

/**
 * Sections of the shift drawer for the newer shift features: attachments on the instructions,
 * extra billable charges, trips, sign-off signatures, correcting progress notes, and per-staff times.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Car, FileText, Image as ImageIcon, Paperclip, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";
import { formatTime, formatWhen, isoToZonedInput, money, zonedToIso } from "@/lib/format";
import { TRIP_KINDS, parseRpcError, shiftRpc } from "@/lib/shift-rpc";
import { cn } from "@/lib/utils";

const BUCKET = "shift-files";
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

function useLive<T>(table: string, shiftId: string, fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(async () => setData(await fetcher()), [fetcher]);
  useEffect(() => {
    let live = true;
    fetcher().then((d) => live && setData(d)).catch(() => live && setData(null));
    const off = subscribeToTable(table, () => void fetcher().then((d) => live && setData(d)), { filter: `shift_id=eq.${shiftId}` });
    return () => { live = false; off(); };
  }, [table, shiftId, fetcher]);
  return { data, reload };
}

function useRun() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (label: string | null, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      if (label) toast({ title: label });
      return true;
    } catch (e) {
      toast({ title: "Could not do that", description: parseRpcError(e).message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/* ------------------------------------------------------------------------------------------------
 * Attachments
 * ---------------------------------------------------------------------------------------------- */
export function ShiftAttachments({ shiftId, editable }: { shiftId: string; editable: boolean }) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const { busy, run } = useRun();
  const fetcher = useCallback(async () => {
    const { data } = await supabase.from("shift_attachments").select("*").eq("shift_id", shiftId).order("created_at");
    return (data ?? []) as any[];
  }, [shiftId]);
  const { data: files, reload } = useLive("shift_attachments", shiftId, fetcher);

  async function upload(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    for (const f of picked) {
      if (f.size > MAX_BYTES) { toast({ title: `${f.name} is too big`, description: "Files can be up to 15 MB.", variant: "destructive" }); continue; }
      if (f.type.startsWith("video/")) { toast({ title: "Videos cannot be attached", description: "Attach images or documents.", variant: "destructive" }); continue; }
      const safe = f.name.replace(/[^\w.() -]+/g, "_").slice(-120);
      const path = `${shiftId}/${crypto.randomUUID()}-${safe}`;
      await run(`${f.name} attached`, async () => {
        const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || "application/octet-stream" });
        if (up.error) throw up.error;
        const ins = await supabase.from("shift_attachments").insert({ shift_id: shiftId, path, name: f.name.slice(0, 200), size_bytes: f.size, mime: f.type || "application/octet-stream" });
        if (ins.error) { await supabase.storage.from(BUCKET).remove([path]); throw ins.error; }
      });
    }
    await reload();
  }

  async function open(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) return toast({ title: "Could not open the file", description: error?.message, variant: "destructive" });
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const remove = (f: any) => run("Attachment removed", async () => {
    const del = await supabase.from("shift_attachments").delete().eq("id", f.id);
    if (del.error) throw del.error;
    await supabase.storage.from(BUCKET).remove([f.path]);
    await reload();
  });

  if (!files) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs"><Paperclip className="h-3.5 w-3.5" />Attachments ({files.length})</Label>
        {editable && (
          <>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Attach files" onChange={(e) => void upload(e.target.files)} />
            <Button type="button" size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => input.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" />Attach</Button>
          </>
        )}
      </div>
      {files.length === 0 && <p className="text-xs text-muted-foreground">{editable ? "Attach care plans, maps or photos (images and documents up to 15 MB). Staff open them in the app." : "No attachments."}</p>}
      <ul className="space-y-1">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm">
            {f.mime.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => void open(f.path)} title={`Open ${f.name}`}>{f.name}</button>
            <span className="shrink-0 text-xs text-muted-foreground">{fileSize(f.size_bytes)}</span>
            {editable && (
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => void remove(f)}><Trash2 className="h-3.5 w-3.5" /></Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Extra billable charges
 * ---------------------------------------------------------------------------------------------- */
export function ShiftCharges({
  shiftId, clients, items, editable, onTotal,
}: {
  shiftId: string;
  clients: { id: string; name: string }[];
  items: { itemNumber: string; name: string; priceNational: number }[];
  editable: boolean;
  onTotal?: (n: number) => void;
}) {
  const { busy, run } = useRun();
  const fetcher = useCallback(async () => {
    const { data } = await supabase.from("shift_charges").select("*, support_items(name)").eq("shift_id", shiftId).order("created_at");
    return (data ?? []) as any[];
  }, [shiftId]);
  const { data: rows, reload } = useLive("shift_charges", shiftId, fetcher);
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");
  const [forClients, setForClients] = useState<string[]>([]);

  const total = (rows ?? []).reduce((a, r) => a + Number(r.quantity) * Number(r.unit_price), 0);
  useEffect(() => { onTotal?.(total); }, [total, onTotal]);

  const itemNumber = item.split(" ")[0];
  const found = items.find((i) => i.itemNumber === itemNumber);
  const targets = forClients.length ? forClients : clients.length === 1 ? [clients[0].id] : [];
  const reset = () => { setItem(""); setQty("1"); setPrice(""); setDesc(""); setForClients([]); setOpen(false); };
  const add = () => run(targets.length > 1 ? `Charge added for ${targets.length} clients` : "Charge added", async () => {
    await shiftRpc.addCharge(shiftId, targets, itemNumber, Number(qty), desc.trim() || null, price === "" ? null : Number(price));
    reset();
    await reload();
  });
  const name = (id: string) => clients.find((c) => c.id === id)?.name ?? "Client";

  if (!rows) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Additional charges</h3>
        {editable && !open && <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" />Add charge</Button>}
      </div>
      {rows.length === 0 && !open && <p className="text-sm text-muted-foreground">None. Add equipment hire or a one-off service; it is billed to the client but adds no hours or pay.</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
          <span className="min-w-0">
            {r.description || r.support_items?.name} <span className="text-muted-foreground">{r.item_number}</span>
            {clients.length > 1 && <span className="block text-xs text-muted-foreground">{name(r.client_id)}</span>}
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            {Number(r.quantity)} x {money(r.unit_price)} = {money(Number(r.quantity) * Number(r.unit_price))}
            {r.invoice_line_id ? <span className="ml-1 text-xs text-muted-foreground">invoiced</span> : editable && (
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove charge" disabled={busy} onClick={() => void run("Charge removed", async () => { await shiftRpc.removeCharge(r.id); await reload(); })}><Trash2 className="h-3.5 w-3.5" /></Button>
            )}
          </span>
        </div>
      ))}
      {open && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div>
            <Label className="text-xs" htmlFor="charge-item">Price guide item</Label>
            <Input id="charge-item" list="charge-items" placeholder="Search by number or name" value={item}
              onChange={(e) => { setItem(e.target.value); const it = items.find((i) => i.itemNumber === e.target.value.split(" ")[0]); if (it && price === "") setPrice(String(it.priceNational)); }} />
            <datalist id="charge-items">{items.map((i) => <option key={i.itemNumber} value={`${i.itemNumber} ${i.name}`} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs" htmlFor="charge-qty">Quantity</Label><Input id="charge-qty" type="number" min={0.01} step={0.25} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><Label className="text-xs" htmlFor="charge-price">Unit price ($)</Label><Input id="charge-price" type="number" min={0} step={0.01} placeholder={found ? String(found.priceNational) : "Price guide"} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs" htmlFor="charge-desc">Description on the invoice (optional)</Label><Input id="charge-desc" maxLength={200} placeholder="e.g. Equipment hire" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          {clients.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Bill to</Label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={forClients.length === clients.length} onCheckedChange={(v) => setForClients(v ? clients.map((c) => c.id) : [])} />Every client on the shift
              </label>
              {clients.map((c) => (
                <label key={c.id} className="flex items-center gap-2 pl-4 text-sm">
                  <Checkbox checked={forClients.includes(c.id)} onCheckedChange={(v) => setForClients(v ? [...forClients, c.id] : forClients.filter((x) => x !== c.id))} />{c.name}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !found || !(Number(qty) > 0) || targets.length === 0} onClick={() => void add()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
      {rows.length > 0 && <p className="text-right text-xs text-muted-foreground">Charges total {money(total)}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Trips
 * ---------------------------------------------------------------------------------------------- */
export function ShiftTrips({ shiftId, tz, editable }: { shiftId: string; tz: string; editable: boolean }) {
  const { busy, run } = useRun();
  const fetcher = useCallback(async () => {
    const { data } = await supabase.from("mileage").select("*, caregivers(name)").eq("shift_id", shiftId).order("created_at");
    return (data ?? []) as any[];
  }, [shiftId]);
  const { data: rows, reload } = useLive("mileage", shiftId, fetcher);
  if (!rows) return <p className="text-sm text-muted-foreground">Loading...</p>;
  const total = rows.reduce((a, r) => a + Number(r.distance), 0);
  const groups = [...TRIP_KINDS, { value: null, label: "Other travel" }].map((k) => ({ ...k, trips: rows.filter((r) => (r.trip_kind ?? null) === k.value) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border p-3">
        <span className="flex items-center gap-2 text-sm font-medium"><Car className="h-4 w-4" />{rows.length} trip{rows.length === 1 ? "" : "s"}</span>
        <span className="text-lg font-semibold tabular-nums">{total.toFixed(1)} km</span>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No trips yet. Staff log travel to the shift, during it and home from the app.</p>}
      {groups.filter((g) => g.trips.length).map((g) => (
        <section key={g.label} className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
          {g.trips.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular-nums">{Number(r.distance).toFixed(1)} {r.unit ?? "km"}{r.purpose ? ` · ${r.purpose}` : ""}</p>
                <p className="text-xs text-muted-foreground">
                  {r.caregivers?.name ?? "Staff"} · {formatWhen(r.created_at, tz)} · {r.odometer_start != null ? `Odometer ${Number(r.odometer_start)} to ${Number(r.odometer_end)}` : "Entered distance"}
                  {r.vehicle_type ? ` · ${r.vehicle_type}` : ""}
                </p>
              </div>
              {editable && (
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Remove trip" disabled={busy} onClick={() => window.confirm("Remove this trip?") && void run("Trip removed", async () => { await shiftRpc.deleteTrip(r.id); await reload(); })}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Signatures
 * ---------------------------------------------------------------------------------------------- */
export function ShiftSignatures({ shiftId, tz, required }: { shiftId: string; tz: string; required: { client: boolean; worker: boolean } }) {
  const fetcher = useCallback(async () => {
    const { data } = await supabase.from("shift_signatures").select("*, caregivers(name)").eq("shift_id", shiftId).order("signed_at");
    return (data ?? []) as any[];
  }, [shiftId]);
  const { data: rows } = useLive("shift_signatures", shiftId, fetcher);
  if (!rows || (!rows.length && !required.client && !required.worker)) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Signatures</h3>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Waiting for {[required.client && "the client", required.worker && "staff"].filter(Boolean).join(" and ")} to sign when the shift ends.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((s) => (
          <figure key={s.id} className="rounded-md border bg-card p-2">
            <svg viewBox={`0 0 ${s.width} ${s.height}`} className="h-24 w-full rounded bg-white" role="img" aria-label={`Signature of ${s.signer_name}`}>
              <path d={s.strokes} fill="none" stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <figcaption className="mt-1 text-xs">
              <span className="font-medium">{s.signer_name}</span> · {s.signer === "client" ? "client" : "staff"}
              <span className="block text-muted-foreground">Collected by {s.caregivers?.name ?? "staff"} · {formatWhen(s.signed_at, tz)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Progress note with correction
 * ---------------------------------------------------------------------------------------------- */
export function ProgressNote({ note, tz, editors, lockedReason, onSaved }: {
  note: any; tz: string; editors: Map<string, string>; lockedReason: string | null; onSaved: () => void;
}) {
  const { busy, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.note);
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div className="rounded-md bg-muted/50 p-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
        <span>{note.caregivers?.name} about {note.clients?.first_name} {note.clients?.last_name} | {note.category}</span>
        <span className="flex items-center gap-1">
          {formatWhen(note.timestamp, tz)}{note.follow_up ? " | follow up" : ""}
          {!editing && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={!!lockedReason} title={lockedReason ?? "Correct this note"}
              onClick={() => { setText(note.note); setEditing(true); }}>
              <Pencil className="mr-1 h-3 w-3" />Edit
            </Button>
          )}
        </span>
      </div>
      {editing ? (
        <div className="mt-1 space-y-2">
          <Textarea aria-label="Corrected note" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-xs text-muted-foreground">The original wording is kept. Invoices that have not been sent show the corrected note.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !text.trim() || text.trim() === note.note} onClick={() => void run("Note corrected", async () => { await shiftRpc.editNote(note.id, text); setEditing(false); onSaved(); })}>Save correction</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap">{note.note}</p>
      )}
      {note.edited_at && !editing && (
        <p className="mt-1 text-xs text-muted-foreground">
          Corrected {formatWhen(note.edited_at, tz)}{note.edited_by ? ` by ${editors.get(note.edited_by) ?? "office"}` : ""}.{" "}
          {note.original_note && <button type="button" className="underline" onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? "Hide" : "Show"} original</button>}
        </p>
      )}
      {showOriginal && note.original_note && <p className="mt-1 whitespace-pre-wrap rounded border border-dashed p-1.5 text-xs text-muted-foreground">{note.original_note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Per-staff times on a group shift
 * ---------------------------------------------------------------------------------------------- */
export function WorkerTimes({ shift, worker, tz, step, editable, onSaved }: {
  shift: any; worker: any; tz: string; step: number; editable: boolean; onSaved: () => void;
}) {
  const { busy, run } = useRun();
  const own = !!worker.planned_start;
  const startIso = worker.planned_start ?? shift.start_time;
  const endIso = worker.planned_end ?? shift.end_time;
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(isoToZonedInput(startIso, tz).slice(11, 16));
  const [end, setEnd] = useState(isoToZonedInput(endIso, tz).slice(11, 16));

  // Build full timestamps on the shift's day, rolling past midnight for overnight shifts.
  const toIso = (hhmm: string) => {
    const day = isoToZonedInput(shift.start_time, tz).slice(0, 10);
    let iso = zonedToIso(`${day}T${hhmm}`, tz);
    if (new Date(iso) < new Date(shift.start_time)) iso = new Date(new Date(iso).getTime() + 86_400_000).toISOString();
    return iso;
  };

  return (
    <div className="text-xs">
      {!open && (
        <p className={cn("flex flex-wrap items-center gap-1", own ? "font-medium text-primary" : "text-muted-foreground")}>
          {own ? `Own times ${formatTime(startIso, tz)}-${formatTime(endIso, tz)}` : "Works the whole shift"}
          {editable && <button type="button" className="underline" onClick={() => setOpen(true)}>{own ? "Change" : "Set own times"}</button>}
        </p>
      )}
      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2">
          <div><Label className="text-xs" htmlFor={`wt-s-${worker.caregiver_id}`}>Starts</Label><Input id={`wt-s-${worker.caregiver_id}`} type="time" step={step} className="h-8 w-28" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label className="text-xs" htmlFor={`wt-e-${worker.caregiver_id}`}>Finishes</Label><Input id={`wt-e-${worker.caregiver_id}`} type="time" step={step} className="h-8 w-28" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button size="sm" className="h-8" disabled={busy || !start || !end} onClick={() => void run("Staff times saved", async () => {
            const s = toIso(start);
            let e = toIso(end);
            if (new Date(e) <= new Date(s)) e = new Date(new Date(e).getTime() + 86_400_000).toISOString();
            await shiftRpc.setWorkerTimes(shift.id, worker.caregiver_id, s, e);
            setOpen(false);
            onSaved();
          })}>Save</Button>
          {own && <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => void run("Following the shift times", async () => { await shiftRpc.setWorkerTimes(shift.id, worker.caregiver_id, null, null); setOpen(false); onSaved(); })}>Use shift times</Button>}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>Cancel</Button>
          <p className="w-full text-muted-foreground">Must fall inside the shift. Pay and the clock-in window follow these times.</p>
        </div>
      )}
    </div>
  );
}
