import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;


if (!url || !anonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}
const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL;
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD in the environment (never hardcode credentials).');
  process.exit(1);
}

async function main(url: string, anonKey: string) {
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = TEST_EMAIL as string;
  const password = TEST_PASSWORD as string;

  console.log('Testing sign in with admin credentials...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.session) {
    console.error('Sign in failed:', authError?.message ?? 'No session returned');
    process.exit(1);
  }

  console.log('Signed in as:', authData.user.email);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
  });

  console.log('\nQuerying caregivers...');
  const { data: caregivers, error: caregiverError } = await client
    .from('caregivers')
    .select('*');

  if (caregiverError) {
    console.error('Caregiver query error:', caregiverError);
  } else {
    console.log(`Found ${caregivers?.length ?? 0} caregivers.`);
    if (caregivers && caregivers.length > 0) {
      console.log('First caregiver:', caregivers[0]);
    }
  }

  console.log('\nQuerying clients...');
  const { data: clients, error: clientError } = await client
    .from('clients')
    .select('*');

  if (clientError) {
    console.error('Client query error:', clientError);
  } else {
    console.log(`Found ${clients?.length ?? 0} clients.`);
    if (clients && clients.length > 0) {
      console.log('First client:', clients[0]);
    }
  }

  process.exit(0);
}

main(url, anonKey);
