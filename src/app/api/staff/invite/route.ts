import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getRequestContext, getSupabaseAdmin } from '@/lib/supabase/server';

const ROLES = ['admin', 'manager', 'office', 'caregiver'] as const;
type Role = (typeof ROLES)[number];

/**
 * Creates a login for a new team member.
 *  - support workers get a profile and a caregivers row (so they can be rostered),
 *  - office staff get a profile only.
 * Office staff may add workers and office users; only an admin may create admins or managers.
 * Uses the service role key, so every check happens here, before anything is written.
 */
export async function POST(request: NextRequest) {
  const ctx = await getRequestContext(request);
  if (!ctx || !['admin', 'manager', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const role = (body.role ?? 'caregiver') as Role;
  const workerLevel = body.workerLevel ? String(body.workerLevel) : 'level_2';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !firstName || !lastName) {
    return NextResponse.json({ error: 'Email, first name and last name are required' }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
  }
  if ((role === 'admin' || role === 'manager') && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can create admins or managers' }, { status: 403 });
  }

  // Shown once to the inviter to hand over; the person should change it after first sign-in.
  const tempPassword =
    body.password && String(body.password).length >= 8 ? String(body.password) : randomBytes(9).toString('base64url');

  const admin = getSupabaseAdmin();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? 'Could not create user' }, { status: 400 });
  }
  const uid = created.user.id;

  // Undo the auth user if anything after it fails, so there is never a login without a profile.
  const rollback = async (message: string) => {
    await admin.auth.admin.deleteUser(uid);
    return NextResponse.json({ error: message }, { status: 500 });
  };

  const { error: profileError } = await admin.from('profiles').insert({
    id: uid, email, first_name: firstName, last_name: lastName, phone, role,
  });
  if (profileError) return rollback(profileError.message);

  let caregiverId: string | null = null;
  if (role === 'caregiver') {
    const { data: cg, error: cgError } = await admin
      .from('caregivers')
      .insert({ user_id: uid, name: `${firstName} ${lastName}`, email, phone, worker_level: workerLevel })
      .select('id')
      .single();
    if (cgError) return rollback(cgError.message);
    caregiverId = cg.id;
  }

  return NextResponse.json({ userId: uid, caregiverId, tempPassword, role });
}
