"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useCatalog } from "@/hooks/use-catalog";
import { useClients } from "@/hooks/use-clients";
import { useCaregivers } from "@/hooks/use-caregivers";
import { minWorkers, occurrenceDates, ratioCapacity } from "@/lib/recurrence";
import { parseRpcError, shiftRpc, type ShiftBlock } from "@/lib/shift-rpc";
import { money } from "@/lib/format";

const WEEKDAYS = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"],
] as const;

const PRESETS: { label: string; block: ShiftBlock }[] = [
  { label: "Morning 06:00-14:00", block: { start_time: "06:00", end_time: "14:00" } },
  { label: "Afternoon 14:00-22:00", block: { start_time: "14:00", end_time: "22:00" } },
  { label: "Sleepover 22:00-06:00", block: { start_time: "22:00", end_time: "06:00", is_sleepover: true } },
  { label: "Active night 22:00-06:00", block: { start_time: "22:00", end_time: "06:00" } },
];

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaults?: { clientIds?: string[]; workerIds?: string[]; date?: string };
};

export default function CreateShiftsDialog({ isOpen, onClose, onCreated, defaults }: Props) {
  const { toast } = useToast();
  const { clients } = useClients();
  const { caregivers } = useCaregivers();
  const { families, items, sites } = useCatalog();

  const today = new Date().toISOString().slice(0, 10);
  const [clientIds, setClientIds] = useState<string[]>(defaults?.clientIds ?? []);
  const [workerIds, setWorkerIds] = useState<string[]>(defaults?.workerIds ?? []);
  const [clientFilter, setClientFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [siteId, setSiteId] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [family, setFamily] = useState("");
  const [date, setDate] = useState(defaults?.date ?? today);
  const [blocks, setBlocks] = useState<ShiftBlock[]>([{ ...PRESETS[0].block }]);
  const [freq, setFreq] = useState<"none" | "daily" | "weekly">("none");
  const [interval, setIntervalN] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [endMode, setEndMode] = useState<"until" | "count">("count");
  const [until, setUntil] = useState("");
  const [count, setCount] = useState(8);
  const [geofence, setGeofence] = useState<"default" | "yes" | "no">("default");
  const [skipConflicts, setSkipConflicts] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rule = useMemo(
    () => ({
      freq, interval, weekdays: freq === "weekly" ? weekdays : undefined,
      until: endMode === "until" && until ? until : endMode === "count" ? undefined : undefined,
      count: endMode === "count" ? count : undefined,
    }),
    [freq, interval, weekdays, endMode, until, count]
  );
  // A count with no end date needs a horizon for the preview; the database applies the same 90-day default.
  const dates = useMemo(() => occurrenceDates(date, rule), [date, rule]);
  const totalShifts = dates.length * blocks.length;

  const needed = minWorkers(ratio, Math.max(clientIds.length, 1));
  const ratioProblem =
    clientIds.length > ratioCapacity(ratio) * Math.max(workerIds.length, 1)
      ? `${clientIds.length} participants at ${ratio} need at least ${needed} worker${needed > 1 ? "s" : ""} (or a wider ratio).`
      : null;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const visibleItems = (b: ShiftBlock) => {
    const fam = b.support_family || family;
    return items.filter((i) => !fam || i.familyKey === fam);
  };

  const updateBlock = (i: number, patch: Partial<ShiftBlock>) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  async function submit() {
    setError(null);
    if (clientIds.length === 0) return setError("Choose at least one participant.");
    if (blocks.some((b) => !b.start_time || !b.end_time)) return setError("Every shift needs a start and end time.");
    if (ratioProblem) return setError(ratioProblem);
    if (freq === "weekly" && weekdays.length === 0) return setError("Pick at least one day of the week.");
    if (dates.length === 0) return setError("That repeat rule produces no dates. Check the end date.");
    if (!family && blocks.some((b) => !b.item_number && !b.support_family)) {
      if (!window.confirm("Some shifts have no support family or cost code, so they cannot be priced yet. Create them anyway?")) return;
    }
    setBusy(true);
    try {
      const res = await shiftRpc.create({
        client_ids: clientIds, worker_ids: workerIds, site_id: siteId || null, ratio, support_family: family || null,
        date, blocks, geofence_required: geofence === "default" ? null : geofence === "yes", notes: notes || undefined,
        skip_conflicts: skipConflicts,
        repeat: { freq, interval, weekdays: freq === "weekly" ? weekdays : undefined,
                  until: endMode === "until" ? until || undefined : undefined, count: endMode === "count" ? count : undefined },
      });
      toast({
        title: `${res.shift_ids.length} shift${res.shift_ids.length === 1 ? "" : "s"} created`,
        description: res.skipped.length ? `${res.skipped.length} skipped because a worker was already booked.` : undefined,
      });
      onCreated?.();
      onClose();
    } catch (e) {
      setError(parseRpcError(e).message);
    } finally {
      setBusy(false);
    }
  }

  const filteredClients = clients.filter((c) => c.fullName.toLowerCase().includes(clientFilter.toLowerCase()));
  const filteredWorkers = caregivers.filter((c) => c.name.toLowerCase().includes(workerFilter.toLowerCase()));

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New shifts</DialogTitle>
          <DialogDescription>
            Create one or many shifts at once: several time blocks a day, repeating, for one or more participants and workers.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-2">
              <Label>Participants ({clientIds.length})</Label>
              <Input placeholder="Search participants" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} />
              <ScrollArea className="h-40 rounded-md border p-2">
                {filteredClients.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                    <Checkbox checked={clientIds.includes(c.id)} onCheckedChange={() => toggle(clientIds, setClientIds, c.id)} />
                    {c.fullName}
                  </label>
                ))}
              </ScrollArea>
            </section>
            <section className="space-y-2">
              <Label>Support workers ({workerIds.length}) <span className="font-normal text-muted-foreground">leave empty to offer later</span></Label>
              <Input placeholder="Search workers" value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} />
              <ScrollArea className="h-40 rounded-md border p-2">
                {filteredWorkers.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                    <Checkbox checked={workerIds.includes(c.id)} onCheckedChange={() => toggle(workerIds, setWorkerIds, c.id)} />
                    {c.name}
                  </label>
                ))}
              </ScrollArea>
            </section>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Ratio (workers : participants)</Label>
              <select className={selectCls} value={ratio} onChange={(e) => setRatio(e.target.value)}>
                {["1:1", "1:2", "1:3", "1:4", "1:5"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <Label>Site / house (optional)</Label>
              <select className={selectCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">At the participant's address</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Support family (price guide)</Label>
              <select className={selectCls} value={family} onChange={(e) => setFamily(e.target.value)}>
                <option value="">None - choose a cost code per shift</option>
                {families.map((f) => <option key={f.familyKey} value={f.familyKey}>{f.label}</option>)}
              </select>
            </div>
          </div>
          {ratioProblem && <p className="text-sm text-amber-700">{ratioProblem}</p>}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Shifts each day</Label>
              <div className="flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <Button key={p.label} type="button" size="sm" variant="outline" onClick={() => setBlocks((b) => [...b, { ...p.block }])}>
                    <Plus className="mr-1 h-3 w-3" />{p.label}
                  </Button>
                ))}
              </div>
            </div>
            {blocks.map((b, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 md:grid-cols-12">
                <div className="md:col-span-2"><Label className="text-xs">Start</Label><Input type="time" value={b.start_time} onChange={(e) => updateBlock(i, { start_time: e.target.value })} /></div>
                <div className="md:col-span-2"><Label className="text-xs">End</Label><Input type="time" value={b.end_time} onChange={(e) => updateBlock(i, { end_time: e.target.value })} /></div>
                <div className="md:col-span-5">
                  <Label className="text-xs">Cost code (price guide)</Label>
                  <select className={selectCls} value={b.item_number ?? ""} onChange={(e) => updateBlock(i, { item_number: e.target.value || null })}>
                    <option value="">Automatic by time of day</option>
                    {visibleItems(b).map((it) => (
                      <option key={it.itemNumber} value={it.itemNumber}>{it.itemNumber} - {it.name} ({money(it.priceNational)}/{it.unit.toLowerCase()})</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm md:col-span-2">
                  <Checkbox checked={!!b.is_sleepover} onCheckedChange={(v) => updateBlock(i, { is_sleepover: !!v })} /> Sleepover
                </label>
                <div className="flex items-end justify-end md:col-span-1">
                  <Button type="button" size="icon" variant="ghost" disabled={blocks.length === 1} onClick={() => setBlocks((bs) => bs.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {b.end_time && b.start_time && b.end_time <= b.start_time && (
                  <p className="text-xs text-muted-foreground md:col-span-12">Ends the next day.</p>
                )}
              </div>
            ))}
          </section>

          <section className="grid gap-4 rounded-md border p-3 sm:grid-cols-4">
            <div><Label>First date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div>
              <Label>Repeat</Label>
              <select className={selectCls} value={freq} onChange={(e) => setFreq(e.target.value as any)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            {freq !== "none" && (
              <>
                <div><Label>Every</Label><Input type="number" min={1} max={12} value={interval} onChange={(e) => setIntervalN(Math.max(1, Number(e.target.value) || 1))} /></div>
                <div>
                  <Label>Ends</Label>
                  <select className={selectCls} value={endMode} onChange={(e) => setEndMode(e.target.value as any)}>
                    <option value="count">After a number of days</option>
                    <option value="until">On a date</option>
                  </select>
                </div>
                {freq === "weekly" && (
                  <div className="flex flex-wrap gap-1 sm:col-span-4">
                    {WEEKDAYS.map(([n, label]) => (
                      <Button key={n} type="button" size="sm" variant={weekdays.includes(n) ? "default" : "outline"} onClick={() => toggle(weekdays.map(String), (v) => setWeekdays(v.map(Number)), String(n))}>
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="sm:col-span-2">
                  {endMode === "count"
                    ? <><Label>Number of days</Label><Input type="number" min={1} max={366} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} /></>
                    : <><Label>Last date</Label><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></>}
                </div>
              </>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Arrival check (location)</Label>
              <select className={selectCls} value={geofence} onChange={(e) => setGeofence(e.target.value as any)}>
                <option value="default">Use organisation setting</option>
                <option value="yes">Worker must be at the address to start</option>
                <option value="no">Do not check location</option>
              </select>
            </div>
            <div><Label>Notes for the worker</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={skipConflicts} onCheckedChange={(v) => setSkipConflicts(!!v)} />
            If a worker is already booked, skip that day instead of stopping
          </label>

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Badge variant="secondary">{totalShifts} shift{totalShifts === 1 ? "" : "s"} will be created</Badge>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Creating..." : "Create shifts"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
