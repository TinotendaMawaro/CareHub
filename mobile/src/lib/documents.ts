// Mirrors src/lib/documents.ts in the web app so both apps agree on what "expiring" means.
export type DocStatus = 'pending_review' | 'approved' | 'rejected';
export type ExpiryState = 'none' | 'expired' | 'expiring' | 'valid';

export type Doc = {
  id: string;
  title: string;
  category: string;
  caregiver_id: string | null;
  client_id: string | null;
  file_path: string;
  file_name: string;
  expiry_date: string | null;
  status: DocStatus;
  review_note: string | null;
  created_at: string;
};

export const WORKER_DOC_CATEGORIES = [
  'NDIS Worker Screening Check',
  'Working With Children Check',
  'Police Check',
  'First Aid',
  'CPR',
  'NDIS Worker Orientation Module',
  'Driver Licence',
  'Car Insurance',
  'Vaccination Record',
  'Qualification',
  'Right to Work / Visa',
  'Other',
];

export const EXPIRING_SOON_DAYS = 30;
export const DOC_SELECT = 'id,title,category,caregiver_id,client_id,file_path,file_name,expiry_date,status,review_note,created_at';

export function daysUntil(expiryYmd: string, todayYmd: string): number {
  const a = Date.UTC(+todayYmd.slice(0, 4), +todayYmd.slice(5, 7) - 1, +todayYmd.slice(8, 10));
  const b = Date.UTC(+expiryYmd.slice(0, 4), +expiryYmd.slice(5, 7) - 1, +expiryYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function expiryState(expiryYmd: string | null, todayYmd: string): ExpiryState {
  if (!expiryYmd) return 'none';
  const d = daysUntil(expiryYmd, todayYmd);
  if (d < 0) return 'expired';
  if (d <= EXPIRING_SOON_DAYS) return 'expiring';
  return 'valid';
}

export function expiryLabel(expiryYmd: string | null, todayYmd: string): string {
  if (!expiryYmd) return 'No expiry';
  const d = daysUntil(expiryYmd, todayYmd);
  if (d < -1) return `Expired ${-d} days ago`;
  if (d === -1) return 'Expired yesterday';
  if (d === 0) return 'Expires today';
  if (d === 1) return 'Expires tomorrow';
  return d <= EXPIRING_SOON_DAYS ? `Expires in ${d} days` : `Expires ${expiryYmd}`;
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

type RenewalDoc = Pick<Doc, 'id' | 'category' | 'expiry_date' | 'status' | 'created_at'>;

/** Documents the worker still has to act on: expired or expiring, and not already replaced by a newer upload. */
export function needsRenewal<T extends RenewalDoc>(docs: T[], todayYmd: string): T[] {
  return docs.filter((d) => {
    if (d.status === 'rejected') return false;
    if (expiryState(d.expiry_date, todayYmd) === 'valid' || !d.expiry_date) return false;
    const replaced = docs.some((o) => o.id !== d.id && o.category === d.category && o.status !== 'rejected' && o.created_at > d.created_at);
    return !replaced;
  });
}
