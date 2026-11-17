import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Admin provisioning.
 *
 * This handler uses the service role key, which bypasses RLS entirely, so it
 * must be gated before anything else. Either a valid admin session or the
 * provisioning secret is required.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, password, firstName, lastName } = await request.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: created.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      // Only admins reach the web app
      role: 'admin',
    });

    if (profileError) {
      // Roll back the auth user so we don't leave a profile-less account
      await supabase.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Admin created successfully',
      uid: created.user.id,
    });
  } catch (error: any) {
    console.error('Error creating admin:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.ADMIN_PROVISIONING_KEY;
  const provided = request.headers.get('x-provisioning-key');

  if (secret && provided) {
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    // timingSafeEqual throws on length mismatch, so guard first
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }

  if (!secret) {
    // No provisioning key configured: fall back to requiring an admin
    // session rather than allowing anonymous access.
    return hasAdminSession(request);
  }

  return false;
}

async function hasAdminSession(request: NextRequest): Promise<boolean> {
  try {
    const { getSupabaseServerUser } = await import('@/lib/supabase/server');
    const user = await getSupabaseServerUser(request);
    if (!user) return false;

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    return data?.role === 'admin';
  } catch {
    return false;
  }
}
