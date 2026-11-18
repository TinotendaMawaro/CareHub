"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ImageIcon, ShieldCheck, Upload } from "lucide-react";
import { TotpEnrollPanel } from "@/components/auth/mfa-gate";
import { RolesPanel } from "@/components/settings/roles-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useOrganisation } from "@/hooks/use-organisation";
import { usePayrollSettings } from "@/hooks/use-timesheets";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import type { LegalDocument, Organisation } from "@/lib/types";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const TIMEZONES = ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth", "Australia/Darwin", "Australia/Hobart", "Pacific/Auckland"];

const TABS = ["organisation", "scheduling", "invoicing", "payroll", "roles", "security", "terms"] as const;

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}

function SettingsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab");
  const tab = (TABS as readonly string[]).includes(requested ?? "") ? requested! : "organisation";
  const { isAdmin } = useAuth();
  const { org, save } = useOrganisation();
  const { settings: payroll, updateSettings: savePayroll } = usePayrollSettings();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Organisation>(org);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!dirty) setDraft(org); }, [org, dirty]);
  const set = <K extends keyof Organisation>(k: K, v: Organisation[K]) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); };

  async function persist() {
    setSaving(true);
    try {
      await save(draft);
      setDirty(false);
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function uploadLogo(file: File) {
    if (!LOGO_TYPES.includes(file.type)) return toast({ title: "Use a PNG, JPG, WebP or SVG image", variant: "destructive" });
    if (file.size > 2 * 1024 * 1024) return toast({ title: "Logo must be under 2 MB", variant: "destructive" });
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("branding").upload(path, file, { cacheControl: "3600", contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      await save({ logoUrl: data.publicUrl });
      toast({ title: "Logo updated" });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const ro = !isAdmin;
  const text = (k: keyof Organisation, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div><Label>{label}</Label><Input disabled={ro} value={String(draft[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} {...props} /></div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">{ro ? "Only administrators can change settings." : "Make CareHub yours: your name, logo and colours appear in the web app and the staff mobile app."}</p>
        </div>
        {!ro && <Button disabled={!dirty || saving} onClick={persist}>{saving ? "Saving..." : "Save changes"}</Button>}
      </div>

      <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
          <TabsTrigger value="scheduling">Shifts and location</TabsTrigger>
          <TabsTrigger value="invoicing">Invoicing and Xero</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="terms">Policies & terms</TabsTrigger>
        </TabsList>

        <TabsContent value="organisation">
          <Card>
            <CardHeader><CardTitle>Your organisation</CardTitle><CardDescription>Shown on invoices and in the apps.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {draft.logoUrl ? <img src={draft.logoUrl} alt="Logo" className="h-full w-full object-contain" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept={LOGO_TYPES.join(",")} hidden onChange={(e) => e.target.files?.[0] && void uploadLogo(e.target.files[0])} />
                  <Button variant="outline" disabled={ro || uploading} onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" />{uploading ? "Uploading..." : "Upload logo"}</Button>
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, WebP or SVG, up to 2 MB. Square or wide logos both work.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {text("name", "Organisation name")}
                {text("legalName", "Legal name")}
                {text("abn", "ABN")}
                {text("email", "Contact email", { type: "email" })}
                {text("phone", "Phone")}
                {text("website", "Website")}
                <div className="sm:col-span-2">{text("address", "Address")}</div>
                <div>
                  <Label>Main colour</Label>
                  <div className="flex gap-2"><Input type="color" className="w-14 p-1" disabled={ro} value={draft.brandColor} onChange={(e) => set("brandColor", e.target.value)} /><Input disabled={ro} value={draft.brandColor} onChange={(e) => set("brandColor", e.target.value)} /></div>
                </div>
                <div>
                  <Label>Accent colour</Label>
                  <div className="flex gap-2"><Input type="color" className="w-14 p-1" disabled={ro} value={draft.accentColor} onChange={(e) => set("accentColor", e.target.value)} /><Input disabled={ro} value={draft.accentColor} onChange={(e) => set("accentColor", e.target.value)} /></div>
                </div>
                <div>
                  <Label>Timezone</Label>
                  <select disabled={ro} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    {TIMEZONES.map((z) => <option key={z}>{z}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">Evening, night and weekend rates are worked out in this timezone.</p>
                </div>
                {text("state", "State (for public holidays)", { maxLength: 3 })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduling">
          <Card>
            <CardHeader><CardTitle>Starting and ending shifts</CardTitle><CardDescription>Applies to every shift unless a shift overrides it when you create it.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox disabled={ro} checked={draft.defaultGeofenceRequired} onCheckedChange={(v) => set("defaultGeofenceRequired", !!v)} />
                <span><b>Workers must be at the client's address to start a shift.</b><br /><span className="text-muted-foreground">Uses the phone's location. Clients need address coordinates saved.</span></span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Allowed distance (metres)</Label><Input type="number" min={20} disabled={ro} value={draft.defaultGeofenceRadiusM} onChange={(e) => set("defaultGeofenceRadiusM", Number(e.target.value) || 150)} /></div>
                <div><Label>Can start this many minutes early</Label><Input type="number" min={0} disabled={ro} value={draft.clockInEarlyMinutes} onChange={(e) => set("clockInEarlyMinutes", Math.max(0, Number(e.target.value) || 0))} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox disabled={ro} checked={draft.enforceGeofenceOnEnd} onCheckedChange={(v) => set("enforceGeofenceOnEnd", !!v)} />Also check location when ending a shift</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox disabled={ro} checked={draft.requireNoteOnEnd} onCheckedChange={(v) => set("requireNoteOnEnd", !!v)} />Require a shift note for every client before a shift can be ended</label>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoicing">
          <Card>
            <CardHeader><CardTitle>Invoices</CardTitle><CardDescription>NDIS supports are usually GST-free, so GST defaults to 0%.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {text("invoicePrefix", "Invoice number prefix")}
              <div><Label>Payment terms (days)</Label><Input type="number" min={0} disabled={ro} value={draft.invoiceTermsDays} onChange={(e) => set("invoiceTermsDays", Math.max(0, Number(e.target.value) || 0))} /></div>
              <div><Label>GST rate (%)</Label><Input type="number" min={0} max={100} step="0.5" disabled={ro} value={Math.round(draft.gstRate * 1000) / 10} onChange={(e) => set("gstRate", Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)))} /></div>
              {text("currency", "Currency", { maxLength: 3 })}
              {text("xeroAccountCode", "Xero sales account code")}
              {text("xeroTaxType", "Xero tax type")}
              <div className="sm:col-span-2"><Label>Bank details (printed on invoices)</Label><Textarea disabled={ro} value={draft.bankDetails ?? ""} onChange={(e) => set("bankDetails", e.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Invoice footer</Label><Textarea disabled={ro} value={draft.invoiceFooter ?? ""} onChange={(e) => set("invoiceFooter", e.target.value)} /></div>
              <p className="text-xs text-muted-foreground sm:col-span-2">Exporting creates a CSV in Xero's invoice import format. Use the same account code and tax type names as your Xero chart of accounts.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card>
            <CardHeader><CardTitle>Pay periods</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div><Label>First day of a pay period</Label><Input type="date" disabled={ro} defaultValue={payroll?.fortnightAnchor} key={payroll?.fortnightAnchor} onBlur={(e) => e.target.value && void savePayroll({ fortnightAnchor: e.target.value }).then((err) => toast(err ? { title: "Could not save", description: err.message, variant: "destructive" } : { title: "Saved" }))} /></div>
              <div><Label>Short-notice cancellation billed (%)</Label><Input type="number" min={0} max={100} disabled={ro} defaultValue={payroll?.cancellationBillablePercent} key={`c${payroll?.cancellationBillablePercent}`} onBlur={(e) => void savePayroll({ cancellationBillablePercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }).then((err) => toast(err ? { title: "Could not save", description: err.message, variant: "destructive" } : { title: "Saved" }))} /></div>
              <p className="self-end text-xs text-muted-foreground">Changes here save when you leave the field.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles"><RolesPanel /></TabsContent>

        <TabsContent value="security">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Two-factor authentication</CardTitle>
                <CardDescription>An authenticator app on each person's phone adds a second check at sign-in, so a stolen password alone can't open the dashboard.</CardDescription>
              </CardHeader>
              <CardContent>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox disabled={ro} checked={draft.requireMfa} onCheckedChange={(v) => set("requireMfa", !!v)} />
                  <span>
                    <b>Require two-factor authentication for all office users.</b><br />
                    <span className="text-muted-foreground">Admins, managers and office staff without it will be asked to set it up the next time they open the dashboard. Staff on the mobile app are not affected.</span>
                  </span>
                </label>
                {!ro && draft.requireMfa !== org.requireMfa && <p className="mt-2 text-xs text-muted-foreground">Press "Save changes" above to apply.</p>}
              </CardContent>
            </Card>
            <TwoFactorCard />
          </div>
        </TabsContent>

        <TabsContent value="terms"><TermsEditor canEdit={isAdmin} /></TabsContent>
      </Tabs>
    </div>
  );
}

function TwoFactorCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "off" | "on" | "setup">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp.find((f) => f.status === "verified");
    setFactorId(verified?.id ?? null);
    setStatus(verified ? "on" : "off");
  };
  useEffect(() => { void load(); }, []);

  async function remove() {
    if (!factorId || !window.confirm("Turn off two-factor authentication for your account?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return toast({ title: "Could not turn it off", description: error.message, variant: "destructive" });
    toast({ title: "Two-factor authentication is off for your account" });
    await load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your account</CardTitle>
        <CardDescription>Two-factor authentication for the account you are signed in with now.</CardDescription>
      </CardHeader>
      <CardContent>
        {status === "loading" && <p className="text-sm text-muted-foreground">Checking...</p>}
        {status === "on" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm"><span className="font-medium text-emerald-600">On.</span> You'll be asked for a code from your authenticator app each time you sign in.</p>
            <Button variant="outline" size="sm" onClick={remove}>Turn off</Button>
          </div>
        )}
        {status === "off" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Not set up yet. You'll need an authenticator app on your phone.</p>
            <Button size="sm" onClick={() => setStatus("setup")}>Set up</Button>
          </div>
        )}
        {status === "setup" && (
          <TotpEnrollPanel
            onDone={() => {
              toast({ title: "Two-factor authentication is on" });
              void load();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function TermsEditor({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [editing, setEditing] = useState<LegalDocument | null>(null);
  const [body, setBody] = useState("");

  const load = async () => {
    const { data } = await supabase.from("legal_documents").select("*").order("kind").order("version", { ascending: false });
    const all = (data ?? []).map((r: any) => ({ id: r.id, kind: r.kind, title: r.title, audience: r.audience, version: r.version, body: r.body, active: r.active }) as LegalDocument);
    // Latest version of each (kind, audience) only.
    const latest = new Map<string, LegalDocument>();
    for (const d of all) if (!latest.has(`${d.kind}:${d.audience}`)) latest.set(`${d.kind}:${d.audience}`, d);
    setDocs([...latest.values()]);
  };
  useEffect(() => { void load(); }, []);

  async function publish() {
    if (!editing || !body.trim()) return;
    if (!window.confirm("Publishing creates a new version. Everyone it applies to will be asked to accept it again. Continue?")) return;
    const { error } = await supabase.from("legal_documents").insert({ kind: editing.kind, title: editing.title, audience: editing.audience, version: editing.version + 1, body });
    if (error) return toast({ title: "Could not publish", description: error.message, variant: "destructive" });
    toast({ title: "New version published" });
    setEditing(null);
    await load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terms and conditions</CardTitle>
        <CardDescription>
          Staff, office users and clients accept these during onboarding. The starter text is a template only: have your legal adviser review it before you use it with real people.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div><b>{d.title}</b> <span className="text-muted-foreground">for {d.audience}, version {d.version}</span></div>
            {canEdit && <Button size="sm" variant="outline" onClick={() => { setEditing(d); setBody(d.body); }}>Edit</Button>}
          </div>
        ))}
        {editing && (
          <div className="space-y-2 rounded-md border p-3">
            <Label>{editing.title} (version {editing.version + 1}, Markdown)</Label>
            <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex gap-2"><Button onClick={publish}>Publish new version</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
