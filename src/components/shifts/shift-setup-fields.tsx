"use client";

import { useRef, useState } from "react";
import { Bold, Eye, Gift, Heading, Italic, Link2, List, ListChecks, ListOrdered, MapPin, PenLine, Plus, Tag, Timer, UserCheck, X } from "lucide-react";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ShiftDetails, ShiftTask } from "@/lib/shift-rpc";
import type { ShiftType } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SetupValue = {
  typeId: string;
  bonus: string;
  breakMinutes: string;
  breakPaid: boolean;
  address: string;
  dropoffOn: boolean;
  dropoff: string;
  instructions: string;
  tasks: ShiftTask[];
  clientSignature: boolean;
  workerSignature: boolean;
  confirmation: boolean;
};

export const EMPTY_SETUP: SetupValue = {
  typeId: "", bonus: "", breakMinutes: "", breakPaid: false, address: "", dropoffOn: false, dropoff: "", instructions: "", tasks: [],
  clientSignature: false, workerSignature: false, confirmation: false,
};

export function setupFromShift(s: any): SetupValue {
  return {
    typeId: s.shift_type_id ?? "",
    bonus: Number(s.bonus_amount ?? 0) ? String(Number(s.bonus_amount)) : "",
    breakMinutes: Number(s.planned_break_minutes ?? 0) ? String(s.planned_break_minutes) : "",
    breakPaid: !!s.break_paid,
    address: s.address ?? "",
    dropoffOn: !!s.dropoff_address,
    dropoff: s.dropoff_address ?? "",
    instructions: s.notes ?? "",
    tasks: [...(s.shift_tasks ?? [])].sort((a: any, b: any) => a.sort - b.sort).map((t: any) => ({ label: t.label, mandatory: t.mandatory })),
    clientSignature: !!s.require_client_signature,
    workerSignature: !!s.require_worker_signature,
    confirmation: !!s.confirmation_required,
  };
}

/** What to send to set_shift_details. `notes` is left out when the caller saves instructions another way. */
export function setupToDetails(v: SetupValue, opts: { includeNotes?: boolean } = {}): ShiftDetails {
  const d: ShiftDetails = {
    shift_type_id: v.typeId || null,
    bonus_amount: Math.max(0, Number(v.bonus) || 0),
    planned_break_minutes: Math.min(720, Math.max(0, Math.round(Number(v.breakMinutes) || 0))),
    break_paid: v.breakPaid,
    address: v.address.trim() || null,
    dropoff_address: v.dropoffOn ? v.dropoff.trim() || "To be confirmed" : null,
    tasks: v.tasks.filter((t) => t.label.trim()),
    require_client_signature: v.clientSignature,
    require_worker_signature: v.workerSignature,
    confirmation_required: v.confirmation,
  };
  if (opts.includeNotes !== false) d.notes = v.instructions.trim() || null;
  return d;
}

/** True when the setup holds anything beyond the defaults, so a create needs a follow-up save. */
export const setupIsEmpty = (v: SetupValue) =>
  !v.typeId && !Number(v.bonus) && !Number(v.breakMinutes) && !v.address.trim() && !v.dropoffOn && v.tasks.length === 0
  && !v.clientSignature && !v.workerSignature && !v.confirmation;

