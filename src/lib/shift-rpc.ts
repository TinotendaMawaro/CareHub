import { supabase } from "@/lib/supabase/client";

/** Database errors are raised as "code: message"; split them so the UI can show the message and branch on the code. */
export function parseRpcError(e: unknown): { code: string; message: string } {
  const raw = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as any).message) : String(e);
  const m = /^([a-z_]+): ([\s\S]*)$/.exec(raw);
  return m ? { code: m[1], message: m[2] } : { code: "error", message: raw };
}

async function call<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type Scope = "this" | "following" | "all";

export type NdisCancelReason = "health" | "family" | "transport" | "other";
export const NDIS_CANCEL_REASONS: { value: NdisCancelReason; label: string }[] = [
  { value: "health", label: "No show due to health reasons" },
  { value: "family", label: "No show due to family issues" },
  { value: "transport", label: "No show due to unavailability of transport" },
  { value: "other", label: "Other" },
];

export type ShiftTask = { label: string; mandatory?: boolean };
/** Only the keys you pass are changed. */
export type ShiftDetails = Partial<{
  shift_type_id: string | null;
  bonus_amount: number;
  planned_break_minutes: number;
  break_paid: boolean;
  address: string | null;
  dropoff_address: string | null;
  notes: string | null;
  tasks: ShiftTask[];
}>;

export type ShiftBlock = {
  start_time: string; // "HH:MM" in the organisation's timezone
  end_time: string; // earlier than start_time means it ends the next day
  support_family?: string | null;
  item_number?: string | null; // explicit cost code; null = resolve from time band
  is_sleepover?: boolean;
  notes?: string;
};

export type RepeatRule = {
  freq: "none" | "daily" | "weekly";
  interval?: number;
  weekdays?: number[]; // ISO: Monday = 1 ... Sunday = 7
  until?: string; // YYYY-MM-DD
  count?: number;
};

export type CreateShiftsInput = {
  client_ids: string[];
  worker_ids: string[];
  site_id?: string | null;
  ratio?: string;
  required_workers?: number;
  geofence_required?: boolean | null;
  notes?: string;
  allow_overlap?: boolean;
  skip_conflicts?: boolean;
  service_type?: string;
  support_family?: string | null;
  date: string;
  blocks: ShiftBlock[];
  repeat?: RepeatRule;
};

export type CreateShiftsResult = {
  shift_ids: string[];
  series_ids: string[];
  skipped: { date: string; block: number; worker: string; reason: string }[];
};

export const shiftRpc = {
  create: (input: CreateShiftsInput) => call<CreateShiftsResult>("create_shifts", { p: input }),
  split: (shiftId: string, at: string, opts: { itemNumber?: string | null; family?: string | null; sleepover?: boolean | null } = {}) =>
    call<string>("split_shift", {
      p_shift: shiftId, p_at: at, p_item_number: opts.itemNumber ?? null,
      p_support_family: opts.family ?? null, p_is_sleepover: opts.sleepover ?? null,
    }),
  splitSeries: (shiftId: string, time: string, scope: Scope, opts: { itemNumber?: string | null; family?: string | null; sleepover?: boolean | null } = {}) =>
    call<{ new_shift_ids: string[]; skipped: { shift_id: string; date: string; reason: string }[] }>("split_series", {
      p_shift: shiftId, p_time: time, p_scope: scope, p_item_number: opts.itemNumber ?? null,
      p_support_family: opts.family ?? null, p_is_sleepover: opts.sleepover ?? null,
    }),
  addWorker: (shiftId: string, caregiverId: string, scope: Scope = "this") =>
    call<{ added: number; skipped: unknown[] }>("add_shift_worker", { p_shift: shiftId, p_caregiver: caregiverId, p_scope: scope }),
  removeWorker: (shiftId: string, caregiverId: string, scope: Scope = "this") =>
    call<number>("remove_shift_worker", { p_shift: shiftId, p_caregiver: caregiverId, p_scope: scope }),
  addClient: (shiftId: string, clientId: string, scope: Scope = "this") =>
    call<{ added: number; skipped: unknown[] }>("add_shift_client", { p_shift: shiftId, p_client: clientId, p_scope: scope }),
  removeClient: (shiftId: string, clientId: string) => call<void>("remove_shift_client", { p_shift: shiftId, p_client: clientId }),
  /** by "client" = client is billed and staff are paid; "provider" = no charge, no pay. */
  cancel: (ids: string[], reason: string | null, by: "client" | "provider", opts: { ndisReason?: NdisCancelReason | null; notify?: boolean } = {}) =>
    call<number>("cancel_shifts", { p_ids: ids, p_reason: reason, p_pay: by === "client", p_by: by, p_ndis_reason: opts.ndisReason ?? null, p_notify: !!opts.notify }),
  rebook: (shiftId: string) => call<void>("rebook_shift", { p_shift: shiftId }),
  setDetails: (ids: string[], details: ShiftDetails) => call<number>("set_shift_details", { p_ids: ids, p: details }),
  completeTask: (taskId: string, done: boolean) => call<void>("complete_shift_task", { p_task: taskId, p_done: done }),
  remove: (shiftId: string, scope: Scope = "this") => call<number>("delete_shifts", { p_shift: shiftId, p_scope: scope }),
  publish: (shiftId: string) => call<void>("publish_shift", { p_shift: shiftId }),
  approve: (shiftId: string, useScheduled = false) => call<void>("approve_shift", { p_shift: shiftId, p_use_scheduled: useScheduled }),
  approveMany: (ids: string[], useScheduled = false) =>
    call<{ approved: number; failed: { shift_id: string; error: string }[] }>("approve_shifts", { p_ids: ids, p_use_scheduled: useScheduled }),
  reject: (shiftId: string, reason: string) => call<void>("reject_shift", { p_shift: shiftId, p_reason: reason }),
  unapprove: (shiftId: string) => call<void>("unapprove_shift", { p_shift: shiftId }),
  adjust: (shiftId: string, caregiverId: string, clockIn: string | null, clockOut: string | null, breakMinutes = 0) =>
    call<void>("adjust_shift_worker", { p_shift: shiftId, p_caregiver: caregiverId, p_in: clockIn, p_out: clockOut, p_break: breakMinutes }),
  /** New local times ("HH:MM"); an end at or before the start finishes next day. `date` moves a single shift. */
  reschedule: (shiftId: string, start: string, end: string, scope: Scope = "this", date: string | null = null) =>
    call<{ updated: number; skipped: { shift_id: string; date: string; reason: string }[] }>("reschedule_shift", {
      p_shift: shiftId, p_start: start, p_end: end, p_scope: scope, p_date: date,
    }),
  syncStatuses: () => call<number>("sync_shift_statuses"),
};
