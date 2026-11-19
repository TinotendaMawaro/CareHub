"use client";

import { useEffect, useState } from "react";
import { Ban, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NDIS_CANCEL_REASONS, type NdisCancelReason } from "@/lib/shift-rpc";
import { cn } from "@/lib/utils";

export type CancelChoice = {
  by: "client" | "provider";
  reason: string;
  ndisReason: NdisCancelReason | null;
  notify: boolean;
};

const OPTIONS = [
  {
    by: "client" as const,
    icon: Receipt,
    title: "Client cancelled",
    body: "The client is billed and staff are paid. Use when the client cancelled with short notice.",
    tone: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  },
  {
    by: "provider" as const,
    icon: Ban,
    title: "We cancelled",
    body: "No charge to the client and staff are not paid. Use when we cancelled, or the client gave enough notice.",
    tone: "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100",
  },
];

/** Asks who cancelled (which decides billing and pay), the NDIS reason, a note, and whether to tell staff. */
export function CancelShiftDialog({
  open, count = 1, summary, onOpenChange, onConfirm,
}: {
  open: boolean;
  count?: number;
  summary?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (choice: CancelChoice) => void | Promise<void>;
}) {
  const [by, setBy] = useState<CancelChoice["by"] | null>(null);
  const [ndisReason, setNdisReason] = useState<NdisCancelReason | "">("");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setBy(null); setNdisReason(""); setReason(""); setNotify(true); setBusy(false); }
  }, [open]);

  const ready = !!by && !!ndisReason && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{count > 1 ? `Cancel ${count} shifts` : "Cancel shift"}</DialogTitle>
          <DialogDescription>{summary ?? "Started, finished or approved shifts are left as they are."}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div role="radiogroup" aria-label="Who cancelled" className="grid gap-2 sm:grid-cols-2">
            {OPTIONS.map((o) => (
              <button
                key={o.by}
                type="button"
                role="radio"
                aria-checked={by === o.by}
                onClick={() => setBy(o.by)}
                className={cn(
                  "rounded-xl border-2 p-3 text-left transition-all",
                  by === o.by ? cn(o.tone, "shadow-sm") : "border-border hover:border-muted-foreground/40",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold"><o.icon className="h-4 w-4" />{o.title}</span>
                <span className="mt-1 block text-xs opacity-80">{o.body}</span>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ndis-reason">NDIS cancellation reason</Label>
            <select
              id="ndis-reason"
              value={ndisReason}
              onChange={(e) => setNdisReason(e.target.value as NdisCancelReason)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Choose a reason</option>
              {NDIS_CANCEL_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Used on NDIS claims. Pick one even if the client isn&apos;t NDIS funded.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-note">What happened</Label>
            <Textarea id="cancel-note" rows={2} placeholder="Kept in the shift history and shown to staff" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(!!v)} />
            Tell the assigned staff (app notification)
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Keep shift</Button>
          <Button
            variant="destructive"
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm({ by: by!, reason: reason.trim(), ndisReason: (ndisReason || null) as NdisCancelReason | null, notify });
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {count > 1 ? `Cancel ${count} shifts` : "Cancel shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
