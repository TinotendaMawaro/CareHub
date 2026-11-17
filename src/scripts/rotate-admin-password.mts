import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const NEW_PASSWORD = 'CareHub@2024!SecureAdmin#';

async function rotatePassword() {
  try {
    // First, get the admin user
    const { data: users, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) throw listError;

    const adminUser = users.users.find(u => u.email === 'admin@carehub.com');
    if (!adminUser) {
      console.error('Admin user not found');
      return;
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(adminUser.id, {
      password: NEW_PASSWORD,
    });
    if (updateError) throw updateError;

    console.log('Admin password rotated successfully');
    console.log('New password:', NEW_PASSWORD);
  } catch (err) {
    console.error('Error:', err);
  }
}

rotatePassword();