"use client";

import { useCallback, useEffect, useState } from "react";
import { Pager, usePaged } from "@/components/ui/pager";
import { Copy, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";

type Person = { id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null; role: string; active: boolean };

const ROLE_LABEL: Record<string, string> = { admin: "Administrator", manager: "Manager", office: "Office", caregiver: "Staff" };

export default function UsersPage() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", role: "caregiver", workerLevel: "level_2" });
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [mfaOn, setMfaOn] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [{ data }, { data: mfa }] = await Promise.all([
      supabase.from("profiles").select("id,email,first_name,last_name,phone,role,active").order("first_name"),
      supabase.rpc("mfa_enabled_users"),
    ]);
    setPeople((data ?? []) as Person[]);
    setMfaOn(new Set(((mfa ?? []) as unknown[]).map((r) => (typeof r === "string" ? r : String((r as Record<string, unknown>).mfa_enabled_users)))));
  }, []);

  async function resetMfa(p: Person) {
    const who = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;
    if (!window.confirm(`Reset two-factor authentication for ${who}? Use this if they lost their phone. They can sign in with just their password until they set it up again.`)) return;
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch("/api/staff/reset-mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` },
      body: JSON.stringify({ userId: p.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast({ title: "Could not reset 2FA", description: json.error ?? `Request failed (${res.status})`, variant: "destructive" });
    toast({ title: `2FA reset for ${who}`, description: "If your organisation requires 2FA, they'll be asked to set it up again at their next sign-in." });
    await load();
  }
  useEffect(() => { void load(); }, [load]);

  async function invite() {
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      // Give them their onboarding checklist straight away.
      const { error } = await supabase.rpc("start_onboarding", { p_profile: json.userId, p_client: null });
      if (error) toast({ title: "Account created, but onboarding was not started", description: error.message, variant: "destructive" });
      setCreated({ email: form.email, tempPassword: json.tempPassword });
      setOpen(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", role: "caregiver", workerLevel: "level_2" });
      await load();
    } catch (e) {
      toast({ title: "Could not create the account", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function setActive(p: Person, active: boolean) {
    const { error } = await supabase.from("profiles").update({ active }).eq("id", p.id);
    if (error) return toast({ title: "Could not update", description: error.message, variant: "destructive" });
    await load();
  }

  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  const paged = usePaged(people, 20, people.length);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">Staff sign in on the mobile app; office staff use this dashboard.</p>
        </div>
        <Button onClick={() => setOpen(true)}><UserPlus className="mr-1 h-4 w-4" />Add team member</Button>
      </div>

      {created && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardHeader><CardTitle className="text-base">Account created for {created.email}</CardTitle><CardDescription>Share this temporary password securely. It is shown only once; ask them to change it after signing in.</CardDescription></CardHeader>
          <CardContent className="flex items-center gap-2">
            <code className="rounded bg-white px-3 py-2 text-sm">{created.tempPassword}</code>
            <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(created.tempPassword).then(() => toast({ title: "Copied" }))}><Copy className="mr-1 h-4 w-4" />Copy</Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Done</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Phone</TableHead><TableHead>2FA</TableHead><TableHead className="text-right">Active</TableHead></TableRow></TableHeader>
            <TableBody>
              {paged.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "-"}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell><Badge variant="secondary">{ROLE_LABEL[p.role] ?? p.role}</Badge></TableCell>
                  <TableCell>{p.phone ?? ""}</TableCell>
                  <TableCell>
                    {mfaOn.has(p.id) ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700"><ShieldCheck className="h-3 w-3" />On</Badge>
                        {isAdmin && p.id !== user?.id && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void resetMfa(p)}>Reset</Button>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldOff className="h-3 w-3" />Off</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right"><Switch checked={p.active} disabled={!isAdmin || p.id === user?.id} onCheckedChange={(v) => void setActive(p, v)} aria-label="Active" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager {...paged.pager} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add team member</DialogTitle><DialogDescription>They get an onboarding checklist (terms, ID, screening check) as soon as the account exists.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>First name</Label><Input {...f("firstName")} /></div>
            <div><Label>Last name</Label><Input {...f("lastName")} /></div>
            <div className="sm:col-span-2"><Label>Email</Label><Input type="email" {...f("email")} /></div>
            <div><Label>Phone</Label><Input {...f("phone")} /></div>
            <div>
              <Label>Role</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="caregiver">Staff (mobile app)</option>
                <option value="office">Office (dashboard)</option>
                {isAdmin && <option value="manager">Manager (dashboard)</option>}
                {isAdmin && <option value="admin">Administrator</option>}
              </select>
            </div>
            {form.role === "caregiver" && (
              <div><Label>Pay level</Label><Input {...f("workerLevel")} placeholder="level_2" /><p className="mt-1 text-xs text-muted-foreground">Must match a level in your pay rates.</p></div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={invite} disabled={busy || !form.email || !form.firstName || !form.lastName}>{busy ? "Creating..." : "Create account"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
