import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getSupabaseAdmin } from '../lib/supabase/server';

const supabase = getSupabaseAdmin();

async function main() {
  const { data: existingCaregivers } = await supabase.from('caregivers').select('id, name, email');
  const { data: existingClients } = await supabase.from('clients').select('id, first_name, last_name, email');
  const { data: existingUsers } = await supabase.from('profiles').select('id, email');

  const caregiverById = new Map((existingCaregivers ?? []).map((c: any) => [c.email, c.id]));
  const clientById = new Map((existingClients ?? []).map((c: any) => [c.email, c.id]));
  const userIdByEmail = new Map((existingUsers ?? []).map((u: any) => [u.email, u.id]));
  const fallbackUserId = userIdByEmail.get('admin@carehub.test') ?? userIdByEmail.values().next().value ?? null;

  const sampleEmails = [
    { caregiverEmail: 'alice@carehub.test', clientEmail: 'margaret@carehub.test' },
    { caregiverEmail: 'bob@carehub.test', clientEmail: 'robert@carehub.test' },
    { caregiverEmail: 'carol@carehub.test', clientEmail: 'dorothy@carehub.test' },
    { caregiverEmail: 'david@carehub.test', clientEmail: 'james@carehub.test' },
    { caregiverEmail: 'eva@carehub.test', clientEmail: 'robert@carehub.test' },
    { caregiverEmail: 'grace@carehub.test', clientEmail: 'dorothy@carehub.test' },
    { caregiverEmail: 'henry@carehub.test', clientEmail: 'james@carehub.test' },
  ];

  const rows: any[] = [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);

  for (const sample of sampleEmails) {
    const caregiverId = caregiverById.get(sample.caregiverEmail);
    const clientId = clientById.get(sample.clientEmail);
    if (!caregiverId || !clientId) continue;
    const createdBy = fallbackUserId;

    rows.push({
      client_id: clientId,
      caregiver_id: caregiverId,
      service_type: 'ndis',
      date: today,
      start_time: new Date(today + 'T08:00:00').toISOString(),
      end_time: new Date(today + 'T10:00:00').toISOString(),
      location: `SRID=4326;POINT(151.2093 -33.8688)`,
      status: 'Scheduled',
      created_by: createdBy,
      created_at: new Date().toISOString(),
      allow_overlap: false,
      deleted: false,
    });

    rows.push({
      client_id: clientId,
      caregiver_id: caregiverId,
      service_type: 'ndis',
      date: yesterday,
      start_time: new Date(yesterday + 'T09:00:00').toISOString(),
      end_time: new Date(yesterday + 'T12:00:00').toISOString(),
      location: `SRID=4326;POINT(151.2093 -33.8688)`,
      status: 'Completed',
      clock_in_time: new Date(yesterday + 'T09:00:00').toISOString(),
      clock_out_time: new Date(yesterday + 'T12:00:00').toISOString(),
      hours_worked: 3,
      created_by: createdBy,
      created_at: new Date(yesterday + 'T09:00:00').toISOString(),
      allow_overlap: false,
      deleted: false,
    });

    rows.push({
      client_id: clientId,
      caregiver_id: caregiverId,
      service_type: 'ndis',
      date: tomorrow,
      start_time: new Date(tomorrow + 'T13:00:00').toISOString(),
      end_time: new Date(tomorrow + 'T15:00:00').toISOString(),
      location: `SRID=4326;POINT(151.2093 -33.8688)`,
      status: 'Scheduled',
      created_by: createdBy,
      created_at: new Date().toISOString(),
      allow_overlap: false,
      deleted: false,
    });
  }

  const unassignedClientId = clientById.get('dorothy@carehub.test');
  if (unassignedClientId) {
    rows.push({
      client_id: unassignedClientId,
      caregiver_id: null,
      service_type: 'ndis',
      date: dayAfter,
      start_time: new Date(dayAfter + 'T09:00:00').toISOString(),
      end_time: new Date(dayAfter + 'T12:00:00').toISOString(),
      location: `SRID=4326;POINT(151.2043 -33.8658)`,
      status: 'Scheduled',
      created_by: fallbackUserId,
      created_at: new Date().toISOString(),
      allow_overlap: false,
      deleted: false,
    });
  }

  console.log(`Seeding ${rows.length} shifts...`);
  const { error } = await supabase.from('shifts').insert(rows);
  if (error) {
    console.error('Shift seed error:', error);
  } else {
    console.log('Seeded shifts.');
  }

  console.log('Done.');
  process.exit(0);
}

main();
