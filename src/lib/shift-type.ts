import type { ShiftType } from "./types";

/** Used when no types have loaded (or the table is empty), so every shift still has a label. */
export const FALLBACK_TYPE: ShiftType = { id: "", name: "Standard", colour: "#0EA5E9", isDefault: true, sort: 0 };

/**
 * The type to show for a shift: its own type, else "Sleepover" for sleepovers when that type exists,
 * else the organisation's default type.
 */
export function resolveShiftType(
  shift: { shiftTypeId?: string | null; isSleepover?: boolean },
  types: ShiftType[],
): ShiftType {
  if (shift.shiftTypeId) {
    const own = types.find((t) => t.id === shift.shiftTypeId);
    if (own) return own;
  }
  if (shift.isSleepover) {
    const sleep = types.find((t) => t.name.toLowerCase() === "sleepover");
    if (sleep) return sleep;
  }
  return types.find((t) => t.isDefault) ?? types[0] ?? FALLBACK_TYPE;
}

/** Black or white text, whichever reads better on the given #RRGGBB background. */
export function readableOn(hex: string): "#000000" | "#FFFFFF" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#000000";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#000000" : "#FFFFFF";
}
