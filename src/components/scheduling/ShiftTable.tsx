"use client";

import * as React from "react";
import { useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parse, getDay, parseISO } from "date-fns";
import {
  Calendar as CalendarIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Printer,
  Settings2,
  X,
  Play,
  Square,
  Check,
  Ban,
  FileEdit,
  StickyNote,
  AlertTriangle,
  History,
  Trash2,
  UserPlus,
  UserMinus,
  Users,
  Package,
  CheckCheck,
  LayoutList,
  CalendarDays,
  CheckSquare,
  Square as SquareIcon,
  UserSearch,
  Siren,
  Car,
  Receipt,
  ListChecks,
  Moon,
  Gift,
  Timer,
  LogIn,
  LogOut,
} from "lucide-react";
import { useShiftTypes } from "@/hooks/use-shift-types";
import { useShiftExtras, type ShiftExtras } from "@/hooks/use-shift-extras";
import { resolveShiftType } from "@/lib/shift-type";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose,
} from "@/components/ui/sheet";
import { CancelShiftDialog, type CancelChoice } from "@/components/shifts/cancel-shift-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as RBC, dateFnsLocalizer, Views } from "react-big-calendar";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { supabase } from "@/lib/supabase/client";
import type { Shift } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { findClashes, findWorkerSuggestions, publishShift, sendSmsToWorker, type WorkerSuggestion } from "@/lib/shiftApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

export type ShiftType = "On Site" | "Indirect" | "Sleepover" | "Appointment";

export type ColumnKey =
  | "select"
  | "flags"
  | "date"
  | "in"
  | "out"
  | "shiftType"
  | "participant"
  | "supportWorker"
  | "supportItem"
  | "hours"
  | "valueExGst"
  | "status"
  | "approved"
  | "additionalInfo"
  | "trackers"
  | "address"
  | "actions";

export type ColumnDef = {
  key: ColumnKey;
  label: string;
  visible: boolean;
  width?: number;
};

export type DateRangePreset =
  | "today"
  | "thisWeek"
  | "thisFortnight"
  | "next7"
  | "next30"
  | "past30"
  | "custom";

const DATE_PRESETS: { label: string; value: DateRangePreset; getRange: () => { from: Date; to: Date } }[] = [
  { label: "Today", value: "today", getRange: () => { const d = new Date(); return { from: d, to: d }; } },
  { label: "This week", value: "thisWeek", getRange: () => { const s = startOfWeek(new Date()); const e = endOfWeek(new Date()); return { from: s, to: e }; } },
  { label: "This fortnight", value: "thisFortnight", getRange: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 14); return { from: s, to: d }; } },
  { label: "Next 7 days", value: "next7", getRange: () => { const d = new Date(); return { from: d, to: subDays(d, -7) }; } },
  { label: "Next 30 days", value: "next30", getRange: () => { const d = new Date(); return { from: d, to: subDays(d, -30) }; } },
  { label: "Past 30 days", value: "past30", getRange: () => { const d = new Date(); return { from: subDays(d, 30), to: d }; } },
  { label: "Custom", value: "custom", getRange: () => { const d = new Date(); return { from: subDays(d, 7), to: d }; } },
];

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "select", label: "", visible: true, width: 40 },
  { key: "flags", label: "Flags", visible: true, width: 60 },
  { key: "date", label: "Date", visible: true, width: 130 },
  { key: "in", label: "In", visible: true, width: 80 },
  { key: "out", label: "Out", visible: true, width: 80 },
  { key: "shiftType", label: "Shift type", visible: true, width: 110 },
  { key: "participant", label: "Client", visible: true, width: 160 },
  { key: "supportWorker", label: "Staff", visible: true, width: 170 },
  { key: "supportItem", label: "Support item", visible: true, width: 140 },
  { key: "hours", label: "Hours", visible: true, width: 70 },
  { key: "valueExGst", label: "Value ex GST", visible: true, width: 100 },
  { key: "status", label: "Status", visible: true, width: 130 },
  { key: "approved", label: "Approved", visible: true, width: 90 },
  { key: "additionalInfo", label: "Additional information", visible: true, width: 160 },
  { key: "trackers", label: "Trackers", visible: true, width: 130 },
  { key: "address", label: "Address", visible: false, width: 180 },
  { key: "actions", label: "Actions", visible: true, width: 60 },
];
const COLUMNS_KEY = "carehub-shift-columns";

/** Saved column choices, merged with the defaults so newly added columns still appear. */
function loadColumns(): ColumnDef[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "null") as { key: ColumnKey; visible: boolean }[] | null;
    if (!Array.isArray(saved)) return DEFAULT_COLUMNS;
    const byKey = new Map(DEFAULT_COLUMNS.map((c) => [c.key, c]));
    const ordered = saved.filter((s) => byKey.has(s.key)).map((s) => ({ ...byKey.get(s.key)!, visible: !!s.visible }));
    const missing = DEFAULT_COLUMNS.filter((c) => !saved.some((s) => s.key === c.key));
    const all = [...ordered, ...missing];
    // keep select first and actions last whatever was saved
    return [...all.filter((c) => c.key === "select"), ...all.filter((c) => c.key !== "select" && c.key !== "actions"), ...all.filter((c) => c.key === "actions")];
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/** Ends on a later calendar day than it starts (overnight / sleepover). */
const endsNextDay = (s: Shift) => new Date(s.endTime).toDateString() !== new Date(s.startTime).toDateString();

