-- Add contact phone to admin/user profiles
alter table public.profiles add column if not exists phone text;

comment on column public.profiles.phone is 'Contact phone number in E.164 format';
