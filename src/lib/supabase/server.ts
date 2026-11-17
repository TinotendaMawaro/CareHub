import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Server-side client. Uses the service role key and therefore bypasses RLS.
 * Only call this from trusted server code (route handlers, server actions, scripts).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Find the service role key in Supabase dashboard > Project Settings > API Keys.'
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

/**
 * Resolves the signed-in user from the request's Authorization header or the
 * auth cookie, using the publishable key so RLS applies. Returns null when
 * unauthenticated. Server-only: never import this from a client component.
 */
export async function getSupabaseServerUser(request: {
  headers: { get(name: string): string | null };
  cookies?: { get(name: string): { value: string } | undefined };
}): Promise<{ id: string; email?: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;

  const auth =
    request.headers.get('authorization') ??
    request.cookies?.get('sb-access-token')?.value ??
    request.cookies?.get('sb-access-token.0')?.value;

  if (!auth) return null;

  // getUser() with no argument looks for a stored session (there is none server-side), so pass the token.
  // Use a bare client: also setting a global Authorization header makes the request carry it twice.
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(bearerToken(auth));
  if (error || !data.user) return null;
  return data.user;
}

/** "Bearer abc" -> "abc". */
function bearerToken(header: string): string {
  return header.replace(/^Bearer\s+/i, '').trim();
}

export type RequestContext = {
  user: { id: string; email?: string };
  role: 'admin' | 'manager' | 'office' | 'caregiver';
  /** Client acting as the caller: row level security applies to everything it does. */
  db: SupabaseClient;
};

/**
 * Authenticates an API request from its Authorization header and loads the caller's role.
 * Returns null when the caller is not signed in or has no active profile.
 */
export async function getRequestContext(request: {
  headers: { get(name: string): string | null };
}): Promise<RequestContext | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const auth = request.headers.get('authorization');
  if (!url || !anonKey || !auth) return null;

  const token = bearerToken(auth);
  const bare = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error } = await bare.auth.getUser(token);
  if (error || !u.user) return null;

  // Data access as the caller, so row level security applies.
  const db = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { authorization: `Bearer ${token}` } },
  });

  const { data: profile } = await db
    .from('profiles')
    .select('role, active')
    .eq('id', u.user.id)
    .maybeSingle();
  if (!profile || profile.active === false) return null;

  return { user: { id: u.user.id, email: u.user.email ?? undefined }, role: profile.role, db };
}
