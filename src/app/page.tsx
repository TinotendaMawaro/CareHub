"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganisation } from "@/hooks/use-organisation";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CareHubLogoWithText } from "@/components/ui/carehub-logo";
import { WelcomeSplash } from "@/components/auth/welcome-splash";


export default function LoginPage() {
  const { org } = useOrganisation();
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(false);
  const [splashReady, setSplashReady] = useState(false);

  useEffect(() => {
    const splashKey = "carehub-login-splash-shown";
    const alreadyShown = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(splashKey) : null;

    if (!alreadyShown) {
      setShowSplash(true);
      setSplashReady(true);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(splashKey, "1");
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      toast({
        title: "Login Successful",
        description: "Welcome back! Redirecting to your dashboard.",
      });

      // Terms and onboarding are checked by the dashboard itself (see AuthGuard).
      if (authData.user) router.push("/dashboard");
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen mesh-bg">
      {showSplash && splashReady && (
        <WelcomeSplash variant="login" onComplete={() => setShowSplash(false)} />
      )}
      {!showSplash && (
        <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">
          <div className="flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-md space-y-6">
              <div className="text-center">
                <CareHubLogoWithText size={40} className="mx-auto" />
                <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl font-headline">
                  Welcome to CareHub
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Sign in to manage your care services.
                </p>
              </div>
              <Card className="glass animate-fade-up rounded-2xl border-white/60 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-2xl">Login</CardTitle>
                  <CardDescription>
                    Enter your email below to login to your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                   <form onSubmit={handleLogin} className="grid gap-4">
                    {error && (
                      <Alert variant="destructive">
                        <AlertTitle>Login Failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="m@example.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="password">Password</Label>
                      <Input 
                        id="password" 
                        type="password" 
                        required 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <Button type="submit" size="lg" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign in
                    </Button>
                  </form>
                </CardContent>
              </Card>
              <div className="mt-4 text-center text-sm">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="underline">
                  Sign up
                </Link>
              </div>
            </div>
          </div>
          <div className="relative hidden overflow-hidden lg:block" style={{ background: "linear-gradient(135deg, hsl(225 32% 9%) 0%, hsl(225 30% 14%) 55%, hsl(var(--primary) / 0.55) 140%)" }}>
            <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
            <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-[hsl(var(--chart-2))]/25 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between p-12 text-white">
              <div className="flex items-center gap-3">
                {org.logoUrl ? <img src={org.logoUrl} alt="" className="h-10 w-10 rounded-xl bg-white/10 object-contain p-1" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg font-bold backdrop-blur-md">{org.name.slice(0, 1)}</span>}
                <span className="text-lg font-semibold tracking-tight">{org.name}</span>
              </div>
              <div className="max-w-md space-y-8">
                <h2 className="text-4xl font-bold leading-tight tracking-tight">Rostering, timesheets and invoicing, in one calm place.</h2>
                <ul className="space-y-4 text-white/80">
                  {["Recurring and split shifts with the right cost code on every block", "Check-in at the client's address, shift notes and incident reports", "Approve once, then timesheets and invoices follow"].map((t) => (
                    <li key={t} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm backdrop-blur-md">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />{t}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-white/50">Secure sign-in. Your activity is logged for compliance.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