function Tracker({ on, warn, icon: Icon, label, children }: { on: boolean; warn?: boolean; icon: React.ElementType; label: string; children?: React.ReactNode }) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border px-1 text-[11px] tabular-nums",
        warn ? "border-amber-300 bg-amber-50 text-amber-700" : on ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-transparent text-slate-300",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

function Trackers({ x }: { x: ShiftExtras }) {
  return (
    <div className="flex items-center gap-1">
      <Tracker on={x.notes > 0} icon={StickyNote} label={x.notes ? `${x.notes} note${x.notes === 1 ? "" : "s"}` : "No notes"}>{x.notes > 0 && x.notes}</Tracker>
      <Tracker on={x.km > 0} icon={Car} label={x.km ? `${x.km.toFixed(1)} km travelled` : "No mileage"}>{x.km > 0 && Math.round(x.km)}</Tracker>
      <Tracker on={x.expenses > 0} icon={Receipt} label={x.expenses ? `${x.expenses} expense${x.expenses === 1 ? "" : "s"}, $${x.expenseTotal.toFixed(2)}` : "No expenses"} />
      {x.tasks > 0 && (
        <Tracker on={x.tasksDone === x.tasks} warn={x.requiredOpen > 0} icon={ListChecks} label={`${x.tasksDone} of ${x.tasks} tasks done${x.requiredOpen ? `, ${x.requiredOpen} required still open` : ""}`}>
          {x.tasksDone}/{x.tasks}
        </Tracker>
      )}
    </div>
  );
}

const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

function isLocked(shift: Shift) {
  return shift.status === "Completed" || !!shift.approvedAt;
}

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function shiftHours(shift: Shift): number {
  const s = new Date(shift.startTime);
  const e = new Date(shift.endTime);
  return Math.max(0, (e.getTime() - s.getTime()) / 3_600_000);
}


interface ShiftTableProps {
  shifts: Shift[];
  caregivers?: any[];
  onStart?: (shift: Shift) => void;
  onStop?: (shift: Shift) => void;
  onApprove?: (shift: Shift) => void;
  onCancel?: (shift: Shift, choice: CancelChoice) => void | Promise<void>;
  onEdit?: (shift: Shift) => void;
  onNotes?: (shift: Shift) => void;
  onIncidents?: (shift: Shift) => void;
  onHistory?: (shift: Shift) => void;
  onBulkAssign?: (ids: string[], caregiverId: string) => void;
  onBulkUnassign?: (ids: string[]) => void;
  onBulkChangeSupportItem?: (ids: string[], supportItem: string) => void;
  onBulkApprove?: (ids: string[]) => void;
  onBulkCancel?: (ids: string[], choice: CancelChoice) => void | Promise<void>;
  onBulkDelete?: (ids: string[]) => void;
  onBulkPublish?: (ids: string[]) => void;
}

