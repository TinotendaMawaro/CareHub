-- Profile photos for everyone (web and mobile).
-- * Photos must live in our own public 'avatars' bucket, so a profile can't point at an
--   arbitrary external URL (tracking pixels, hot-linked content).
-- * A staff member's photo is mirrored onto their caregivers row, which the rosters, the
--   mobile app and staff lists already read.
-- * The bucket only accepts common raster images up to 5 MB (no SVG: it can carry script).

alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or avatar_url ~ '^https://[^/]+/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]+$');

alter table public.caregivers drop constraint if exists caregivers_profile_picture_url_check;
alter table public.caregivers add constraint caregivers_profile_picture_url_check
  check (profile_picture_url is null or profile_picture_url ~ '^https://[^/]+/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]+$');

create or replace function public.sync_profile_photo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is distinct from old.avatar_url then
    update public.caregivers set profile_picture_url = new.avatar_url
     where user_id = new.id and profile_picture_url is distinct from new.avatar_url;
  end if;
  return null;
end $$;

drop trigger if exists profiles_sync_photo on public.profiles;
create trigger profiles_sync_photo after update of avatar_url on public.profiles
  for each row execute function public.sync_profile_photo();

do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
       set file_size_limit = 5 * 1024 * 1024,
           allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/heic']
     where id = 'avatars';
  end if;
end $$;
