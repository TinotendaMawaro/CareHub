# Seeding the admin user into Supabase Auth

Creates `admin@carehub.com` in `auth.users`, a matching `auth.identities` row so
password sign-in resolves, and the `public.profiles` row that drives RLS.

| Field | Value |
|---|---|
| email | `admin@carehub.com` |
| name | Tinotenda Mawaro |
| phone | `+61787098733` |
| role | `admin` |

Both paths below are idempotent — re-running resets the password rather than
failing on a duplicate email.

## Prerequisites

Run the migrations first, so `public.profiles` and `profiles.phone` exist:

```powershell
npx supabase db push --db-url "postgresql://postgres:<password>@db.thhfafbonummfzhwryjp.supabase.co:5432/postgres" --include-all
```

## Connecting to the database

Two connection styles, and which one you need depends on your network:

| Endpoint | Hostname | Protocol | Use when |
|---|---|---|---|
| Direct | `db.<ref>.supabase.co` | IPv6 only | Your machine has IPv6 |
| Pooler | `aws-0-<region>.pooler.supabase.com` | IPv4 | Your machine is IPv4-only |

The direct host publishes **no A record**, so on an IPv4-only machine you get
`getaddrinfo ENOTFOUND` from every client, even though the project is healthy.
If that happens, switch to the pooler. The pooler needs the project ref in the
username:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Region comes from Project Settings → Database. The pooler also rejects a plain
`postgres` username with `no tenant identifier provided` — the `.ref` suffix is
required, not optional.

Check reachability before seeding:

```powershell
Test-NetConnection -ComputerName db.thhfafbonummfzhwryjp.supabase.co -Port 5432
Test-NetConnection -ComputerName aws-0-ap-southeast-2.pooler.supabase.com -Port 5432
```

---

## Option A — Node script (recommended)

Hashes server-side with pgcrypto, so the plaintext is never written to disk or
put in a migration. The script reads the password from the environment only.

```powershell
$env:ADMIN_PASSWORD = '<password>'
$env:ADMIN_DATABASE_URL = '<connection string>'   # only if DATABASE_URL is IPv6-only
npx tsx src/scripts/seed-admin.mts
```

`src/scripts/seed-admin.mts` does the work:

```ts
// Password is hashed by Postgres, never in JS: a fresh random salt per run.
crypt($2, gen_salt('bf', 10))
```

```ts
// GoTrue needs an identity row for password sign-in to resolve the user.
await client.query(
  `insert into auth.identities (
     id, user_id, provider_id, identity_data, provider,
     last_sign_in_at, created_at, updated_at
   ) values (
     gen_random_uuid(), $1, $1,
     jsonb_build_object('sub', $1::text, 'email', $2, 'email_verified', true),
     'email', now(), now(), now()
   )
   on conflict (user_id, provider_id) do nothing`,
  [userId, EMAIL]
);
```

