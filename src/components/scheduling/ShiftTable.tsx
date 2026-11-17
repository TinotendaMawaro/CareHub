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
} from "lucide-react";
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
  { key: "date", label: "Date", visible: true, width: 110 },
  { key: "in", label: "In", visible: true, width: 80 },
  { key: "out", label: "Out", visible: true, width: 80 },
  { key: "shiftType", label: "Shift type", visible: true, width: 110 },
  { key: "participant", label: "Participant", visible: true, width: 160 },
  { key: "supportWorker", label: "Support worker", visible: true, width: 160 },
  { key: "supportItem", label: "Support item", visible: true, width: 140 },
  { key: "hours", label: "Hours", visible: true, width: 70 },
  { key: "valueExGst", label: "Value ex GST", visible: true, width: 100 },
  { key: "status", label: "Status", visible: true, width: 130 },
  { key: "approved", label: "Approved", visible: true, width: 90 },
  { key: "additionalInfo", label: "Additional information", visible: true, width: 160 },
  { key: "actions", label: "Actions", visible: true, width: 60 },
];

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

function shiftTypeLabel(shift: Shift): ShiftType {
  if (shift.isSleepover) return "Sleepover";
  if (shift.supportFamily) return "Indirect";
  return "On Site";
}

interface ShiftTableProps {
  shifts: Shift[];
  caregivers?: any[];
  onStart?: (shift: Shift) => void;
  onStop?: (shift: Shift) => void;
  onApprove?: (shift: Shift) => void;
  onCancel?: (shift: Shift, opts: { withoutPay: boolean; reason: string }) => void;
  onEdit?: (shift: Shift) => void;
  onNotes?: (shift: Shift) => void;
  onIncidents?: (shift: Shift) => void;
  onHistory?: (shift: Shift) => void;
  onBulkAssign?: (ids: string[], caregiverId: string) => void;
  onBulkUnassign?: (ids: string[]) => void;
  onBulkChangeSupportItem?: (ids: string[], supportItem: string) => void;
  onBulkApprove?: (ids: string[]) => void;
  onBulkCancel?: (ids: string[], withoutPay: boolean, reason: string) => void;
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
  const [globalQuery, setGlobalQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<DateRangePreset>("today");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [colSettingsOpen, setColSettingsOpen] = useState(false);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [cancelWithoutPay, setCancelWithoutPay] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkCancelWithoutPay, setBulkCancelWithoutPay] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState("");
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
    return result;
  }, [shifts, globalQuery, dateFrom, dateTo]);

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
  }, [globalQuery, dateFrom, dateTo, pageSize]);

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
      .map((c) => c.label)
      .join(",");
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
              return shiftTypeLabel(s);
            case "participant":
              return s.clientName ?? "";
            case "supportWorker":
              return s.caregiverName ?? "";
            case "supportItem":
              return s.supportFamily ?? "";
            case "hours":
              return String(shiftHours(s));
            case "valueExGst":
              return "";
            case "status":
              return s.status ?? "";
            case "approved":
              return "";
            case "additionalInfo":
              return s.notes ?? "";
            case "flags":
              return s.isSleepover ? "Sleepover" : "";
            default:
              return "";
          }
        })
        .join(",")
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shifts-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
  const confirmCancel = () => {
    if (cancelDialog.shift && onCancel) {
      onCancel(cancelDialog.shift, { withoutPay: cancelWithoutPay, reason: cancelReason });
    }
    setCancelDialog({ open: false, shift: null });
    setCancelWithoutPay(false);
    setCancelReason("");
  };

  const confirmBulkCancel = () => {
    if (onBulkCancel && selectedIds.size > 0) {
      onBulkCancel(Array.from(selectedIds), bulkCancelWithoutPay, bulkCancelReason);
    }
    setBulkCancelOpen(false);
    setBulkCancelWithoutPay(false);
    setBulkCancelReason("");
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
            {shift.isSleepover && <Badge variant="outline" className="text-xs">Sleep</Badge>}
            {shift.supportFamily && <Badge variant="outline" className="text-xs">Indirect</Badge>}
          </div>
        );
      case "date":
        return <span className="whitespace-nowrap">{format(new Date(shift.date), "dd/MM/yyyy")}</span>;
      case "in":
        return <span className="tabular-nums">{formatTime(shift.startTime)}</span>;
      case "out":
        return <span className="tabular-nums">{formatTime(shift.endTime)}</span>;
      case "shiftType":
        return <span className="whitespace-nowrap">{shiftTypeLabel(shift)}</span>;
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
      case "valueExGst":
        return <span className="tabular-nums">—</span>;
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
                    <UserSearch className="mr-2 h-4 w-4" /> Find worker
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePublish(shift.id)} disabled={publishingIds.has(shift.id)}>
                    <Users className="mr-2 h-4 w-4" /> {publishingIds.has(shift.id) ? 'Publishing…' : 'Publish'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSms(shift)} disabled={smsTargetIds.has(shift.id)}>
                    <Siren className="mr-2 h-4 w-4" /> {smsTargetIds.has(shift.id) ? 'SMS sent' : 'SMS worker'}
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

      {viewMode === "list" ? (
        <div ref={printRef} className="rounded-md border">
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
                      <Input placeholder="Filter participant" className="h-8 text-xs" />
                    )}
                    {col.key === "supportWorker" && (
                      <Input placeholder="Filter worker" className="h-8 text-xs" />
                    )}
                    {col.key === "shiftType" && (
                      <Select
                        value=""
                        onValueChange={(val) => {
                          setGlobalQuery((q) => (q ? `${q} ${val}` : val));
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Filter type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="On Site">On Site</SelectItem>
                          <SelectItem value="Indirect">Indirect</SelectItem>
                          <SelectItem value="Sleepover">Sleepover</SelectItem>
                          <SelectItem value="Appointment">Appointment</SelectItem>
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
                pageData.map((shift) => (
                  <TableRow key={shift.id} className={statusRowClass(shift.status)}>
                    {visibleColumns.map((col) => (
                      <TableCell key={col.key}>{renderCell(shift, col)}</TableCell>
                    ))}
                  </TableRow>
                ))
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            Showing {showingFrom} to {showingTo} of {totalFiltered}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v) as PageSize)}
          >
            <SelectTrigger className="h-8 w-20">
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

      <AlertDialog open={cancelDialog.open} onOpenChange={(o) => !o && setCancelDialog({ open: false, shift: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel shift</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelDialog.shift
                ? `Cancel shift for ${cancelDialog.shift.clientName} on ${cancelDialog.shift.date}?`
                : "Cancel the selected shift?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              <Checkbox id="without-pay" checked={cancelWithoutPay} onCheckedChange={(v) => setCancelWithoutPay(!!v)} />
              <label htmlFor="without-pay" className="text-sm">Without pay</label>
            </div>
            <Input
              placeholder="Cancellation reason (required)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} disabled={!cancelReason.trim()}>
              Cancel shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel selected shifts</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size} shift{selectedIds.size !== 1 ? "s" : ""} will be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              <Checkbox id="bulk-without-pay" checked={bulkCancelWithoutPay} onCheckedChange={(v) => setBulkCancelWithoutPay(!!v)} />
              <label htmlFor="bulk-without-pay" className="text-sm">Without pay</label>
            </div>
            <Input
              placeholder="Cancellation reason (required)"
              value={bulkCancelReason}
              onChange={(e) => setBulkCancelReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkCancel} disabled={!bulkCancelReason.trim()}>
              Cancel selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                ? `Ranked candidates for ${findWorkerShift.clientName ?? 'this participant'} on ${format(parseISO(findWorkerShift.date), 'dd MMM yyyy')}`
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
