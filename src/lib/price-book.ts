/**
 * Parser for NDIS price guide data pasted or uploaded as CSV/TSV text.
 *
 * Each useful row carries a support item number (01_002_0107_1_1 style), a name,
 * a unit and up to three price columns (national / remote / very remote).
 * The time band and sleepover flag are derived from the item name, and the
 * support family is the name with its trailing time-band segment removed, so
 * "Assistance With Self-Care Activities - Standard - Weekday Night" files under
 * "Assistance With Self-Care Activities - Standard".
 */

export type ParsedPriceItem = {
  item_number: string;
  name: string;
  unit: "Hour" | "Each" | "Day" | "Week";
  time_band: string;
  is_sleepover: boolean;
  family_key: string;
  family_label: string;
  price_national: number;
  price_remote: number | null;
  price_very_remote: number | null;
};

export type PriceBookParse = {
  rows: ParsedPriceItem[];
  families: { family_key: string; label: string }[];
  skipped: number;
};

const ITEM_RE = /^\d{2}_\d{3}_\d{4}_[0-9A-Z_]+$/;

const BAND_SUFFIXES: [RegExp, string][] = [
  [/sleepover/i, "any"],
  [/weekday\s*day(time)?/i, "weekday_day"],
  [/weekday\s*evening/i, "weekday_evening"],
  [/weekday\s*night/i, "weekday_night"],
  [/saturday/i, "saturday"],
  [/sunday/i, "sunday"],
  [/public\s*holiday/i, "public_holiday"],
];

/** The trailing " - X" segments that name a time band rather than the support itself. */
const STRIP_SEGMENT =
  /^(weekday\s*(daytime|day|evening|night)|saturday|sunday|public\s*holiday|night-?time\s*sleepover|sleepover)$/i;

export function bandFromName(name: string): { time_band: string; is_sleepover: boolean } {
  if (/sleepover/i.test(name)) return { time_band: "any", is_sleepover: true };
  for (const [re, band] of BAND_SUFFIXES) if (re.test(name)) return { time_band: band, is_sleepover: false };
  return { time_band: "any", is_sleepover: false };
}

export function familyFromName(name: string): { family_key: string; label: string } {
  const parts = name.split(/\s+-\s+/);
  while (parts.length > 1 && STRIP_SEGMENT.test(parts[parts.length - 1].trim())) parts.pop();
  const label = parts.join(" - ").trim() || name.trim();
  const family_key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return { family_key: family_key || "imported", label };
}

function toPrice(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number.parseFloat(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function toUnit(raw: string | undefined): ParsedPriceItem["unit"] {
  const s = (raw ?? "").trim();
  if (/each|^ea$/i.test(s)) return "Each";
  if (/day/i.test(s)) return "Day";
  if (/week/i.test(s)) return "Week";
  return "Hour";
}

/** Splits one line of delimiter-separated text, honouring double quotes. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function pickDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const counts: [string, number][] = [["\t", 0], [",", 0], [";", 0]].map(([d]) => [
    d as string,
    (sample.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) ?? []).length,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export function parsePriceBook(text: string): PriceBookParse {
  const delim = pickDelimiter(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const byNumber = new Map<string, ParsedPriceItem>();
  let skipped = 0;

  // Column order, possibly overridden by a header row.
  let col = { item: 0, name: 1, unit: 2, national: 3, remote: 4, very: 5 };

  for (const line of lines) {
    const cells = splitLine(line, delim);
    const itemIdx = cells.findIndex((c) => ITEM_RE.test(c));
    if (itemIdx === -1) {
      // A header row can remap the columns; anything else (page titles, etc.) is skipped quietly.
      const lower = cells.map((c) => c.toLowerCase());
      const h = (re: RegExp) => lower.findIndex((c) => re.test(c));
      if (h(/item/) !== -1 && h(/name/) !== -1) {
        col = {
          item: h(/item.*(number|no\.?)|^item$/) !== -1 ? h(/item.*(number|no\.?)|^item$/) : h(/item/),
          name: h(/name/),
          unit: h(/unit/),
          national: h(/national|^price$|^nsw$/),
          remote: lower.findIndex((c) => /remote/.test(c) && !/very/.test(c)),
          very: h(/very/),
        };
      }
      continue;
    }

    const item_number = cells[itemIdx];
    // When the code was found positionally, read the other fields relative to the mapping,
    // shifted so the mapped item column lines up with where the code actually sits.
    const shift = itemIdx - col.item;
    const at = (i: number) => (i === -1 ? undefined : cells[i + shift]);
    const name = (at(col.name) ?? "").replace(/\s+/g, " ").trim();
    const price_national = toPrice(at(col.national));
    if (!name || ITEM_RE.test(name) || price_national == null) { skipped++; continue; }

    const { time_band, is_sleepover } = bandFromName(name);
    const fam = familyFromName(name);
    byNumber.set(item_number, {
      item_number,
      name,
      unit: is_sleepover && !at(col.unit) ? "Each" : toUnit(at(col.unit)),
      time_band,
      is_sleepover,
      family_key: fam.family_key,
      family_label: fam.label,
      price_national,
      price_remote: toPrice(at(col.remote)),
      price_very_remote: toPrice(at(col.very)),
    });
  }

  const rows = [...byNumber.values()];
  const families = [...new Map(rows.map((r) => [r.family_key, { family_key: r.family_key, label: r.family_label }])).values()];
  return { rows, families, skipped };
}