Optional overrides: `ADMIN_EMAIL`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`,
`ADMIN_PHONE`, `ADMIN_ROLE`.

The script prints a verification table and exits non-zero with a hint about the
pooler if it cannot connect.

## Option B — Direct SQL with psql

Use this when you want no Node dependency, or are seeding from the Supabase
dashboard SQL editor. The file is `supabase/seed/admin-user.sql`.

With psql, pass the password as a **variable** so it stays out of the file:

```powershell
psql "<connection string>" -v admin_password='<password>' -f supabase/seed/admin-user.sql
```

The variable is interpolated server-side, then hashed:

```sql
crypt(v_password, gen_salt('bf', 10))
```

From the **Supabase dashboard SQL editor** there is no psql variable, and
`crypt()` is still available, so run the insert with the password inlined. This
does put the plaintext in the editor's history — rotate the password after the
account exists, then use the reset snippet below for future changes.

Create the user:

```sql
select gen_random_uuid();
```

```sql
do $$
declare
  v_id uuid := '<paste-generated-uuid>';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id,
    'authenticated', 'authenticated',
    'admin@carehub.com',
    crypt('<password>', gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Tinotenda","last_name":"Mawaro"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id,
    jsonb_build_object('sub', v_id::text, 'email', 'admin@carehub.com', 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (id, email, first_name, last_name, role, phone)
  values (v_id, 'admin@carehub.com', 'Tinotenda', 'Mawaro', 'admin', '+61787098733');
end $$;
```

Verify:

```sql
select
  u.email,
  u.email_confirmed_at,
  (u.encrypted_password like '$2%') as looks_bcrypt,
  p.role, p.first_name, p.last_name, p.phone
from auth.users u
join public.profiles p on p.id = u.id
where u.email = 'admin@carehub.com';
```

Expect one row with `role = admin`, a non-null `email_confirmed_at`, and
`looks_bcrypt = true`.

## Option C — Service role key via the API

Skips SQL entirely and needs no database connectivity, since it goes over HTTPS
to the REST API. Add the key from Project Settings → API Keys to `.env.local` as
`SUPABASE_SERVICE_ROLE_KEY` (it is currently blank), then:

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const { data, error } = await supabase.auth.admin.createUser({
  email: 'admin@carehub.com',
  password: process.env.ADMIN_PASSWORD!,
  email_confirm: true,
  user_metadata: { first_name: 'Tinotenda', last_name: 'Mawaro' },
});
if (error) throw error;

await supabase.from('profiles').upsert({
  id: data.user.id,
  email: 'admin@carehub.com',
  first_name: 'Tinotenda',
  last_name: 'Mawaro',
  role: 'admin',
  phone: '+61787098733',
});
```

The service role bypasses RLS, which is correct here — the account does not
exist yet, so no policy would otherwise permit the insert. The service role key
must never reach the browser; keep it server-side only. This path is the same
one `src/app/api/create-user/route.ts` uses, so you can also just POST to that
endpoint from an authenticated admin session.

## Rotating the password later

```sql
update auth.users
   set encrypted_password = crypt('<new-password>', gen_salt('bf', 10)),
       updated_at = now()
 where email = 'admin@carehub.com';
```

## Why the hash is generated in the database

`crypt(password, gen_salt('bf', 10))` is pgcrypto, which ships with Supabase.
Each call generates a fresh random salt, so two accounts with the same password
get different hashes and the hashes cannot be compared directly — only verified
with `crypt(password, encrypted_password) = encrypted_password`.

Do **not** precompute the hash in JavaScript and paste it into SQL. Two reasons:
the `$2b$` prefix produced by Node's `bcryptjs` is a valid bcrypt variant, but
`encrypted_password` is GoTrue's column and Go's `bcrypt` library is stricter
about version prefixes than some other implementations. Generating with
`crypt()` guarantees GoTrue accepts the result. Second, a precomputed hash in a
committed migration file is a permanent credential artifact: anyone with repo
access gets a hash they can crack offline, and re-running the migration would
silently reset the password of a live account.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `getaddrinfo ENOTFOUND db.<ref>...` | Direct host is IPv6-only, no IPv6 locally | Use the pooler |
| `no tenant identifier provided` | Pooler username lacks the ref | `postgres.<ref>:<pw>@...` |
| `tenant/user <name> not found` | Wrong region on the pooler | Check the region in Project Settings |
| Password rejected, `has_password = true` | Missing `auth.identities` row | Re-run; the `on conflict` clause is safe |
| `profiles.phone does not exist` | `add_profile_phone` migration not applied | `npx supabase db push` |
| Login works but dashboard is empty | Role is not `admin`, so RLS returns nothing | `update public.profiles set role='admin'` |
| `violates row-level security policy` | Client-side insert of the profile | Use the service role key (Option C) |

That last one matters: creating the user through the browser client with the
publishable key fails, because the `profiles_own` policy requires an existing
`auth.uid()`. Admin provisioning always needs either direct SQL or the service
role key.
