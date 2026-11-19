"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pager, usePaged } from "@/components/ui/pager";
import { useSearchParams } from "next/navigation";
import { Archive, Check, ExternalLink, FileText, FolderOpen, Search, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOrganisation } from "@/hooks/use-organisation";
import { useToast } from "@/hooks/use-toast";
import {
  DOC_ACCEPT, DOC_CATEGORIES, DOC_MAX_BYTES, type DocOwnerKind, type DocumentRow,
  expiryLabel, expiryState, formatBytes, ownerKind, ownerName, storagePath, ymdIn,
} from "@/lib/documents";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";

type Person = { id: string; label: string };
type Filter = "all" | "attention" | "expired" | "expiring" | "pending";

const SELECT = "id,title,category,caregiver_id,client_id,file_path,file_name,mime_type,size_bytes,issue_date,expiry_date,notes,visible_to_staff,status,review_note,archived,created_at,caregivers(name),clients(first_name,last_name)";
const selectCls = "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm";

const OWNER_TABS: { value: DocOwnerKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "caregiver", label: "Staff" },
  { value: "client", label: "Clients" },
  { value: "organisation", label: "Organisation" },
];

function DocumentsHub() {
  const params = useSearchParams();
  const { org } = useOrganisation();
  const { toast } = useToast();
  const today = ymdIn(new Date(), org.timezone);

  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<DocOwnerKind | "all">("all");
  const [filter, setFilter] = useState<Filter>((params.get("filter") as Filter) || "all");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [rejecting, setRejecting] = useState<DocumentRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("documents").select(SELECT).order("created_at", { ascending: false }).limit(1000);
    if (error) toast({ title: "Could not load documents", description: error.message, variant: "destructive" });
    setDocs((data ?? []) as unknown as DocumentRow[]);
    setLoaded(true);
  }, [toast]);

  useEffect(() => {
    void load();
    return subscribeToTable("documents", () => void load());
  }, [load]);

  const live = useMemo(() => docs.filter((d) => d.archived === showArchived), [docs, showArchived]);
  const counts = useMemo(() => {
    const c = { expired: 0, expiring: 0, pending: 0 };
    for (const d of docs) {
      if (d.archived) continue;
      if (d.status === "pending_review") c.pending++;
      if (d.status === "rejected") continue;
      const s = expiryState(d.expiry_date, today);
      if (s === "expired") c.expired++;
      if (s === "expiring") c.expiring++;
    }
    return c;
  }, [docs, today]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return live.filter((d) => {
      if (tab !== "all" && ownerKind(d) !== tab) return false;
      const s = expiryState(d.expiry_date, today);
      if (filter === "pending" && d.status !== "pending_review") return false;
      if (filter === "expired" && (s !== "expired" || d.status === "rejected")) return false;
      if (filter === "expiring" && (s !== "expiring" || d.status === "rejected")) return false;
      if (filter === "attention" && !(d.status === "pending_review" || (d.status !== "rejected" && (s === "expired" || s === "expiring")))) return false;
      if (q && ![d.title, d.category, d.file_name, ownerName(d)].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [live, tab, filter, search, today]);

  async function open(d: DocumentRow) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 300);
    if (error || !data) return toast({ title: "Could not open the file", description: error?.message, variant: "destructive" });
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function update(d: DocumentRow, patch: Partial<DocumentRow>, done: string) {
    const { error } = await supabase.from("documents").update(patch).eq("id", d.id);
    if (error) return toast({ title: "Could not update", description: error.message, variant: "destructive" });
    toast({ title: done });
    await load();
  }

  const chip = (key: Filter, label: string, n: number, tone: string) => (
    <button
      onClick={() => setFilter(filter === key ? "all" : key)}
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left transition-all hover:shadow-md ${filter === key ? "border-primary ring-2 ring-primary/20" : "bg-card"}`}
    >
      <span className={`text-2xl font-semibold tabular-nums ${n > 0 ? tone : "text-muted-foreground"}`}>{n}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </button>
  );

  const paged = usePaged(shown, 20, shown.length);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">Worker checks and certificates, client plans and agreements, and your policies, with expiry tracking.</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}><Upload className="mr-1 h-4 w-4" />Upload document</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {chip("expired", "Expired", counts.expired, "text-destructive")}
        {chip("expiring", "Expiring in 30 days", counts.expiring, "text-amber-600")}
        {chip("pending", "Waiting for review", counts.pending, "text-primary")}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>{OWNER_TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
            </Tabs>
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search title, category or person" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="flex h-10 w-auto rounded-lg border border-input bg-card px-3 text-sm shadow-sm" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter">
              <option value="all">Any status</option>
              <option value="attention">Needs attention</option>
              <option value="expired">Expired</option>
              <option value="expiring">Expiring soon</option>
              <option value="pending">Waiting for review</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={showArchived} onCheckedChange={(v) => setShowArchived(!!v)} />Archived
            </label>
          </div>

          {loaded && shown.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-10 w-10" />}
              title={docs.length === 0 ? "No documents yet" : "Nothing matches"}
              description={docs.length === 0 ? "Upload screening checks, first aid certificates, NDIS plans and policies to track them in one place." : "Try another tab, filter or search."}
              action={docs.length === 0 ? <Button variant="outline" onClick={() => setUploadOpen(true)}>Upload the first one</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Document</TableHead><TableHead>Belongs to</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {paged.rows.map((d) => {
                    const s = expiryState(d.expiry_date, today);
                    const kind = ownerKind(d);
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="max-w-[320px]">
                          <div className="flex items-start gap-2">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{d.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{d.category} · {d.file_name}{d.size_bytes ? ` · ${formatBytes(d.size_bytes)}` : ""}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{ownerName(d)}</p>
                          <p className="text-xs text-muted-foreground">
                            {kind === "caregiver" ? "Staff" : kind === "client" ? "Client" : "Organisation"}
                            {kind !== "caregiver" && d.visible_to_staff ? " · shared with workers" : ""}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={s === "expired" ? "border-destructive/40 text-destructive" : s === "expiring" ? "border-amber-300 text-amber-700" : "text-muted-foreground"}
                          >
                            {expiryLabel(d.expiry_date, today)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {d.status === "pending_review" && <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Waiting for review</Badge>}
                          {d.status === "approved" && <span className="text-sm text-emerald-700">Approved</span>}
                          {d.status === "rejected" && <span className="text-sm text-destructive" title={d.review_note ?? ""}>Rejected</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {d.status === "pending_review" && (
                              <>
                                <Button size="sm" variant="outline" className="h-8" onClick={() => void update(d, { status: "approved", review_note: null }, "Approved")}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => setRejecting(d)}><X className="mr-1 h-3.5 w-3.5" />Reject</Button>
                              </>
                            )}
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => void open(d)} aria-label={`Open ${d.title}`}><ExternalLink className="h-3.5 w-3.5" /></Button>
                            <Button
                              size="sm" variant="ghost" className="h-8"
                              aria-label={d.archived ? "Restore" : "Archive"} title={d.archived ? "Restore" : "Archive"}
                              onClick={() => void update(d, { archived: !d.archived }, d.archived ? "Restored" : "Archived")}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pager {...paged.pager} />
            </div>
          )}
        </CardContent>
      </Card>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} defaultKind={tab === "all" ? "caregiver" : tab} onDone={load} />
      <RejectDialog doc={rejecting} onClose={() => setRejecting(null)} onReject={(d, note) => update(d, { status: "rejected", review_note: note || null }, "Rejected")} />
    </div>
  );
}

function RejectDialog({ doc, onClose, onReject }: { doc: DocumentRow | null; onClose: () => void; onReject: (d: DocumentRow, note: string) => Promise<unknown> }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={!!doc} onOpenChange={(o) => { if (!o) { onClose(); setNote(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {doc?.title}</DialogTitle>
          <DialogDescription>The staff member sees this reason in the app and can upload a new copy.</DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the photo is blurry, or this check has expired" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={async () => { if (doc) await onReject(doc, note.trim()); setNote(""); onClose(); }}>Reject</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open, onOpenChange, defaultKind, onDone,
}: { open: boolean; onOpenChange: (o: boolean) => void; defaultKind: DocOwnerKind; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<DocOwnerKind>(defaultKind);
  const [people, setPeople] = useState<{ caregiver: Person[]; client: Person[] }>({ caregiver: [], client: [] });
  const [ownerId, setOwnerId] = useState("");
  const [category, setCategory] = useState(DOC_CATEGORIES[defaultKind][0]);
  const [title, setTitle] = useState("");
  const [issue, setIssue] = useState("");
  const [expiry, setExpiry] = useState("");
  const [visible, setVisible] = useState(true);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setKind(defaultKind);
    setCategory(DOC_CATEGORIES[defaultKind][0]);
    setOwnerId(""); setTitle(""); setIssue(""); setExpiry(""); setNotes(""); setFile(null); setVisible(true);
    void Promise.all([
      supabase.from("caregivers").select("id,name").order("name"),
      supabase.from("clients").select("id,first_name,last_name").order("first_name"),
    ]).then(([cg, cl]) => setPeople({
      caregiver: (cg.data ?? []).map((r: any) => ({ id: r.id, label: r.name })),
      client: (cl.data ?? []).map((r: any) => ({ id: r.id, label: [r.first_name, r.last_name].filter(Boolean).join(" ") })),
    }));
  }, [open, defaultKind]);

  const changeKind = (k: DocOwnerKind) => { setKind(k); setOwnerId(""); setCategory(DOC_CATEGORIES[k][0]); };
  const badDates = !!issue && !!expiry && expiry < issue;
  const ready = !!file && (kind === "organisation" || !!ownerId) && !badDates && !busy;

  async function submit() {
    if (!file) return;
    if (file.size > DOC_MAX_BYTES) return toast({ title: "File is over 20 MB", variant: "destructive" });
    setBusy(true);
    const path = storagePath("office", file.name);
    try {
      const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("documents").insert({
        title: title.trim() || category,
        category,
        caregiver_id: kind === "caregiver" ? ownerId : null,
        client_id: kind === "client" ? ownerId : null,
        file_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        issue_date: issue || null,
        expiry_date: expiry || null,
        notes: notes.trim() || null,
        visible_to_staff: kind === "caregiver" ? false : visible,
        status: "approved",
      });
      if (error) {
        await supabase.storage.from("documents").remove([path]);
        throw error;
      }
      toast({ title: "Document uploaded" });
      onOpenChange(false);
      await onDone();
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>PDF, photo or Word file up to 20 MB. Add an expiry date to get reminders before it lapses.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Belongs to</Label>
            <select className={selectCls} value={kind} onChange={(e) => changeKind(e.target.value as DocOwnerKind)}>
              <option value="caregiver">A staff member</option>
              <option value="client">A client</option>
              <option value="organisation">The organisation</option>
            </select>
          </div>
          {kind !== "organisation" ? (
            <div>
              <Label>{kind === "caregiver" ? "Staff" : "Client"}</Label>
              <select className={selectCls} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Owner">
                <option value="">Choose...</option>
                {people[kind].map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          ) : <div />}
          <div>
            <Label>Category</Label>
            <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              {DOC_CATEGORIES[kind].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category} /></div>
          <div><Label>Issue date</Label><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
          <div>
            <Label>Expiry date</Label>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Expiry date" />
            {badDates && <p className="mt-1 text-xs text-destructive">Expiry is before the issue date.</p>}
          </div>
          <div className="sm:col-span-2">
            <Label>File</Label>
            <input ref={fileRef} type="file" accept={DOC_ACCEPT} className="hidden" data-testid="doc-file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            <Button type="button" variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />{file ? `${file.name} (${formatBytes(file.size)})` : "Choose a file"}
            </Button>
          </div>
          {kind !== "caregiver" && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <Checkbox checked={visible} onCheckedChange={(v) => setVisible(!!v)} />
              <span>
                <b>Share with staff</b><br />
                <span className="text-muted-foreground">
                  {kind === "client" ? "Workers on this client's team, or rostered with them in the next two weeks, can read it in the app." : "Every staff member can read it in the app."}
                </span>
              </span>
            </label>
          )}
          <div className="sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!ready}>{busy ? "Uploading..." : "Upload"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={null}>
      <DocumentsHub />
    </Suspense>
  );
}
