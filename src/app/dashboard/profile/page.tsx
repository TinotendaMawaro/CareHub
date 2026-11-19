"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { AvatarUploader } from "@/components/app/avatar-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ROLE_LABEL } from "@/lib/roles";
import { supabase } from "@/lib/supabase/client";

export default function MyProfilePage() {
  const { user, role, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (profile) setForm({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone });
  }, [profile]);

  if (!user || !profile) return null;
  const dirty = form.firstName !== profile.firstName || form.lastName !== profile.lastName || form.phone !== profile.phone;

  async function save() {
    if (!form.firstName.trim()) return toast({ title: "First name is required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: form.firstName.trim(), last_name: form.lastName.trim() || null, phone: form.phone.trim() || null })
      .eq("id", user!.id);
    setSaving(false);
    if (error) return toast({ title: "Could not save", description: error.message, variant: "destructive" });
    await refreshProfile();
    toast({ title: "Profile saved" });
  }

  async function changePassword() {
    if (pw.next.length < 10) return toast({ title: "Use at least 10 characters", variant: "destructive" });
    if (pw.next !== pw.confirm) return toast({ title: "The passwords don't match", variant: "destructive" });
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setPwBusy(false);
    if (error) return toast({ title: "Could not change password", description: error.message, variant: "destructive" });
    setPw({ next: "", confirm: "" });
    toast({ title: "Password changed" });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">My profile</h1>
        <p className="text-sm text-muted-foreground">Your photo and name appear in the sidebar, chat, rosters and the staff app.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary/80 via-primary/60 to-primary/30" />
        <CardContent className="-mt-12 space-y-4">
          <AvatarUploader userId={user.id} name={profile.fullName} url={profile.avatarUrl} onChange={() => void refreshProfile()} />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold">{profile.fullName}</p>
            {role && <Badge variant="secondary">{ROLE_LABEL[role]}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="pf-first">First name</Label><Input id="pf-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" /></div>
          <div><Label htmlFor="pf-last">Last name</Label><Input id="pf-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" /></div>
          <div><Label htmlFor="pf-phone">Phone</Label><Input id="pf-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" inputMode="tel" /></div>
          <div><Label>Email</Label><Input value={user.email ?? ""} disabled /><p className="mt-1 text-xs text-muted-foreground">Ask an administrator to change your sign-in email.</p></div>
          <div className="sm:col-span-2"><Button onClick={save} disabled={!dirty || saving}>{saving ? "Saving..." : "Save details"}</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Password</CardTitle>
            <CardDescription>At least 10 characters. A short phrase is easier to remember and harder to guess.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="password" placeholder="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" aria-label="New password" />
            <Input type="password" placeholder="Confirm new password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" aria-label="Confirm new password" />
            <Button variant="outline" onClick={changePassword} disabled={pwBusy || !pw.next}>{pwBusy ? "Changing..." : "Change password"}</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Two-factor authentication</CardTitle>
            <CardDescription>A code from your phone at sign-in, so a stolen password alone can&apos;t open your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild><Link href="/dashboard/settings?tab=security">Manage two-factor authentication</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
