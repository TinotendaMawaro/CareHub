import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, getSupabaseAdmin } from '@/lib/supabase/server';

/** Reads the `aal` claim from an access token that getRequestContext has already verified. */
function tokenAal(authHeader: string | null): string | null {
  try {
    const payload = (authHeader ?? '').replace(/^Bearer\s+/i, '').split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).aal ?? null;
  } catch {
    return null;
  }
}

/**
 * Removes every two-factor factor from a team member's account, for when they lose their phone.
 * Admin only. An admin who has 2FA themselves must have passed it in this session (aal2), so a
 * stolen admin password on its own cannot be used to strip 2FA from other accounts.
 */
export async function POST(request: NextRequest) {
  const ctx = await getRequestContext(request);
  if (!ctx || ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can reset two-factor authentication' }, { status: 403 });
  }

  let userId = '';
  try {
    userId = String((await request.json()).userId ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'Unknown user' }, { status: 400 });
  if (userId === ctx.user.id) {
    return NextResponse.json({ error: 'Turn off your own 2FA in Settings > Security instead' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: mine } = await admin.auth.admin.mfa.listFactors({ userId: ctx.user.id });
  const callerHasMfa = (mine?.factors ?? []).some((f) => f.status === 'verified');
  if (callerHasMfa && tokenAal(request.headers.get('authorization')) !== 'aal2') {
    return NextResponse.json({ error: 'Verify your own 2FA code first' }, { status: 403 });
  }

  const { data: theirs, error: listError } = await admin.auth.admin.mfa.listFactors({ userId });
  if (listError) return NextResponse.json({ error: listError.message }, { status: 400 });

  for (const f of theirs?.factors ?? []) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ removed: theirs?.factors?.length ?? 0 });
}
