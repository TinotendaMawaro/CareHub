"use client";

import * as React from "react";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Users, UserCog, AlertCircle, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, UserPlus, UserSearch, Siren, MessageSquare, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CommandPalette } from "@/components/ui/command-palette";
import { useClients } from "@/hooks/use-clients";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useShifts } from "@/hooks/use-shifts";
import { useToast } from "@/hooks/use-toast";
import type { Client, Caregiver, Shift } from "@/lib/types";
import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import {
  findWorkerSuggestions,
  publishShift,
  sendSmsToWorker,
  type WorkerSuggestion,
} from "@/lib/shiftApi";

const ALPHABET = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type TabValue = "participants" | "workers" | "unassigned";

export default function SchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get("tab") as TabValue) || "participants";
  const idParam = searchParams.get("id") || null;

  const [tab, setTab] = useState<TabValue>(tabParam);
  const [selectedId, setSelectedId] = useState<string | null>(idParam);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [letterFilter, setLetterFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [commandOpen, setCommandOpen] = useState(false);
  const [findWorkerShiftId, setFindWorkerShiftId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WorkerSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [smsTargetId, setSmsTargetId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { clients, loading: clientsLoading } = useClients();
  const { caregivers, loading: caregiversLoading } = useCaregivers();
  const { shifts, loading: shiftsLoading } = useShifts();
  const { toast } = useToast();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab) params.set("tab", tab); else params.delete("tab");
    if (selectedId) params.set("id", selectedId); else params.delete("id");
    router.replace(`/dashboard/schedule?${params.toString()}`, { scroll: false });
  }, [tab, selectedId, router, searchParams]);

  const unassignedCount = useMemo(() => {
    const now = new Date().toISOString();
    return shifts.filter((s) => !s.caregiverId && s.status === "Scheduled" && s.startTime >= now).length;
  }, [shifts]);

  const filteredClients = useMemo(() => {
    let result = clients;
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter((c) => c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    if (letterFilter && letterFilter !== "#") {
      result = result.filter((c) => c.fullName.charAt(0).toUpperCase() === letterFilter);
    } else if (letterFilter === "#") {
      result = result.filter((c) => !/^[A-Z]$/i.test(c.fullName.charAt(0)));
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (areaFilter !== "all") {
      result = result.filter((c) => c.address?.includes(areaFilter));
    }
    return result;
  }, [clients, debouncedQuery, letterFilter, statusFilter, areaFilter]);

  const filteredCaregivers = useMemo(() => {
    let result = caregivers;
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    if (letterFilter && letterFilter !== "#") {
      result = result.filter((c) => c.name.charAt(0).toUpperCase() === letterFilter);
    } else if (letterFilter === "#") {
      result = result.filter((c) => !/^[A-Z]$/i.test(c.name.charAt(0)));
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => c.contractStatus === statusFilter || c.availability === statusFilter);
    }
    if (levelFilter !== "all") {
      result = result.filter((c) => c.qualifications?.includes(levelFilter));
    }
    return result;
  }, [caregivers, debouncedQuery, letterFilter, statusFilter, levelFilter]);

  const filteredUnassigned = useMemo(() => {
    const now = new Date().toISOString();
    return shifts.filter((s) => !s.caregiverId && s.status === "Scheduled" && s.startTime >= now);
  }, [shifts]);

  const selectedClient = useMemo(() => clients.find((c) => c.id === selectedId) ?? null, [clients, selectedId]);
  const selectedCaregiver = useMemo(() => caregivers.find((c) => c.id === selectedId) ?? null, [caregivers, selectedId]);

  const scheduleForSelected = useMemo(() => {
    if (!selectedId) return [];
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    return shifts.filter((s) => {
      if (tab === "participants" && s.clientId !== selectedId) return false;
      if (tab === "workers" && s.caregiverId !== selectedId) return false;
      if (tab === "unassigned" && s.caregiverId !== null) return false;
      const d = parseISO(s.date);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    });
  }, [shifts, selectedId, tab]);

  const quickActions = useMemo(
    () => [
      { title: "Open Schedule", subtitle: "Go to schedule workspace", href: "/dashboard/schedule" },
      { title: "New shift", subtitle: "Create a scheduled shift", href: "/dashboard/scheduling" },
      { title: "View roster", subtitle: "Open weekly roster", href: "/dashboard/roster" },
    ],
    []
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const handleBack = () => setSelectedId(null);

  const letterGroups = useMemo(() => {
    const map = new Map<string, (Client | Caregiver)[]>();
    const source: (Client | Caregiver)[] = tab === "workers" ? filteredCaregivers : filteredClients;
    for (const item of source) {
      const name = "fullName" in item ? item.fullName : item.name;
      const letter = /^[A-Z]$/i.test(name.charAt(0)) ? name.charAt(0).toUpperCase() : "#";
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(item);
    }
    return map;
  }, [filteredClients, filteredCaregivers, tab]);

  function urgencyClass(shift: Shift): { border: string; bg: string; label: string } {
    const hours = (new Date(shift.startTime).getTime() - Date.now()) / 3_600_000;
    if (hours < 0) return { border: "border-slate-300", bg: "", label: "Past" };
    if (hours < 24) return { border: "border-red-400", bg: "bg-red-50/60", label: "< 24 h" };
    if (hours < 72) return { border: "border-amber-400", bg: "bg-amber-50/60", label: "< 72 h" };
    return { border: "border-border", bg: "", label: "" };
  }

  async function openFindWorker(shift: Shift) {
    setFindWorkerShiftId(shift.id);
    setSuggestionsLoading(true);
    setSuggestions([]);
    try {
      const results = await findWorkerSuggestions(shift, caregivers, 10);
      setSuggestions(results);
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to load suggestions", variant: "destructive" });
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function handleAssignFromList(caregiverId: string) {
    if (!findWorkerShiftId) return;
    try {
      const { error } = await supabase
        .from('shifts')
        .update({ caregiver_id: caregiverId, shift_publish_state: 'accepted' })
        .eq('id', findWorkerShiftId);
      if (error) throw error;
      toast({ title: "Worker assigned successfully" });
      setFindWorkerShiftId(null);
      setSuggestions([]);
    } catch (err) {
      console.error(err);
      toast({ title: "Assignment failed", variant: "destructive" });
    }
  }

  async function handlePublish(shiftId: string) {
    setPublishingIds((prev) => new Set(prev).add(shiftId));
    try {
      const ok = await publishShift(shiftId, "admin");
      if (ok) {
        toast({ title: "Shift published", description: "Eligible workers will be notified." });
      } else {
        toast({ title: "Publish failed", variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Publish failed", variant: "destructive" });
    } finally {
      setPublishingIds((prev) => {
        const next = new Set(prev);
        next.delete(shiftId);
        return next;
      });
    }
  }

  async function handleSms(shift: Shift) {
    setSmsTargetId(shift.id);
    try {
      await sendSmsToWorker(shift.id, `Unassigned shift on ${shift.date} needs a worker. Please respond.`);
      toast({ title: "SMS sent", description: `Notification logged for shift ${shift.shiftId}.` });
    } catch {
      toast({ title: "SMS failed", variant: "destructive" });
    } finally {
      setSmsTargetId(null);
    }
  }

  const openFindWorkerShift = useMemo(
    () => shifts.find((s) => s.id === findWorkerShiftId) ?? null,
    [shifts, findWorkerShiftId]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-sm text-muted-foreground">Manage participants, support workers, and unassigned shifts.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCommandOpen(true)}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        items={quickActions.map((a) => ({
          title: a.title,
          subtitle: a.subtitle,
          onSelect: () => { router.push(a.href); },
        }))}
        placeholder="Type a command..."
        emptyMessage="No commands found."
      />

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabValue); setSelectedId(null); }}>
        <TabsList>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="workers">Support workers</TabsTrigger>
          <TabsTrigger value="unassigned">
            Unassigned shifts
            {unassignedCount > 0 && <Badge variant="destructive" className="ml-2">{unassignedCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="participants">
          <div className="flex gap-4">
            <div className={`${selectedId ? "w-1/3" : "w-full"} transition-all`}>
              <div className="space-y-3">
                <Input
                  placeholder="Search participants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="flex flex-wrap gap-1">
                  {ALPHABET.map((l) => (
                    <Button
                      key={l}
                      variant={letterFilter === l ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setLetterFilter(letterFilter === l ? "" : l)}
                    >
                      {l}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={areaFilter} onValueChange={setAreaFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Area / State" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All areas</SelectItem>
                      <SelectItem value="NSW">NSW</SelectItem>
                      <SelectItem value="VIC">VIC</SelectItem>
                      <SelectItem value="QLD">QLD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ScrollArea className="h-[600px] mt-4">
                <div className="space-y-2">
                  {clientsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
                  {!clientsLoading && filteredClients.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No participants found.</p>
                  )}
                  {filteredClients.map((client) => (
                    <Card
                      key={client.id}
                      className={`cursor-pointer transition-colors ${selectedId === client.id ? "border-primary ring-1 ring-primary" : ""}`}
                      onClick={() => handleSelect(client.id)}
                    >
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                            {client.fullName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{client.fullName}</p>
                            <p className="text-xs text-muted-foreground">{client.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">{client.status}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
            {selectedId && selectedClient && (
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <Button variant="ghost" size="icon" onClick={handleBack}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="text-lg font-semibold">{selectedClient.fullName}</h3>
                  <Badge variant="outline">{selectedClient.status}</Badge>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Upcoming shifts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {scheduleForSelected.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No shifts this week.</p>
                    ) : (
                      <div className="space-y-2">
                        {scheduleForSelected.map((shift) => (
                          <div key={shift.id} className="flex items-center justify-between rounded-md border p-3">
                            <div className="flex items-center gap-3">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">{format(parseISO(shift.date), "EEE, dd MMM yyyy")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(parseISO(shift.startTime), "HH:mm")} - {format(parseISO(shift.endTime), "HH:mm")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{shift.status}</Badge>
                              {shift.caregiverName && <span className="text-xs text-muted-foreground">{shift.caregiverName}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="workers">
          <div className="flex gap-4">
            <div className={`${selectedId ? "w-1/3" : "w-full"} transition-all`}>
              <div className="space-y-3">
                <Input placeholder="Search support workers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                <div className="flex flex-wrap gap-1">
                  {ALPHABET.map((l) => (
                    <Button key={l} variant={letterFilter === l ? "default" : "outline"} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setLetterFilter(letterFilter === l ? "" : l)}>
                      {l}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Availability" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="Available">Available</SelectItem>
                      <SelectItem value="Unavailable">Unavailable</SelectItem>
                      <SelectItem value="On Shift">On Shift</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={levelFilter} onValueChange={setLevelFilter}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Level / Cost code" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All levels</SelectItem>
                      <SelectItem value="Certificate III">Certificate III</SelectItem>
                      <SelectItem value="Diploma">Diploma</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ScrollArea className="h-[600px] mt-4">
                <div className="space-y-2">
                  {caregiversLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
                  {!caregiversLoading && filteredCaregivers.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No support workers found.</p>
                  )}
                  {filteredCaregivers.map((cg) => (
                    <Card
                      key={cg.id}
                      className={`cursor-pointer transition-colors ${selectedId === cg.id ? "border-primary ring-1 ring-primary" : ""}`}
                      onClick={() => handleSelect(cg.id)}
                    >
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                            {cg.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{cg.name}</p>
                            <p className="text-xs text-muted-foreground">{cg.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{cg.availability}</Badge>
                          <Badge variant="secondary" className="text-xs">{cg.contractStatus}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
            {selectedId && selectedCaregiver && (
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <Button variant="ghost" size="icon" onClick={handleBack}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="text-lg font-semibold">{selectedCaregiver.name}</h3>
                  <Badge variant="outline">{selectedCaregiver.availability}</Badge>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Upcoming shifts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {scheduleForSelected.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No shifts this week.</p>
                    ) : (
                      <div className="space-y-2">
                        {scheduleForSelected.map((shift) => (
                          <div key={shift.id} className="flex items-center justify-between rounded-md border p-3">
                            <div className="flex items-center gap-3">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">{format(parseISO(shift.date), "EEE, dd MMM yyyy")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(parseISO(shift.startTime), "HH:mm")} - {format(parseISO(shift.endTime), "HH:mm")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{shift.status}</Badge>
                              {shift.clientName && <span className="text-xs text-muted-foreground">{shift.clientName}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="unassigned">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">{unassignedCount} unassigned future shift{unassignedCount !== 1 ? "s" : ""}</span>
            </div>
            {shiftsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!shiftsLoading && filteredUnassigned.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">No unassigned shifts.</CardContent>
              </Card>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredUnassigned.map((shift) => {
                const urgency = urgencyClass(shift);
                const isPublishing = publishingIds.has(shift.id);
                const isSmsTarget = smsTargetId === shift.id;
                return (
                  <Card
                    key={shift.id}
                    className={`cursor-pointer transition-colors border-l-4 ${urgency.border} ${urgency.bg}`}
                    onClick={() => router.push(`/dashboard/scheduling?highlight=${shift.id}`)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{shift.status}</Badge>
                          {urgency.label && <Badge variant="secondary" className="text-xs">{urgency.label}</Badge>}
                          {shift.shiftPublishState && (
                            <Badge className={
                              shift.shiftPublishState === 'offered' ? 'bg-blue-100 text-blue-800' :
                              shift.shiftPublishState === 'accepted' ? 'bg-green-100 text-green-800' :
                              shift.shiftPublishState === 'declined' ? 'bg-red-100 text-red-800' :
                              'bg-amber-100 text-amber-800'
                            }>
                              {shift.shiftPublishState}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{format(parseISO(shift.date), "dd/MM/yyyy")}</span>
                      </div>
                      <p className="text-sm font-medium">{shift.clientName ?? "Unknown participant"}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(parseISO(shift.startTime), "HH:mm")} - {format(parseISO(shift.endTime), "HH:mm")}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{shift.supportFamily ?? "On Site"}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={(e) => { e.stopPropagation(); openFindWorker(shift); }}
                        >
                          <UserSearch className="mr-2 h-4 w-4" /> Find worker
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          disabled={isPublishing}
                          onClick={(e) => { e.stopPropagation(); handlePublish(shift.id); }}
                        >
                          <Users className="mr-2 h-4 w-4" /> {isPublishing ? "Publishing…" : "Publish"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1"
                          disabled={isSmsTarget}
                          onClick={(e) => { e.stopPropagation(); handleSms(shift); }}
                        >
                          <Siren className="mr-2 h-4 w-4" /> {isSmsTarget ? "Sent" : "SMS"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Worker suggestion sheet */}
          <Sheet open={!!findWorkerShiftId} onOpenChange={(open) => { if (!open) { setFindWorkerShiftId(null); setSuggestions([]); } }}>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Suggested workers</SheetTitle>
                <SheetDescription>
                  {openFindWorkerShift
                    ? `Ranked candidates for ${openFindWorkerShift.clientName ?? "this participant"} on {format(parseISO(openFindWorkerShift.date), "dd MMM yyyy")}`
                    : "Loading…"}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                {suggestionsLoading && <p className="text-sm text-muted-foreground py-4 text-center">Finding available workers…</p>}
                {!suggestionsLoading && suggestions.length === 0 && (
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
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Assign
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
