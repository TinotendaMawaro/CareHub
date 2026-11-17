-- Admin user seed, for direct SQL execution.
--
-- Safe to run repeatedly: re-running updates the existing account.
--
-- Supply the password as a psql variable so the plaintext never appears in a
-- file or in shell history. Examples below in the step-by-step guide.
--
--   psql "$DB_URL" -v admin_password='<plaintext>' -f supabase/seed/admin-user.sql
--
-- Supabase dashboard SQL editor: set the password by running the
-- "change password" snippet separately (see guide, option B).

\set ON_ERROR_STOP on

do $$
declare
  v_user_id  uuid;
  v_email    text := 'admin@carehub.com';
  v_password text := :'admin_password';
  v_first    text := 'Tinotenda';
  v_last     text := 'Mawaro';
  v_phone    text := '+61787098733';
  v_role     text := 'admin';
begin
  if v_password is null or v_password = '' then
    raise exception 'admin_password psql variable is empty';
  end if;

  create extension if not exists "pgcrypto";

  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name', v_first, 'last_name', v_last),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  else
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf', 10)),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user_id;
  end if;

  insert into public.profiles (id, email, first_name, last_name, role, phone)
  values (v_user_id, v_email, v_first, v_last, v_role, v_phone)
  on conflict (id) do update
    set email = excluded.email,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        role = excluded.role,
        phone = excluded.phone,
        updated_at = now();

  raise notice 'Seeded admin user % (id %)', v_email, v_user_id;
end $$;

-- Verify without exposing the hash
select
  u.email,
  u.email_confirmed_at,
  (u.encrypted_password is not null) as has_password,
  (u.encrypted_password like '$2%') as looks_bcrypt,
  p.role,
  p.first_name,
  p.last_name,
  p.phone
from auth.users u
join public.profiles p on p.id = u.id
where u.email = 'admin@carehub.com';
