import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { rpc, supabase } from '@/lib/supabase';

export type Org = { name: string; logoUrl?: string; brandColor: string; accentColor: string; timezone: string; currency: string };
export type Onboarding = { pending_documents: number; required_steps: number; approved_steps: number; needs_terms: boolean; complete: boolean };
export type Me = { caregiverId: string; name: string; role: string };

type Ctx = {
  session: Session | null;
  me: Me | null;
  /** This app is for support workers; office roles are told to use the web dashboard. */
  wrongRole: boolean;
  org: Org;
  onboarding: Onboarding | null;
  /** Signed in with a password but 2FA is on for this account and the code hasn't been entered yet. */
  needsMfa: boolean;
  loading: boolean;
  refreshOnboarding: () => Promise<void>;
  recheckMfa: () => Promise<void>;
  signOut: () => Promise<void>;
};

const DEFAULT_ORG: Org = { name: 'CareHub', brandColor: '#2563eb', accentColor: '#4DB6AC', timezone: 'Australia/Sydney', currency: 'AUD' };

const SessionContext = createContext<Ctx>({
  session: null, me: null, wrongRole: false, org: DEFAULT_ORG, onboarding: null, needsMfa: false, loading: true,
  refreshOnboarding: async () => {}, recheckMfa: async () => {}, signOut: async () => {},
});

/** True when the account has a verified 2FA factor that this session hasn't passed yet. Fails open. */
async function mfaPending(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  } catch {
    return false;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [wrongRole, setWrongRole] = useState(false);
  const [org, setOrg] = useState<Org>(DEFAULT_ORG);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loading, setLoading] = useState(true);

  const recheckMfa = useCallback(async () => setNeedsMfa(await mfaPending()), []);

  // Branding is readable before sign-in (name, logo, colours only).
  const loadOrg = useCallback(async (signedIn: boolean) => {
    const { data } = await supabase.from(signedIn ? 'organisation' : 'organisation_public').select('*').maybeSingle();
    if (data) {
      setOrg({
        name: data.name ?? DEFAULT_ORG.name, logoUrl: data.logo_url ?? undefined,
        brandColor: data.brand_color ?? DEFAULT_ORG.brandColor, accentColor: data.accent_color ?? DEFAULT_ORG.accentColor,
        timezone: data.timezone ?? DEFAULT_ORG.timezone, currency: data.currency ?? DEFAULT_ORG.currency,
      });
    }
  }, []);

  const refreshOnboarding = useCallback(async () => {
    try {
      setOnboarding(await rpc<Onboarding>('my_onboarding'));
    } catch {
      setOnboarding(null);
    }
  }, []);

  const apply = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next) {
      setMe(null); setOnboarding(null); setWrongRole(false); setNeedsMfa(false);
      await loadOrg(false);
      setLoading(false);
      return;
    }
    const [{ data: profile }, { data: cg }, pending] = await Promise.all([
      supabase.from('profiles').select('role, active').eq('id', next.user.id).maybeSingle(),
      supabase.from('caregivers').select('id, name').eq('user_id', next.user.id).maybeSingle(),
      mfaPending(),
    ]);
    setNeedsMfa(pending);
    const ok = !!profile && profile.active !== false && profile.role === 'caregiver' && !!cg;
    setWrongRole(!ok);
    setMe(ok && cg ? { caregiverId: cg.id, name: cg.name, role: profile!.role } : null);
    await loadOrg(true);
    if (ok) await refreshOnboarding();
    setLoading(false);
  }, [loadOrg, refreshOnboarding]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => apply(data.session)).catch(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => {
      // supabase-js forbids awaiting other supabase calls inside this callback; defer.
      setTimeout(() => void apply(next), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [apply]);

  const value = useMemo<Ctx>(
    () => ({ session, me, wrongRole, org, onboarding, needsMfa, loading, refreshOnboarding, recheckMfa, signOut: async () => void (await supabase.auth.signOut()) }),
    [session, me, wrongRole, org, onboarding, needsMfa, loading, refreshOnboarding, recheckMfa]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
