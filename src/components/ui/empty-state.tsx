"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-10 text-center",
        className
      )}
    >
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action}
    </div>
  );
}

export { EmptyState };
