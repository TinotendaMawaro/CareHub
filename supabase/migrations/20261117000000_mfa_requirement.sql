-- Organisation-wide switch: office users (admin/manager/office) must set up
-- two-factor authentication before they can use the web dashboard.
-- Enforcement happens in the app via Supabase Auth MFA (TOTP) assurance levels.
alter table public.organisation
  add column if not exists require_mfa boolean not null default false;
