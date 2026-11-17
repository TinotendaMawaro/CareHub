import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('Checking current auth user...');
  const { data: { users } } = await supabase.auth.admin.listUsers();
  
  console.log(`Found ${users.length} users in auth.users:`);
  for (const user of users) {
    console.log(`- ${user.email} (${user.id})`);
  }

  console.log('\nChecking profiles...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*');

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
  } else {
    console.log(`Found ${profiles?.length ?? 0} profiles:`);
    for (const profile of profiles) {
      console.log(`- ${profile.email} (${profile.id}): role=${profile.role}`);
    }
  }

  // Try to find the user that matches the login credentials
  const loginEmail = 'm@example.com';
  const { data: matchingUsers } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  const matchedUser = matchingUsers.users.find(u => u.email === loginEmail);
  if (matchedUser) {
    console.log(`\nFound login user: ${matchedUser.email} (${matchedUser.id})`);
    
    const { data: matchedProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', matchedUser.id)
      .single();

    if (matchedProfile) {
      console.log(`Profile role: ${matchedProfile.role}`);
      if (matchedProfile.role !== 'admin') {
        console.log('Updating role to admin...');
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', matchedUser.id);
        
        if (updateError) {
          console.error('Error updating role:', updateError);
        } else {
          console.log('Role updated to admin successfully!');
        }
      }
    } else {
      console.log('No profile found for login user. Creating one...');
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: matchedUser.id,
          email: matchedUser.email,
          first_name: matchedUser.user_metadata?.first_name || 'User',
          last_name: matchedUser.user_metadata?.last_name || 'Account',
          role: 'admin',
          phone: '',
        });
      
      if (insertError) {
        console.error('Error creating profile:', insertError);
      } else {
        console.log('Profile created with admin role!');
      }
    }
  } else {
    console.log(`\nNo user found with email ${loginEmail}`);
  }

  process.exit(0);
}

main();
