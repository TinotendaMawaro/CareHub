"use client";

import { useEffect, useState } from "react";
import { Archive, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useShiftTypes } from "@/hooks/use-shift-types";
import { useToast } from "@/hooks/use-toast";
import type { ShiftType } from "@/lib/types";

const PALETTE = ["#0EA5E9", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#64748B"];

/** Name and colour each kind of shift. Colours show as a tag on every shift in the calendar. */
export function ShiftTypesCard({ canEdit }: { canEdit: boolean }) {
  const { types, loading, save, archive, makeDefault } = useShiftTypes();
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, { name: string; colour: string }>>({});
  const [fresh, setFresh] = useState({ name: "", colour: PALETTE[(types.length) % PALETTE.length] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(Object.fromEntries(types.map((t) => [t.id, { name: t.name, colour: t.colour }])));
  }, [types]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast({ title: label }); }
    catch (e) { toast({ title: "Could not save", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const changed = (t: ShiftType) => rows[t.id] && (rows[t.id].name.trim() !== t.name || rows[t.id].colour.toUpperCase() !== t.colour.toUpperCase());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift types</CardTitle>
        <CardDescription>
          Each type has a colour that shows as a small tag on the calendar, so you can tell care, community and sleepover shifts apart at a glance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {types.map((t) => {
          const r = rows[t.id] ?? { name: t.name, colour: t.colour };
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <input
                type="color"
                aria-label={`Colour for ${t.name}`}
                disabled={!canEdit || busy}
                value={r.colour}
                onChange={(e) => setRows({ ...rows, [t.id]: { ...r, colour: e.target.value } })}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed"
              />
              <Input
                aria-label="Type name"
                disabled={!canEdit || busy}
                value={r.name}
                maxLength={40}
                onChange={(e) => setRows({ ...rows, [t.id]: { ...r, name: e.target.value } })}
                className="h-9 min-w-[10rem] flex-1"
              />
              {t.isDefault ? (
                <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Default</Badge>
              ) : canEdit && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(`${t.name} is now the default`, () => makeDefault(t.id))}>Make default</Button>
              )}
              {canEdit && changed(t) && (
                <Button size="sm" disabled={busy || !r.name.trim()} onClick={() => run("Type saved", () => save({ id: t.id, ...r }))}>Save</Button>
              )}
              {canEdit && !t.isDefault && (
                <Button size="icon" variant="ghost" aria-label={`Archive ${t.name}`} disabled={busy}
                  onClick={() => window.confirm(`Archive "${t.name}"? Existing shifts keep it; it won't be offered for new shifts.`) && run("Type archived", () => archive(t.id))}>
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2">
            <input
              type="color"
              aria-label="Colour for the new type"
              value={fresh.colour}
              onChange={(e) => setFresh({ ...fresh, colour: e.target.value })}
              className="h-9 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
            />
            <Input
              placeholder="New type, e.g. Respite"
              value={fresh.name}
              maxLength={40}
              onChange={(e) => setFresh({ ...fresh, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && fresh.name.trim()) (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click(); }}
              className="h-9 min-w-[10rem] flex-1"
            />
            <Button
              size="sm"
              disabled={busy || !fresh.name.trim()}
              onClick={() => run("Type added", async () => {
                await save(fresh);
                setFresh({ name: "", colour: PALETTE[(types.length + 1) % PALETTE.length] });
              })}
            >
              <Plus className="mr-1 h-4 w-4" />Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
