"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { MfaGate } from "@/components/auth/mfa-gate";
import { TermsGate } from "@/components/auth/terms-gate";

export type AppRole = "admin" | "manager" | "office" | "caregiver";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  /** admin, manager or office: may use the web dashboard. */
  isOffice: boolean;
  isAdmin: boolean;
  loading: boolean;
  logout: (showSplash?: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  isOffice: false,
  isAdmin: false,
  loading: true,
  logout: async () => {},
});

const OFFICE_ROLES: AppRole[] = ["admin", "manager", "office"];

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  // Whether a session is already held, so token refreshes do not flash the loading state.
  const hasSession = useRef(false);

  useEffect(() => {
    let active = true;

    // Role is fetched before `loading` clears, so guards never see "signed in, role unknown".
    const apply = async (next: Session | null) => {
      if (!next) {
        hasSession.current = false;
        if (active) {
          setSession(null);
          setRole(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", next.user.id)
        .maybeSingle();
      if (!active) return;
      hasSession.current = true;
      setSession(next);
      setRole(data && data.active !== false ? ((data.role as AppRole) ?? null) : null);
      setLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch((err) => {
        console.error("Session recovery failed:", err);
        supabase.auth.signOut().catch(() => {});
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // A brand-new sign-in must read as "loading" at once, or the dashboard guard sees
      // "no user, not loading" while the role is still being fetched and bounces to the login page.
      if (next && !hasSession.current) setLoading(true);
      // Defer: supabase-js forbids awaiting other supabase calls inside this callback.
      setTimeout(() => void apply(next), 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const logout = async (showSplash = false) => {
    if (showSplash) {
      window.location.href = "/logout";
    } else {
      await supabase.auth.signOut();
    }
  };

  const value: AuthContextType = {
    user: session?.user ?? null,
    session,
    role,
    isOffice: !!role && OFFICE_ROLES.includes(role),
    isAdmin: role === "admin",
    loading,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isOffice, role, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  if (loading || !user) return null;

  if (!isOffice) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">This dashboard is for office staff</h1>
          <p className="text-sm text-muted-foreground">
            {role === "caregiver"
              ? "Support workers use the CareHub mobile app to see shifts, start and end them, and write notes."
              : "Your account has no CareHub role yet. Ask an administrator to set one up."}
          </p>
          <button
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <MfaGate>
      <TermsGate>{children}</TermsGate>
    </MfaGate>
  );
}
