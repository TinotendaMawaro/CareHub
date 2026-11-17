-- Rotate an admin password. Pass the new password and email at run time; never commit them:
--   psql "$DATABASE_URL" -v new_password='<new password>' -v admin_email='<email>' -f rotate-admin-password.sql
update auth.users
   set encrypted_password = crypt(:'new_password', gen_salt('bf', 10)),
       updated_at = now()
 where email = :'admin_email';

select email, email_confirmed_at, (encrypted_password like '$2%') as is_bcrypt
from auth.users
where email = :'admin_email';
