"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useClients } from "@/hooks/use-clients";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import type { OnboardingTask } from "@/lib/types";

const mapTask = (r: any): OnboardingTask => ({
  id: r.id, subjectType: r.subject_type, profileId: r.profile_id ?? undefined, clientId: r.client_id ?? undefined,
  stepKey: r.step_key, title: r.title, description: r.description ?? undefined, kind: r.kind, documentKind: r.document_kind ?? undefined,
  required: r.required, status: r.status, data: r.data ?? {}, fileUrl: r.file_url ?? undefined, reviewNote: r.review_note ?? undefined,
});

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    m.set(k, [...(m.get(k) ?? []), item]);
  }
  return m;
}

const tone: Record<string, string> = { todo: "text-slate-500", submitted: "text-amber-600", approved: "text-emerald-600", rejected: "text-red-600" };

export default function OnboardingPage() {
  const { toast } = useToast();
  const { caregivers } = useCaregivers();
  const { clients } = useClients();
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [docs, setDocs] = useState<{ id: string; kind: string; title: string; audience: string }[]>([]);
  const [signer, setSigner] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [t, d] = await Promise.all([
      supabase.from("onboarding_tasks").select("*").order("created_at"),
      supabase.from("legal_documents").select("id,kind,title,audience,version").eq("active", true).order("version", { ascending: false }),
    ]);
    setTasks((t.data ?? []).map(mapTask));
    setDocs(d.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fail = (title: string, e: unknown) => toast({ title, description: (e instanceof Error ? e.message : String(e)).replace(/^[a-z_]+: /, ""), variant: "destructive" });

  async function start(profileId?: string, clientId?: string) {
    const { error } = await supabase.rpc("start_onboarding", { p_profile: profileId ?? null, p_client: clientId ?? null });
    if (error) return fail("Could not start onboarding", error);
    toast({ title: "Onboarding checklist created" });
    await load();
  }

  async function review(id: string, approve: boolean) {
    const note = approve ? null : window.prompt("What needs fixing?");
    if (!approve && !note) return;
    const { error } = await supabase.rpc("review_onboarding_task", { p_task: id, p_approve: approve, p_note: note });
    if (error) return fail("Could not review", error);
    await load();
  }

  async function markDone(id: string) {
    const { error } = await supabase.rpc("submit_onboarding_task", { p_task: id, p_data: {}, p_file_url: null });
    if (error) return fail("Could not update", error);
    await load();
  }

  async function signFor(clientId: string, task: OnboardingTask) {
    const doc = docs.find((d) => d.kind === task.documentKind && (d.audience === "client" || d.audience === "all"));
    const name = signer[task.id]?.trim();
    if (!doc) return fail("No document", new Error("There is no active document for this step. Add one in Settings."));
    if (!name) return fail("Type the name to sign", new Error("Enter the full name of the person accepting."));
    const { error } = await supabase.rpc("accept_document", { p_doc: doc.id, p_typed_name: name, p_client: clientId });
    if (error) return fail("Could not record acceptance", error);
    await load();
  }

  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from("onboarding").createSignedUrl(path, 120);
    if (error || !data) return fail("Could not open the file", error ?? new Error("missing"));
    window.open(data.signedUrl, "_blank", "noopener");
  }

  const byProfile = useMemo(() => groupBy(tasks.filter((t) => t.profileId), (t) => t.profileId!), [tasks]);
  const byClient = useMemo(() => groupBy(tasks.filter((t) => t.clientId), (t) => t.clientId!), [tasks]);
  const waiting = tasks.filter((t) => t.status === "submitted").length;

  const progress = (list: OnboardingTask[]) => {
    const req = list.filter((t) => t.required);
    return `${req.filter((t) => t.status === "approved").length}/${req.length} required steps done`;
  };

  const TaskRow = ({ t, clientId }: { t: OnboardingTask; clientId?: string }) => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm">
      <div className="flex items-center gap-2">
        {t.status === "approved" ? <CheckCircle2 className={`h-4 w-4 ${tone.approved}`} /> : <Circle className={`h-4 w-4 ${tone[t.status]}`} />}
        <span>{t.title}{!t.required && <span className="text-muted-foreground"> (optional)</span>}</span>
        {t.status !== "approved" && t.status !== "todo" && <Badge variant="secondary">{t.status}</Badge>}
      </div>
      <div className="flex items-center gap-2">
        {t.reviewNote && t.status === "rejected" && <span className="text-xs text-red-600">{t.reviewNote}</span>}
        {t.fileUrl && <Button size="sm" variant="ghost" onClick={() => void openFile(t.fileUrl!)}><ExternalLink className="mr-1 h-3.5 w-3.5" />View file</Button>}
        {t.status === "submitted" && (
          <>
            <Button size="sm" onClick={() => void review(t.id, true)}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => void review(t.id, false)}>Send back</Button>
          </>
        )}
        {clientId && t.kind === "accept_document" && t.status !== "approved" && (
          <>
            <Input className="h-8 w-44" placeholder="Full name to sign" value={signer[t.id] ?? ""} onChange={(e) => setSigner({ ...signer, [t.id]: e.target.value })} />
            <Button size="sm" onClick={() => void signFor(clientId, t)}>Record signature</Button>
          </>
        )}
        {(t.kind === "info" || (clientId && t.kind !== "accept_document")) && t.status !== "approved" && t.status !== "submitted" && (
          <Button size="sm" variant="outline" onClick={() => void markDone(t.id)}>Mark done</Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Onboarding</h1>
        <p className="text-sm text-muted-foreground">Checklists for new staff, office users and participants. {waiting > 0 ? `${waiting} step(s) are waiting for your review.` : "Nothing is waiting for review."}</p>
      </div>
      <Tabs defaultValue="staff">
        <TabsList><TabsTrigger value="staff">Staff</TabsTrigger><TabsTrigger value="clients">Clients</TabsTrigger></TabsList>

        <TabsContent value="staff" className="space-y-3">
          {caregivers.filter((c) => c.userId).map((c) => {
            const list = byProfile.get(c.userId!) ?? [];
            return (
              <Card key={c.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div><CardTitle className="text-base">{c.name}</CardTitle><CardDescription>{list.length ? progress(list) : "No checklist yet"}</CardDescription></div>
                  {list.length === 0 && <Button size="sm" onClick={() => void start(c.userId)}>Start onboarding</Button>}
                </CardHeader>
                {list.length > 0 && <CardContent>{list.map((t) => <TaskRow key={t.id} t={t} />)}</CardContent>}
              </Card>
            );
          })}
          {caregivers.length === 0 && <p className="text-sm text-muted-foreground">No staff yet. Add them under Team.</p>}
        </TabsContent>

        <TabsContent value="clients" className="space-y-3">
          {clients.map((c) => {
            const list = byClient.get(c.id) ?? [];
            return (
              <Card key={c.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div><CardTitle className="text-base">{c.fullName}</CardTitle><CardDescription>{list.length ? progress(list) : "No checklist yet"}</CardDescription></div>
                  {list.length === 0 && <Button size="sm" onClick={() => void start(undefined, c.id)}>Start onboarding</Button>}
                </CardHeader>
                {list.length > 0 && <CardContent>{list.map((t) => <TaskRow key={t.id} t={t} clientId={c.id} />)}</CardContent>}
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
