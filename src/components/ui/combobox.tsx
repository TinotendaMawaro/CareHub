"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { label: string; value: string };

function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className,
}: {
  options: Option[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const selected = options.find((o) => o.value === value);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm"
      >
        <span className={cn(!selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          <input
            autoFocus
            className="w-full border-b border-slate-100 px-3 py-2 text-sm outline-none"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="p-1">
            {filtered.length === 0 && (
              <p className="px-2 py-1 text-sm text-slate-500">No results</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  o.value === value ? "bg-green-50 text-green-900" : "hover:bg-slate-100"
                )}
              >
                <Check
                  className={cn(
                    "h-4 w-4",
                    o.value === value ? "opacity-100" : "opacity-0"
                  )}
                />
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { Combobox };
export type { Option };
