"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PagerProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  from: number;
  to: number;
  setPage: (p: number) => void;
  setPageSize?: (n: number) => void;
  sizes?: number[];
  className?: string;
};

/**
 * Client-side paging for any list. `resetKey` sends you back to page 1 when filters or search
 * change, so you never land on an empty page 7 of a now-shorter list.
 */
export function usePaged<T>(rows: T[], initialSize = 20, resetKey: unknown = null) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  useEffect(() => { setPage(1); }, [resetKey, pageSize]);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(page, pageCount);
  const slice = useMemo(() => rows.slice((safe - 1) * pageSize, safe * pageSize), [rows, safe, pageSize]);
  return {
    rows: slice,
    pager: {
      page: safe, pageCount, total, pageSize,
      from: total === 0 ? 0 : (safe - 1) * pageSize + 1,
      to: Math.min(safe * pageSize, total),
      setPage, setPageSize,
    } satisfies PagerProps,
  };
}

/** Page numbers to show: always first and last, the current page and its neighbours, gaps as null. */
export function pageWindow(page: number, count: number): (number | null)[] {
  const keep = new Set([1, count, page - 1, page, page + 1].filter((n) => n >= 1 && n <= count));
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pager({ page, pageCount, total, pageSize, from, to, setPage, setPageSize, sizes = [10, 20, 50, 100], className }: PagerProps) {
  if (total === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm", className)}>
      <p className="text-muted-foreground tabular-nums">
        Showing <span className="font-medium text-foreground">{from}</span>-<span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <div className="flex items-center gap-3">
        {setPageSize && (
          <label className="hidden items-center gap-2 text-muted-foreground sm:flex">
            Rows
            <select
              className="h-8 rounded-md border border-input bg-card px-2 text-sm"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {pageCount > 1 && (
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageWindow(page, pageCount).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} className="px-1 text-muted-foreground">...</span>
              ) : (
                <Button
                  key={n}
                  variant={n === page ? "default" : "ghost"}
                  size="icon"
                  className="h-8 w-8 tabular-nums"
                  onClick={() => setPage(n)}
                  aria-current={n === page ? "page" : undefined}
                >
                  {n}
                </Button>
              ),
            )}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
