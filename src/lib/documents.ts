export type DocOwnerKind = "caregiver" | "client" | "organisation";
export type DocStatus = "pending_review" | "approved" | "rejected";
export type ExpiryState = "none" | "expired" | "expiring" | "valid";

export type DocumentRow = {
  id: string;
  title: string;
  category: string;
  caregiver_id: string | null;
  client_id: string | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  visible_to_staff: boolean;
  status: DocStatus;
  review_note: string | null;
  archived: boolean;
  created_at: string;
  caregivers?: { name: string } | null;
  clients?: { first_name: string; last_name: string | null } | null;
};

/** NDIS-oriented starting lists; "Other" lets people file anything. */
export const DOC_CATEGORIES: Record<DocOwnerKind, string[]> = {
  caregiver: [
    "NDIS Worker Screening Check",
    "Working With Children Check",
    "Police Check",
    "First Aid",
    "CPR",
    "NDIS Worker Orientation Module",
    "Driver Licence",
    "Car Insurance",
    "Vaccination Record",
    "Qualification",
    "Right to Work / Visa",
    "Other",
  ],
  client: [
    "NDIS Plan",
    "Service Agreement",
    "Care Plan",
    "Behaviour Support Plan",
    "Risk Assessment",
    "Medication Chart",
    "Consent Form",
    "Other",
  ],
  organisation: ["Policy", "Procedure", "Form Template", "Insurance", "Registration", "Other"],
};

export const EXPIRING_SOON_DAYS = 30;

export function ownerKind(d: Pick<DocumentRow, "caregiver_id" | "client_id">): DocOwnerKind {
  return d.caregiver_id ? "caregiver" : d.client_id ? "client" : "organisation";
}

/** "YYYY-MM-DD" for a Date in the given IANA timezone. */
export function ymdIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Whole days from `todayYmd` to `expiryYmd` (negative once past). Both are date-only strings. */
export function daysUntil(expiryYmd: string, todayYmd: string): number {
  const a = Date.UTC(+todayYmd.slice(0, 4), +todayYmd.slice(5, 7) - 1, +todayYmd.slice(8, 10));
  const b = Date.UTC(+expiryYmd.slice(0, 4), +expiryYmd.slice(5, 7) - 1, +expiryYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** A document expires at the end of its expiry day, so "expires today" is still valid. */
export function expiryState(expiryYmd: string | null, todayYmd: string, soonDays = EXPIRING_SOON_DAYS): ExpiryState {
  if (!expiryYmd) return "none";
  const d = daysUntil(expiryYmd, todayYmd);
  if (d < 0) return "expired";
  if (d <= soonDays) return "expiring";
  return "valid";
}

export function expiryLabel(expiryYmd: string | null, todayYmd: string): string {
  if (!expiryYmd) return "No expiry";
  const d = daysUntil(expiryYmd, todayYmd);
  if (d < -1) return `Expired ${-d} days ago`;
  if (d === -1) return "Expired yesterday";
  if (d === 0) return "Expires today";
  if (d === 1) return "Expires tomorrow";
  return d <= EXPIRING_SOON_DAYS ? `Expires in ${d} days` : `Expires ${expiryYmd}`;
}

export function ownerName(d: DocumentRow): string {
  if (d.caregivers) return d.caregivers.name;
  if (d.clients) return [d.clients.first_name, d.clients.last_name].filter(Boolean).join(" ");
  return "Organisation";
}

export function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Storage object path: a folder per uploader (storage policies require this for workers). */
export function storagePath(folder: string, fileName: string, now = Date.now()): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "file";
  return `${folder}/${now}-${safe}`;
}

export const DOC_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx";
export const DOC_MAX_BYTES = 20 * 1024 * 1024;
