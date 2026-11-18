"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PolicyBody } from "@/components/auth/policy-body";
import { useOrganisation } from "@/hooks/use-organisation";
import { supabase } from "@/lib/supabase/client";
import type { LegalDocument } from "@/lib/types";


/**
 * Blocks the dashboard until the signed-in office user has accepted every current terms document.
 * Renders children as soon as nothing is pending (or if the check itself cannot run, so a network
 * blip never locks people out of their work; the database still records who accepted what).
 */
export function TermsGate({ children }: { children: React.ReactNode }) {
  const { org } = useOrganisation();
  const [docs, setDocs] = useState<LegalDocument[] | null>(null);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc("pending_legal_documents");
    if (err) {
      console.warn("Could not check terms:", err.message);
      setDocs([]);
      return;
    }
    const list = (data ?? []) as LegalDocument[];
    setTotal((t) => Math.max(t, list.length));
    setDocs(list);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (docs === null) return null;
  if (docs.length === 0) return <>{children}</>;

  const doc = docs[0];
  async function accept() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("accept_document", { p_doc: doc.id, p_typed_name: name.trim() });
    setBusy(false);
    if (err) return setError(err.message.replace(/^[a-z_]+: /, ""));
    await load();
  }

  return (
    <div className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-2xl overflow-hidden shadow-xl">
        <div className="h-1.5 bg-muted">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((total - docs.length) / Math.max(total, 1)) * 100}%` }} />
        </div>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {org.name} · Document {total - docs.length + 1} of {total}
          </p>
          <CardTitle>{doc.title}</CardTitle>
          <CardDescription>Please read it, then type your full name to accept.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border bg-muted/20 p-5"><PolicyBody text={doc.body} org={org.name} /></div>
          <div>
            <Label htmlFor="terms-name">Your full name</Label>
            <Input id="terms-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button onClick={accept} disabled={busy || name.trim().length < 2}>{busy ? "Saving..." : `I accept: ${doc.title}`}</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