export function ShiftSetupFields({
  value, onChange, types, disabled, addressPlaceholder, showInstructions = true, clientCount = 1,
}: {
  value: SetupValue;
  onChange: (v: SetupValue) => void;
  types: ShiftType[];
  disabled?: boolean;
  addressPlaceholder?: string;
  showInstructions?: boolean;
  /** Client sign-off only applies to 1:1 shifts. */
  clientCount?: number;
}) {
  const [task, setTask] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const set = (patch: Partial<SetupValue>) => onChange({ ...value, ...patch });
  const addTask = () => {
    const label = task.trim();
    if (!label || value.tasks.some((t) => t.label === label)) return;
    set({ tasks: [...value.tasks, { label, mandatory }] });
    setTask("");
    setMandatory(false);
  };
  const selected = types.find((t) => t.id === value.typeId);
  const group = clientCount > 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)]">
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5 text-xs" htmlFor="setup-type"><Tag className="h-3.5 w-3.5" />Shift type</Label>
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-black/10"
              style={{ background: selected?.colour ?? types.find((t) => t.isDefault)?.colour ?? "#CBD5E1" }}
            />
            <select
              id="setup-type"
              disabled={disabled}
              value={value.typeId}
              onChange={(e) => set({ typeId: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background py-1 pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Default{types.find((t) => t.isDefault) ? ` (${types.find((t) => t.isDefault)!.name})` : ""}</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5 text-xs" htmlFor="setup-bonus"><Gift className="h-3.5 w-3.5" />Shift bonus ($)</Label>
          <Input id="setup-bonus" type="number" min={0} step={5} inputMode="decimal" placeholder="0" disabled={disabled} value={value.bonus} onChange={(e) => set({ bonus: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5 text-xs" htmlFor="setup-break"><Timer className="h-3.5 w-3.5" />Planned break (min)</Label>
          <div className="flex gap-1">
            <Input id="setup-break" type="number" min={0} max={720} step={5} placeholder="0" disabled={disabled} value={value.breakMinutes} onChange={(e) => set({ breakMinutes: e.target.value })} className="h-9 min-w-[4.5rem] px-2" />
            <div className="inline-flex shrink-0 rounded-md border bg-muted/40 p-0.5" role="radiogroup" aria-label="Break pay">
              {[false, true].map((paid) => (
                <button
                  key={String(paid)}
                  type="button"
                  role="radio"
                  aria-checked={value.breakPaid === paid}
                  disabled={disabled}
                  onClick={() => set({ breakPaid: paid })}
                  className={cn("rounded px-2 text-xs font-medium", value.breakPaid === paid ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  {paid ? "Paid" : "Unpaid"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {Number(value.bonus) > 0 && <p className="-mt-2 text-xs text-muted-foreground">Staff see the bonus on the shift and on open shifts in the app.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5 text-xs" htmlFor="setup-address"><MapPin className="h-3.5 w-3.5" />Start address</Label>
          <Input id="setup-address" disabled={disabled} placeholder={addressPlaceholder || "The client's address"} value={value.address} onChange={(e) => set({ address: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs font-medium">
            <Checkbox disabled={disabled} checked={value.dropoffOn} onCheckedChange={(v) => set({ dropoffOn: !!v })} />
            Finishes somewhere else (drop-off)
          </label>
          {value.dropoffOn && (
            <Input aria-label="Drop-off address" disabled={disabled} placeholder="Where the shift ends, or leave blank if unknown" value={value.dropoff} onChange={(e) => set({ dropoff: e.target.value })} className="h-9" />
          )}
          {value.dropoffOn && <p className="text-xs text-muted-foreground">Staff can end the shift wherever they drop the client off.</p>}
        </div>
      </div>

      {showInstructions && (
        <InstructionsEditor value={value.instructions} disabled={disabled} onChange={(instructions) => set({ instructions })} />
      )}

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs"><ListChecks className="h-3.5 w-3.5" />Tasks ({value.tasks.length})</Label>
        {value.tasks.length > 0 && (
          <ul className="space-y-1">
            {value.tasks.map((t, i) => (
              <li key={t.label} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-sm">
                <span className="min-w-0 flex-1 break-words">{t.label}</span>
                <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Checkbox disabled={disabled} checked={!!t.mandatory} onCheckedChange={(v) => set({ tasks: value.tasks.map((x, j) => (j === i ? { ...x, mandatory: !!v } : x)) })} />
                  Required
                </label>
                {!disabled && (
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Remove ${t.label}`} onClick={() => set({ tasks: value.tasks.filter((_, j) => j !== i) })}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!disabled && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="New task"
              placeholder="Add a task, e.g. Give 8am medication"
              value={task}
              maxLength={200}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
              className="h-9 min-w-[12rem] flex-1"
            />
            <label className="flex items-center gap-1 text-xs"><Checkbox checked={mandatory} onCheckedChange={(v) => setMandatory(!!v)} />Required</label>
            <Button type="button" size="sm" variant="outline" disabled={!task.trim()} onClick={addTask}><Plus className="mr-1 h-3.5 w-3.5" />Task</Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Staff tick tasks off in the app. Required tasks must be done before the shift can be ended.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 flex items-center gap-1.5 text-xs font-medium"><PenLine className="h-3.5 w-3.5" />Sign-off and confirmation</legend>
        <label className={cn("flex items-start gap-2 text-sm", group && "opacity-60")}>
          <Checkbox className="mt-0.5" disabled={disabled || group} checked={value.clientSignature && !group} onCheckedChange={(v) => set({ clientSignature: !!v })} />
          <span>Client signs when staff clock out{group && <span className="block text-xs text-muted-foreground">Only for 1:1 shifts.</span>}</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" disabled={disabled} checked={value.workerSignature} onCheckedChange={(v) => set({ workerSignature: !!v })} />
          Staff sign when they clock out
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" disabled={disabled} checked={value.confirmation} onCheckedChange={(v) => set({ confirmation: !!v })} />
          <span className="flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" />Ask staff to confirm they can do it</span>
        </label>
        {value.confirmation && <p className="pl-6 text-xs text-muted-foreground">Staff get a message and confirm or decline in the app. A decline frees the slot and tells the office.</p>}
      </fieldset>
    </div>
  );
}

type Tool = { label: string; icon: typeof Bold; sample: string } & ({ wrap: [string, string] } | { line: string });
const TOOLS: Tool[] = [
  { label: "Bold", icon: Bold, wrap: ["**", "**"], sample: "bold text" },
  { label: "Italic", icon: Italic, wrap: ["*", "*"], sample: "text" },
  { label: "Heading", icon: Heading, line: "# ", sample: "Heading" },
  { label: "Bulleted list", icon: List, line: "- ", sample: "Item" },
  { label: "Numbered list", icon: ListOrdered, line: "1. ", sample: "Step" },
  { label: "Link", icon: Link2, wrap: ["[", "](https://)"], sample: "link text" },
];
const LIST_PREFIX = /^(#{1,3}|[-*]|\d+[.)])\s+/;

/** Plain textarea with a formatting toolbar and a preview of how staff will see it in the app. */
function InstructionsEditor({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function apply(tool: Tool) {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    let next: string, from: number, to: number;
    if ("wrap" in tool) {
      const picked = value.slice(a, b) || tool.sample;
      next = value.slice(0, a) + tool.wrap[0] + picked + tool.wrap[1] + value.slice(b);
      from = a + tool.wrap[0].length;
      to = from + picked.length;
      if (tool.label === "Link") { from = to + 2; to = from + "https://".length; }
    } else {
      const lineStart = value.lastIndexOf("\n", a - 1) + 1;
      const block = (value.slice(lineStart, b) || tool.sample).split("\n").map((l) => tool.line + l.replace(LIST_PREFIX, "")).join("\n");
      next = value.slice(0, lineStart) + block + value.slice(Math.max(b, lineStart));
      from = lineStart;
      to = lineStart + block.length;
    }
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from, to); });
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs" htmlFor="setup-instructions">Instructions for staff</Label>
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5" role="tablist" aria-label="Instructions view">
          {[false, true].map((p) => (
            <button key={String(p)} type="button" role="tab" aria-selected={preview === p} onClick={() => setPreview(p)}
              className={cn("flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium", preview === p ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {p ? <><Eye className="h-3 w-3" />Preview</> : <><PenLine className="h-3 w-3" />Write</>}
            </button>
          ))}
        </div>
      </div>
      {preview ? (
        <div className="min-h-[5.5rem] rounded-md border bg-card p-3" aria-label="Instructions preview">
          {value.trim() ? <RichText text={value} /> : <p className="text-sm text-muted-foreground">Nothing written yet.</p>}
        </div>
      ) : (
        <div className="rounded-md border focus-within:ring-2 focus-within:ring-ring">
          {!disabled && (
            <div className="flex flex-wrap gap-0.5 border-b bg-muted/30 p-1" role="toolbar" aria-label="Formatting">
              {TOOLS.map((t) => (
                <Button key={t.label} type="button" size="icon" variant="ghost" className="h-7 w-7" title={t.label} aria-label={t.label}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => apply(t)}>
                  <t.icon className="h-3.5 w-3.5" />
                </Button>
              ))}
            </div>
          )}
          <Textarea
            id="setup-instructions"
            ref={ref}
            rows={4}
            maxLength={10000}
            disabled={disabled}
            placeholder="Door code, routines, what to bring... Use the toolbar for bold, lists and links."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      )}
    </div>
  );
}