export default function ShiftTable({
  shifts,
  caregivers,
  onStart,
  onStop,
  onApprove,
  onCancel,
  onEdit,
  onNotes,
  onIncidents,
  onHistory,
  onBulkAssign,
  onBulkUnassign,
  onBulkChangeSupportItem,
  onBulkApprove,
  onBulkCancel,
  onBulkDelete,
  onBulkPublish,
}: ShiftTableProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(0);
  const [when, setWhen] = useState<"upcoming" | "past" | "all">("upcoming");
  const [sortAsc, setSortAsc] = useState(true);
  const [clientQ, setClientQ] = useState("");
  const [workerQ, setWorkerQ] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<DateRangePreset>("today");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [typeFilter, setTypeFilter] = useState("");
  const { types } = useShiftTypes();
  React.useEffect(() => { setColumns(loadColumns()); }, []);
  const columnsLoaded = React.useRef(false);
  React.useEffect(() => {
    // Skip the first run so the defaults never overwrite what was saved before loadColumns runs.
    if (!columnsLoaded.current) { columnsLoaded.current = true; return; }
    try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns.map((c) => ({ key: c.key, visible: c.visible })))); } catch {}
  }, [columns]);
  const [colSettingsOpen, setColSettingsOpen] = useState(false);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [assignWorkerId, setAssignWorkerId] = useState("");
  const [assignOverrideReason, setAssignOverrideReason] = useState("");
  const [assignWarnings, setAssignWarnings] = useState<string[]>([]);
  const [activityLog, setActivityLog] = useState<{ shiftId: string; action: string; reason?: string }[]>([]);
  const [findWorkerShiftId, setFindWorkerShiftId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WorkerSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [smsTargetIds, setSmsTargetIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const printRef = useRef<HTMLDivElement>(null);

  async function logActivity(shiftId: string, action: string, reason?: string) {
    if (!user) return;
    const entry = { shiftId, action, reason, userId: user.id, timestamp: new Date().toISOString() };
    setActivityLog((prev) => [...prev, entry]);
    await supabase.from('activity_log').insert({
      shift_id: shiftId,
      action,
      reason: reason || null,
      user_id: user.id,
      created_at: new Date().toISOString(),
    });
  }

  // Section 5: open ranked worker suggestion sheet for an unassigned shift
  async function openFindWorker(shift: Shift) {
    setFindWorkerShiftId(shift.id);
    setSuggestionsLoading(true);
    setSuggestions([]);
    try {
      const results = await findWorkerSuggestions(shift, caregivers ?? [], 10);
      setSuggestions(results);
    } catch (err) {
      console.error('[ShiftTable] findWorkerSuggestions failed:', err);
      toast({ title: 'Failed to load worker suggestions', variant: 'destructive' });
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function handleAssignFromList(caregiverId: string) {
    if (!findWorkerShiftId || !onBulkAssign) return;
    try {
      await logActivity(findWorkerShiftId, 'assigned_from_suggestions', caregiverId);
      await onBulkAssign([findWorkerShiftId], caregiverId);
      toast({ title: 'Worker assigned successfully' });
      setFindWorkerShiftId(null);
      setSuggestions([]);
    } catch (err) {
      console.error(err);
      toast({ title: 'Assignment failed', variant: 'destructive' });
    }
  }

  async function handlePublish(shiftId: string) {
    setPublishingIds((prev) => new Set(prev).add(shiftId));
    try {
      const ok = await publishShift(shiftId, user?.id ?? 'admin');
      if (ok) {
        await logActivity(shiftId, 'published');
        toast({ title: 'Shift published', description: 'Eligible workers will be notified.' });
      } else {
        toast({ title: 'Publish failed', variant: 'destructive' });
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Publish failed', variant: 'destructive' });
    } finally {
      setPublishingIds((prev) => { const n = new Set(prev); n.delete(shiftId); return n; });
    }
  }

  async function handleSms(shift: Shift) {
    setSmsTargetIds((prev) => new Set(prev).add(shift.id));
    try {
      await sendSmsToWorker(shift.id, `Unassigned shift on ${shift.date} needs a worker. Please respond.`);
      await logActivity(shift.id, 'sms_sent');
      toast({ title: 'SMS sent', description: `Notification logged for shift ${shift.shiftId}.` });
    } catch {
      toast({ title: 'SMS failed', variant: 'destructive' });
    } finally {
      setSmsTargetIds((prev) => { const n = new Set(prev); n.delete(shift.id); return n; });
    }
  }

  const findWorkerShift = useMemo(() => shifts.find((s) => s.id === findWorkerShiftId) ?? null, [shifts, findWorkerShiftId]);

  async function checkAssignmentEligibility(shift: Shift, caregiverId: string): Promise<{ eligible: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    if (!caregiverId) return { eligible: true, warnings: [] };

    const { data: clashes } = await supabase.from('shifts').select('id, start_time, end_time, status').eq('caregiver_id', caregiverId).neq('status', 'Cancelled').lt('start_time', shift.endTime).gt('end_time', shift.startTime);
    if (clashes && clashes.length > 0) {
      warnings.push(`Worker has ${clashes.length} overlapping shift(s)`);
    }

    const { data: leave } = await supabase.from('time_off_requests').select('id, status').eq('caregiver_id', caregiverId).eq('status', 'Approved').lte('start_date', shift.date).gte('end_date', shift.date);
    if (leave && leave.length > 0) {
      warnings.push('Worker has approved leave on this date');
    }

    return { eligible: warnings.length === 0, warnings };
  }

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  const filtered = useMemo(() => {
    let result = shifts;
    if (globalQuery.trim()) {
      const q = globalQuery.toLowerCase();
      result = result.filter(
        (s) =>
          (s.clientName ?? "").toLowerCase().includes(q) ||
          (s.caregiverName ?? "").toLowerCase().includes(q) ||
          (s.supportFamily ?? "").toLowerCase().includes(q) ||
          (s.status ?? "").toLowerCase().includes(q)
      );
    }
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : undefined;
      if (from) from.setHours(0, 0, 0, 0);
      const to = dateTo ? new Date(dateTo) : undefined;
      if (to) to.setHours(23, 59, 59, 999);
      result = result.filter((s) => {
        const d = new Date(s.date);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    if (when !== "all") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const t0 = todayStart.getTime();
      result = result.filter((s) => (when === "upcoming" ? new Date(s.endTime).getTime() >= t0 : new Date(s.endTime).getTime() < t0));
    }
    if (clientQ.trim()) {
      const q = clientQ.trim().toLowerCase();
      result = result.filter((s) => (s.clientName ?? "").toLowerCase().includes(q));
    }
    if (workerQ.trim()) {
      const q = workerQ.trim().toLowerCase();
      result = result.filter((s) => (s.caregiverName ?? "").toLowerCase().includes(q));
    }
    if (typeFilter) result = result.filter((s) => resolveShiftType(s, types).id === typeFilter);
    const dir = sortAsc ? 1 : -1;
    return [...result].sort((a, b) => dir * (new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
  }, [shifts, globalQuery, dateFrom, dateTo, when, clientQ, workerQ, sortAsc, typeFilter, types]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = useMemo(() => {
    const start = safePage * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const showingFrom = totalFiltered === 0 ? 0 : safePage * pageSize + 1;
  const showingTo = Math.min((safePage + 1) * pageSize, totalFiltered);

  const allSelected = pageData.length > 0 && pageData.every((s) => selectedIds.has(s.id));
  const someSelected = pageData.some((s) => selectedIds.has(s.id)) && !allSelected;

  React.useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [globalQuery, dateFrom, dateTo, pageSize, when, clientQ, workerQ, sortAsc, typeFilter]);
  const extrasFor = useShiftExtras(React.useMemo(() => pageData.map((s) => s.id), [pageData]));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageData.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageData.forEach((s) => next.add(s.id));
        return next;
      });
    }
  }, [allSelected, pageData]);

  const applyPreset = (preset: DateRangePreset) => {
    setDatePreset(preset);
    if (preset === "custom") return;
    const range = DATE_PRESETS.find((p) => p.value === preset)?.getRange();
    if (range) {
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Shifts</title><style>body{font-family:sans-serif;font-size:12px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:4px;text-align:left;}</style></head><body>`);
    win.document.write(printRef.current.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.print();
  };

  const handleExportCsv = () => {
    const headers = visibleColumns
      .filter((c) => c.key !== "select" && c.key !== "actions")
      .map((c) => c.label);
    const rows = filtered.map((s) =>
      visibleColumns
        .filter((c) => c.key !== "select" && c.key !== "actions")
        .map((c) => {
          switch (c.key) {
            case "date":
              return s.date;
            case "in":
              return formatTime(s.startTime);
            case "out":
              return formatTime(s.endTime);
            case "shiftType":
              return resolveShiftType(s, types).name;
            case "participant":
              return s.clientName ?? "";
            case "supportWorker":
              return s.caregiverName ?? "";
            case "supportItem":
              return s.supportFamily ?? "";
            case "hours":
              return String(shiftHours(s));
            case "valueExGst":
              return extrasFor(s.id).value ? extrasFor(s.id).value.toFixed(2) : "";
            case "status":
              return s.status ?? "";
            case "approved":
              return "";
            case "additionalInfo":
              return s.notes ?? "";
            case "flags":
              return [s.isSleepover && "Sleepover", s.bonusAmount && `Bonus $${s.bonusAmount}`, s.plannedBreakMinutes && `Break ${s.plannedBreakMinutes}m`].filter(Boolean).join("; ");
            case "trackers": {
              const x = extrasFor(s.id);
              return [x.notes && `${x.notes} notes`, x.km && `${x.km} km`, x.expenses && `${x.expenses} expenses`, x.tasks && `tasks ${x.tasksDone}/${x.tasks}`].filter(Boolean).join("; ");
            }
            case "address":
              return [s.address, s.dropoffAddress && `drop-off: ${s.dropoffAddress}`].filter(Boolean).join("; ");
            default:
              return "";
          }
        })
    );
    downloadCsv(`shifts-${format(new Date(), "yyyy-MM-dd")}.csv`, [headers, ...rows]);
  };

  const calendarEvents = filtered.map((s) => ({
    id: s.id,
    title: `${s.clientName ?? "Unknown"} - ${s.caregiverName ?? "Unassigned"}`,
    start: new Date(`${s.date}T${formatTime(s.startTime) || "00:00"}`),
    end: new Date(`${s.date}T${formatTime(s.endTime) || "23:59"}`),
    resource: s,
  }));

  const handleSelectEvent = (event: any) => {
    const shift = event.resource as Shift;
    if (onEdit) onEdit(shift);
  };

  const openCancel = (shift: Shift) => setCancelDialog({ open: true, shift });
  const confirmCancel = async (choice: CancelChoice) => {
    if (cancelDialog.shift && onCancel) await onCancel(cancelDialog.shift, choice);
  };

  const confirmBulkCancel = async (choice: CancelChoice) => {
    if (onBulkCancel && selectedIds.size > 0) await onBulkCancel(Array.from(selectedIds), choice);
    setSelectedIds(new Set());
  };

  const toggleColumn = (key: ColumnKey) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };

  const moveColumn = (key: ColumnKey, dir: -1 | 1) => {
    setColumns((prev) => {
      const idx = prev.findIndex((c) => c.key === key);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const statusRowClass = (status: string) => {
    switch (status) {
      case "Cancelled":
        return "bg-red-50";
      case "Cancelled, paid":
        return "bg-purple-50";
      case "Approved":
        return "bg-green-50";
      case "Late":
        return "bg-amber-50";
      default:
        return "";
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "Cancelled":
        return <Badge variant="destructive">Cancelled, unpaid</Badge>;
      case "Cancelled, paid":
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Cancelled, paid</Badge>;
      case "Approved":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><Check className="h-3 w-3 mr-1" />Approved</Badge>;
      case "Late":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Late</Badge>;
      case "In Progress":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Progress</Badge>;
      case "Completed":
        return <Badge variant="secondary">Completed</Badge>;
      case "Scheduled":
        return <Badge variant="outline">Scheduled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderCell = (shift: Shift, col: ColumnDef) => {
    switch (col.key) {
      case "select":
        return (
          <Checkbox
            checked={selectedIds.has(shift.id)}
            onCheckedChange={() => toggleSelect(shift.id)}
            aria-label={`Select shift ${shift.shiftId}`}
          />
        );
      case "flags":
        return (
          <div className="flex gap-1">
            {shift.isSleepover && <span title="Sleepover" className="text-violet-600"><Moon className="h-4 w-4" /></span>}
            {!!shift.bonusAmount && <span title={`$${shift.bonusAmount} bonus`} className="text-emerald-600"><Gift className="h-4 w-4" /></span>}
            {!!shift.plannedBreakMinutes && <span title={`${shift.plannedBreakMinutes} min ${shift.breakPaid ? "paid" : "unpaid"} break`} className="text-slate-500"><Timer className="h-4 w-4" /></span>}
          </div>
        );
      case "date":
        return (
          <span className="whitespace-nowrap">
            <span className="font-medium">{format(parseISO(shift.date), "EEE")}</span>{" "}
            <span className="text-muted-foreground">{format(parseISO(shift.date), "d MMM yyyy")}</span>
          </span>
        );
      case "in":
        return (
          <span className="flex flex-col tabular-nums">
            {formatTime(shift.startTime)}
            {shift.clockInTime && (
              <span title="Clocked in" className="mt-0.5 inline-flex w-fit items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 text-[11px] text-emerald-700">
                <LogIn className="h-3 w-3" />{formatTime(new Date(shift.clockInTime).toISOString())}
              </span>
            )}
          </span>
        );
      case "out":
        return (
          <span className="flex flex-col tabular-nums">
            <span className="flex items-center gap-1">{endsNextDay(shift) && <Moon className="h-3 w-3 text-violet-500" aria-label="Next day" />}{formatTime(shift.endTime)}</span>
            {endsNextDay(shift) && <span className="text-[11px] text-muted-foreground">{format(new Date(shift.endTime), "EEE d MMM")}</span>}
            {shift.clockOutTime && (
              <span title="Clocked out" className="mt-0.5 inline-flex w-fit items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 text-[11px] text-emerald-700">
                <LogOut className="h-3 w-3" />{formatTime(new Date(shift.clockOutTime).toISOString())}
              </span>
            )}
          </span>
        );
      case "shiftType": {
        const t = resolveShiftType(shift, types);
        return (
          <span className="flex flex-col gap-1 whitespace-nowrap">
            <span className="h-1 w-5 rounded-full" style={{ background: t.colour }} />
            {t.name}
          </span>
        );
      }
      case "trackers":
        return <Trackers x={extrasFor(shift.id)} />;
      case "address":
        return (
          <span className="block max-w-[180px] text-xs">
            <span className="block truncate" title={shift.address}>{shift.address ?? <span className="text-muted-foreground">Client&apos;s address</span>}</span>
            {shift.dropoffAddress && <span className="block truncate text-muted-foreground" title={shift.dropoffAddress}>Drop-off: {shift.dropoffAddress}</span>}
          </span>
        );
      case "participant":
        return <span className="truncate block max-w-[160px]" title={shift.clientName}>{shift.clientName ?? "—"}</span>;
      case "supportWorker":
        const canAssign = !isLocked(shift);
        return (
          <Select
            disabled={!canAssign}
            value={shift.caregiverId ?? ""}
            onValueChange={async (value) => {
              if (value === "__unassign__") {
                await logActivity(shift.id, 'unassigned');
                onBulkUnassign?.([shift.id]);
                return;
              }
              const { warnings } = await checkAssignmentEligibility(shift, value);
              if (warnings.length > 0) {
                setAssignWarnings(warnings);
                setAssignDialog({ open: true, shift });
                setAssignWorkerId(value);
              } else {
                await logActivity(shift.id, 'assigned', value);
                onBulkAssign?.([shift.id], value);
              }
            }}
          >
            <SelectTrigger className={`h-8 w-full ${!shift.caregiverId ? 'border-amber-300 bg-amber-50' : ''}`}>
              <SelectValue placeholder={shift.caregiverName ?? "Unassigned"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassign__">Unassigned</SelectItem>
              {caregivers?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "supportItem":
        return <span className="truncate block max-w-[140px]" title={shift.supportFamily}>{shift.supportFamily ?? "—"}</span>;
      case "hours":
        return <span className="tabular-nums">{shiftHours(shift).toFixed(1)}</span>;
      case "valueExGst": {
        const v = extrasFor(shift.id).value;
        return <span className="tabular-nums">{v ? `$${v.toFixed(2)}` : "—"}</span>;
      }
      case "status":
        return statusBadge(shift.status);
      case "approved":
        return shift.approvedAt ? (
          <CheckSquare className="h-4 w-4 text-green-600" />
        ) : (
          <SquareIcon className="h-4 w-4 text-slate-300" />
        );
      case "additionalInfo":
        return <span className="truncate block max-w-[160px]" title={shift.notes}>{shift.notes ?? "—"}</span>;
      case "actions":
        const locked = isLocked(shift);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings2 className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              {(shift.status === "Scheduled" || shift.status === "Late") && (
                <DropdownMenuItem onClick={() => onStart?.(shift)} disabled={locked}>
                  <Play className="mr-2 h-4 w-4" /> Start
                </DropdownMenuItem>
              )}
              {shift.status === "In Progress" && (
                <DropdownMenuItem onClick={() => onStop?.(shift)}>
                  <Square className="mr-2 h-4 w-4" /> Stop
                </DropdownMenuItem>
              )}
              {!shift.approvedAt && shift.status !== "Cancelled" && (
                <DropdownMenuItem onClick={() => onApprove?.(shift)}>
                  <CheckCheck className="mr-2 h-4 w-4" /> Approve
                </DropdownMenuItem>
              )}
              {!locked && (
                <DropdownMenuItem onClick={() => openCancel(shift)}>
                  <Ban className="mr-2 h-4 w-4" /> Cancel
                </DropdownMenuItem>
              )}
              {!locked && onEdit && (
                <DropdownMenuItem onClick={() => onEdit(shift)}>
                  <FileEdit className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onNotes?.(shift)}>
                <StickyNote className="mr-2 h-4 w-4" /> Notes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onIncidents?.(shift)}>
                <AlertTriangle className="mr-2 h-4 w-4" /> Incidents
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onHistory?.(shift)}>
                <History className="mr-2 h-4 w-4" /> History
              </DropdownMenuItem>
              {!shift.caregiverId && shift.status === "Scheduled" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Unassigned actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => openFindWorker(shift)}>
                    <UserSearch className="mr-2 h-4 w-4" /> Find staff
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePublish(shift.id)} disabled={publishingIds.has(shift.id)}>
                    <Users className="mr-2 h-4 w-4" /> {publishingIds.has(shift.id) ? 'Publishing…' : 'Publish'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSms(shift)} disabled={smsTargetIds.has(shift.id)}>
                    <Siren className="mr-2 h-4 w-4" /> {smsTargetIds.has(shift.id) ? 'SMS sent' : 'SMS staff'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="Which shifts">
          {(["upcoming", "past", "all"] as const).map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={when === w}
              onClick={() => { setWhen(w); setSortAsc(w !== "past"); }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-all ${when === w ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Find shifts..."
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            className="pl-8"
          />
          {globalQuery && (
            <Button variant="ghost" size="icon" className="absolute right-1 top-1.5 h-7 w-7" onClick={() => setGlobalQuery("")}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom && dateTo
                ? `${format(dateFrom, "dd/MM/yyyy")} - ${format(dateTo, "dd/MM/yyyy")}`
                : dateFrom
                ? `From ${format(dateFrom, "dd/MM/yyyy")}`
                : "Date range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-3 space-y-2">
              <Select value={datePreset} onValueChange={(v) => applyPreset(v as DateRangePreset)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Preset" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">From</label>
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">To</label>
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setDatePreset("today"); }}>Clear</Button>
                <Button size="sm" onClick={() => applyPreset(datePreset)}>Apply</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center border rounded-md">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-slate-700"}`}
            onClick={() => setViewMode("list")}
            aria-label="List view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm ${viewMode === "calendar" ? "bg-primary text-primary-foreground" : "text-slate-700"}`}
            onClick={() => setViewMode("calendar")}
            aria-label="Calendar view"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </div>
        <DropdownMenu open={colSettingsOpen} onOpenChange={setColSettingsOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="mr-2 h-4 w-4" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Show / Hide columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {columns.filter((c) => c.key !== "select" && c.key !== "actions").map((col) => (
              <DropdownMenuItem key={col.key} onSelect={() => toggleColumn(col.key)}>
                <Checkbox checked={col.visible} className="mr-2" />
                {col.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Reorder</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {columns.filter((c) => c.key !== "select" && c.key !== "actions").map((col) => (
                  <div key={col.key} className="flex items-center gap-2 px-2 py-1">
                    <span className="flex-1 text-sm">{col.label}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveColumn(col.key, -1)}>
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveColumn(col.key, 1)}>
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">Bulk actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Assign / Unassign</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => {/* TODO: open assign worker dialog */}}>
                <UserPlus className="mr-2 h-4 w-4" /> Assign worker
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkUnassign?.(Array.from(selectedIds))}>
                <UserMinus className="mr-2 h-4 w-4" /> Unassign
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onBulkApprove?.(Array.from(selectedIds))}>
                <CheckCheck className="mr-2 h-4 w-4" /> Approve
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkCancelOpen(true)}>
                <Ban className="mr-2 h-4 w-4" /> Cancel with / without pay
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Other</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => {/* TODO: open support item dialog */}}>
                <Package className="mr-2 h-4 w-4" /> Change support item
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkDelete?.(Array.from(selectedIds))} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkPublish?.(Array.from(selectedIds))}>
                <CheckCheck className="mr-2 h-4 w-4" /> Publish
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedIds(new Set())}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {viewMode === "list" && (
        <div className="space-y-2 md:hidden" data-testid="shift-cards">
          {pageData.length === 0 ? (
            <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">No shifts found.</p>
          ) : (
            pageData.map((shift, i) => {
              const newDay = i === 0 || pageData[i - 1].date !== shift.date;
              return (
                <React.Fragment key={shift.id}>
                  {newDay && (
                    <p className="px-1 pt-2 text-sm font-semibold">{format(parseISO(shift.date), "EEEE d MMMM")}</p>
                  )}
                  <div className={cn("flex items-start gap-3 rounded-lg border bg-card p-3 shadow-sm", statusRowClass(shift.status))}>
                    <Checkbox
                      className="mt-1"
                      checked={selectedIds.has(shift.id)}
                      onCheckedChange={() => toggleSelect(shift.id)}
                      aria-label={`Select shift ${shift.shiftId}`}
                    />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit?.(shift)}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold tabular-nums">
                          {formatTime(shift.startTime)}-{formatTime(shift.endTime)}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{shiftHours(shift).toFixed(1)} h</span>
                        </span>
                        <span className="shrink-0">{statusBadge(shift.status)}</span>
                      </div>
                      <p className="mt-1 break-words text-sm">{shift.clientName ?? "No client"}</p>
                      <p className={cn("break-words text-sm", shift.caregiverId ? "text-muted-foreground" : "font-medium text-amber-700")}>
                        {shift.caregiverName ?? "Unassigned"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {(() => { const t = resolveShiftType(shift, types); return (
                          <Badge variant="outline" className="gap-1 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: t.colour }} />{t.name}</Badge>
                        ); })()}
                        {shift.isSleepover && <Badge variant="outline" className="text-xs">Sleep</Badge>}
                        {!!shift.bonusAmount && <Badge variant="outline" className="border-emerald-300 text-xs text-emerald-700">${shift.bonusAmount} bonus</Badge>}
                        {shift.clockInTime && <Badge variant="outline" className="text-xs">In {formatTime(new Date(shift.clockInTime).toISOString())}</Badge>}
                      </div>
                    </button>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      )}

      {viewMode === "list" ? (
        <div ref={printRef} className="hidden rounded-md border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((col) => (
                  <TableHead key={col.key} style={{ width: col.width }}>
                    {col.key === "select" ? (
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          if (el) (el as HTMLInputElement).indeterminate = someSelected;
                        }}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    ) : col.key === "date" ? (
                      <button
                        type="button"
                        onClick={() => setSortAsc((v) => !v)}
                        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                        aria-label={sortAsc ? "Date, oldest first. Click for newest first" : "Date, newest first. Click for oldest first"}
                      >
                        Date <span aria-hidden>{sortAsc ? "↑" : "↓"}</span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/50">
                {visibleColumns.map((col) => (
                  <TableCell key={col.key + "-filter"}>
                    {col.key === "date" && (
                      <Input
                        placeholder="Filter date"
                        className="h-8 text-xs"
                        value={dateFrom ? format(dateFrom, "dd/MM/yyyy") : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) setDateFrom(new Date(v));
                          else setDateFrom(undefined);
                        }}
                      />
                    )}
                    {col.key === "status" && (
                      <Select
                        value=""
                        onValueChange={(val) => {
                          if (val === "all") {
                            setGlobalQuery((q) => q);
                          } else {
                            setGlobalQuery((q) => (q ? `${q} ${val}` : val));
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Filter status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="Scheduled">Scheduled</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                          <SelectItem value="Late">Late</SelectItem>
                          <SelectItem value="Cancelled">Cancelled</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {col.key === "participant" && (
                      <Input placeholder="Filter client" className="h-8 text-xs" value={clientQ} onChange={(e) => setClientQ(e.target.value)} aria-label="Filter by client" />
                    )}
                    {col.key === "supportWorker" && (
                      <Input placeholder="Filter staff" className="h-8 text-xs" value={workerQ} onChange={(e) => setWorkerQ(e.target.value)} aria-label="Filter by staff" />
                    )}
                    {col.key === "shiftType" && (
                      <Select value={typeFilter || "all"} onValueChange={(val) => setTypeFilter(val === "all" ? "" : val)}>
                        <SelectTrigger className="h-8 text-xs" aria-label="Filter by shift type"><SelectValue placeholder="Filter type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All types</SelectItem>
                          {types.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: t.colour }} />{t.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className="h-24 text-center text-muted-foreground">
                    No shifts found.
                  </TableCell>
                </TableRow>
              ) : (
                pageData.map((shift, i) => {
                  const newDay = i === 0 || pageData[i - 1].date !== shift.date;
                  const dayCount = newDay ? pageData.filter((x) => x.date === shift.date).length : 0;
                  return (
                    <React.Fragment key={shift.id}>
                      {newDay && (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={visibleColumns.length} className="py-2">
                            <span className="text-sm font-semibold">{format(parseISO(shift.date), "EEEE d MMMM yyyy")}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{dayCount} shift{dayCount === 1 ? "" : "s"}</span>
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className={statusRowClass(shift.status)}>
                        {visibleColumns.map((col) => (
                          <TableCell key={col.key}>{renderCell(shift, col)}</TableCell>
                        ))}
                      </TableRow>
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-md border bg-white" style={{ height: "600px" }}>
          <RBC
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "100%" }}
            onSelectEvent={handleSelectEvent}
            views={["month", "week", "day", "agenda"]}
            defaultView="week"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="tabular-nums">
            Showing {showingFrom} to {showingTo} of {totalFiltered}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v) as PageSize)}
          >
            <SelectTrigger className="h-8 w-[6.75rem] whitespace-nowrap" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(0)} disabled={safePage === 0}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 tabular-nums">Page {safePage + 1} of {totalPages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CancelShiftDialog
        open={cancelDialog.open}
        summary={cancelDialog.shift ? `${cancelDialog.shift.clientName} on ${cancelDialog.shift.date}` : undefined}
        onOpenChange={(o) => !o && setCancelDialog({ open: false, shift: null })}
        onConfirm={confirmCancel}
      />
      <CancelShiftDialog open={bulkCancelOpen} count={selectedIds.size} onOpenChange={setBulkCancelOpen} onConfirm={confirmBulkCancel} />

      <AlertDialog open={assignDialog.open} onOpenChange={(o) => !o && setAssignDialog({ open: false, shift: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assignment warnings</AlertDialogTitle>
            <AlertDialogDescription>
              {assignWarnings.map((w) => (
                <p key={w} className="text-sm text-amber-700">• {w}</p>
              ))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            <Input
              placeholder="Override reason (required)"
              value={assignOverrideReason}
              onChange={(e) => setAssignOverrideReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setAssignDialog({ open: false, shift: null }); setAssignOverrideReason(""); }}>Back</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (assignDialog.shift && assignWorkerId) {
                await logActivity(assignDialog.shift.id, 'assigned_with_override', assignOverrideReason);
                onBulkAssign?.([assignDialog.shift.id], assignWorkerId);
              }
              setAssignDialog({ open: false, shift: null });
              setAssignOverrideReason("");
            }} disabled={!assignOverrideReason.trim()}>
              Assign anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activityLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activity log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {activityLog.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span>{entry.action} on {entry.shiftId}</span>
                  {entry.reason && <span className="text-xs text-muted-foreground">{entry.reason}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 5: Worker suggestion sheet for unassigned shifts */}
      <Sheet open={!!findWorkerShiftId} onOpenChange={(open) => { if (!open) { setFindWorkerShiftId(null); setSuggestions([]); } }}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Suggested workers</SheetTitle>
            <SheetDescription>
              {findWorkerShift
                ? `Ranked candidates for ${findWorkerShift.clientName ?? 'this client'} on ${format(parseISO(findWorkerShift.date), 'dd MMM yyyy')}`
                : 'Loading…'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {suggestionsLoading && <p className="text-sm text-muted-foreground py-4 text-center">Finding available workers…</p>}
            {!suggestionsLoading && suggestions.length === 0 && !suggestionsLoading && (
              <p className="text-sm text-muted-foreground py-4 text-center">No eligible workers found for this shift.</p>
            )}
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-2 pr-4">
                {suggestions.map((w) => (
                  <Card key={w.caregiverId} className="border-l-4 border-l-green-400">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{w.name}</p>
                        <Badge variant="secondary" className="text-xs">score {w.score}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {w.inducted && <Badge className="bg-green-100 text-green-800 text-xs">Inducted</Badge>}
                        {w.preferred && <Badge className="bg-blue-100 text-blue-800 text-xs">Preferred</Badge>}
                        <Badge variant="outline" className="text-xs">{w.availability}</Badge>
                        <Badge variant="outline" className="text-xs">{w.hoursThisWeek.toFixed(1)} h this week</Badge>
                        {w.distanceKm !== null && <Badge variant="outline" className="text-xs">{w.distanceKm.toFixed(1)} km away</Badge>}
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleAssignFromList(w.caregiverId)}
                      >
                        <Check className="mr-2 h-4 w-4" /> Assign
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
