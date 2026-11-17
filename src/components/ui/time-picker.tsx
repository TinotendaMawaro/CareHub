"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

function TimePicker({
  value,
  onChange,
  placeholder = "HH:MM",
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      type="time"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className="w-full"
    />
  );
}

export { TimePicker };
