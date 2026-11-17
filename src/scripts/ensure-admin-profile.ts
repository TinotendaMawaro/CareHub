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
  const adminEmail = 'admin@carehub.com';
  
  // Find the admin user
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const adminUser = users.find(u => u.email === adminEmail);
  
  if (!adminUser) {
    console.error(`Admin user ${adminEmail} not found in auth.users`);
    process.exit(1);
  }

  console.log(`Found admin user: ${adminUser.email} (${adminUser.id})`);

  // Check if profile exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', adminUser.id)
    .single();

  if (existingProfile) {
    console.log('Profile exists:', existingProfile);
    if (existingProfile.role !== 'admin') {
      console.log('Updating role to admin...');
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', adminUser.id);
      
      if (error) {
        console.error('Error updating role:', error);
      } else {
        console.log('Role updated to admin successfully!');
      }
    } else {
      console.log('Role is already admin.');
    }
  } else {
    console.log('No profile found. Creating one with admin role...');
    const { error } = await supabase
      .from('profiles')
      .insert({
        id: adminUser.id,
        email: adminUser.email,
        first_name: adminUser.user_metadata?.first_name || 'Admin',
        last_name: adminUser.user_metadata?.last_name || 'User',
        role: 'admin',
        phone: '',
      });
    
    if (error) {
      console.error('Error creating profile:', error);
    } else {
      console.log('Profile created with admin role successfully!');
    }
  }

  // Verify
  const { data: verifyProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', adminUser.id)
    .single();

  console.log('Verified profile:', verifyProfile);

  process.exit(0);
}

main();
