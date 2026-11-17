-- Which team members have two-factor authentication switched on.
-- Office users only; returns ids, never factor secrets or names.
create or replace function public.mfa_enabled_users()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select distinct f.user_id
  from auth.mfa_factors f
  where f.status = 'verified' and public.is_office();
$$;

revoke all on function public.mfa_enabled_users() from public, anon;
grant execute on function public.mfa_enabled_users() to authenticated;
