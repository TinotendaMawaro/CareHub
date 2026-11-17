"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Input } from "@/components/ui/input";
import { Command } from "lucide-react";

function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = "Search...",
  emptyMessage = "No results.",
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: { title: string; subtitle?: string; onSelect?: () => void }[];
  placeholder?: string;
  emptyMessage?: string;
  onSelect?: () => void;
}) {
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.title.toLowerCase().includes(q));
  }, [items, query]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0">
        <VisuallyHidden>
          <DialogTitle>Command palette</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center gap-2 border-b px-3">
          <Command className="h-4 w-4 opacity-60" />
          <Input
            autoFocus
            className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-80 overflow-auto p-1">
          {filtered.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
          )}
          {filtered.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className="flex w-full flex-col rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100"
              onClick={() => {
                item.onSelect?.();
                onSelect?.();
                onOpenChange(false);
              }}
            >
              <span className="font-medium text-slate-900">{item.title}</span>
              {item.subtitle && (
                <span className="text-xs text-slate-500">{item.subtitle}</span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { CommandPalette };
