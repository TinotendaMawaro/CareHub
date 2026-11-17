"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import type { LegalDocument } from "@/lib/types";

/** Plain rendering of the organisation's Markdown terms: headings, bold, paragraphs. */
function Body({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm">
      {text.split("\n").map((line, i) => {
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        const clean = (h ? h[2] : line).replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
        if (!clean.trim()) return null;
        return h ? <h3 key={i} className="text-base font-semibold">{clean}</h3> : <p key={i}>{clean}</p>;
      })}
    </div>
  );
}

/**
 * Blocks the dashboard until the signed-in office user has accepted every current terms document.
 * Renders children as soon as nothing is pending (or if the check itself cannot run, so a network
 * blip never locks people out of their work; the database still records who accepted what).
 */
export function TermsGate({ children }: { children: React.ReactNode }) {
  const [docs, setDocs] = useState<LegalDocument[] | null>(null);
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
    setDocs((data ?? []) as LegalDocument[]);
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
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{doc.title}</CardTitle>
          <CardDescription>Document 1 of {docs.length}. Please read it, then type your full name to accept.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[50vh] overflow-y-auto rounded-md border p-4"><Body text={doc.body} /></div>
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
