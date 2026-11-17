"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase/client";

/** The TOTP factor id to verify against, or null when the user has none verified. */
async function verifiedTotpFactorId(): Promise<string | null> {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.find((f) => f.status === "verified")?.id ?? null;
}

export function CodeInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="123456"
      maxLength={6}
      className="w-40 text-center text-lg tracking-[0.3em]"
      {...props}
    />
  );
}

/**
 * Scan-the-QR-code enrollment for an authenticator app. Used by the forced
 * gate below and by the self-service card in Settings -> Security.
 */
export function TotpEnrollPanel({ onDone }: { onDone: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      // Clear out half-finished attempts so re-opening this screen never errors.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
      if (err || !data) return setError(err?.message ?? "Could not start 2FA setup.");
      const raw = data.totp.qr_code;
      setQr(raw.startsWith("<svg") ? `data:image/svg+xml;utf8,${encodeURIComponent(raw)}` : raw);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    })();
  }, []);

  async function verify() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (err) return setError("That code didn't match. Codes change every 30 seconds - try the current one.");
    onDone();
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or similar).</li>
        <li>Scan this QR code with the app.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-44 w-44 items-center justify-center rounded-lg border bg-white p-2">
          {qr ? <img src={qr} alt="2FA QR code" className="h-full w-full" /> : <span className="text-xs text-muted-foreground">Loading...</span>}
        </div>
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Can't scan? Enter this key manually</Label>
            <p className="break-all font-mono text-xs">{secret || "..."}</p>
          </div>
          <div>
            <Label htmlFor="mfa-enroll-code">Code from the app</Label>
            <CodeInput id="mfa-enroll-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={verify} disabled={busy || code.trim().length !== 6 || !factorId}>
        {busy ? "Checking..." : "Turn on two-factor authentication"}
      </Button>
    </div>
  );
}

type Stage = "checking" | "pass" | "challenge" | "enroll";

/**
 * Runs after login, before the dashboard:
 * - a user with 2FA set up must enter a code every new session;
 * - when the organisation requires 2FA, a user without it must set it up first.
 * If the checks themselves cannot run, the gate lets people through (the same
 * fail-open stance as TermsGate) so an auth outage never locks the office out.
 */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const [stage, setStage] = useState<Stage>("checking");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = useCallback(async () => {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aal) return setStage("pass");
      if (aal.currentLevel === "aal2") return setStage("pass");
      if (aal.nextLevel === "aal2") return setStage("challenge");
      const { data: org } = await supabase.from("organisation").select("require_mfa").maybeSingle();
      setStage(org?.require_mfa ? "enroll" : "pass");
    } catch (e) {
      console.warn("2FA check could not run:", e);
      setStage("pass");
    }
  }, []);
  useEffect(() => { void decide(); }, [decide]);

  if (stage === "checking") return null;
  if (stage === "pass") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {stage === "challenge" ? "Two-factor authentication" : "Set up two-factor authentication"}
          </CardTitle>
          <CardDescription>
            {stage === "challenge"
              ? "Enter the 6-digit code from your authenticator app to finish signing in."
              : "Your organisation requires two-factor authentication for office accounts."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stage === "enroll" ? (
            <TotpEnrollPanel onDone={() => void decide()} />
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                const factorId = await verifiedTotpFactorId();
                const { error: err } = factorId
                  ? await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
                  : { error: new Error("No authenticator found on your account.") };
                setBusy(false);
                if (err) return setError("That code didn't match. Codes change every 30 seconds - try the current one.");
                await decide();
              }}
            >
              <div>
                <Label htmlFor="mfa-code">Authenticator code</Label>
                <CodeInput id="mfa-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy || code.trim().length !== 6}>{busy ? "Checking..." : "Verify"}</Button>
            </form>
          )}
        </CardContent>
        <CardFooter>
          <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => void logout()}>
            Sign out and use a different account
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
