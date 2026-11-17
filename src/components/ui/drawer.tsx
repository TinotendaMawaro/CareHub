"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

function Drawer({
  open,
  onOpenChange,
  children,
  side = "right",
  title = "Drawer",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: "left" | "right";
  title?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className="w-full max-w-md">
        <VisuallyHidden>
          <SheetTitle>{title}</SheetTitle>
        </VisuallyHidden>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export { Drawer };
