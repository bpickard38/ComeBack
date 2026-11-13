-- =====================================================================
-- Comeback: profile photos.
-- Run AFTER erd_schema.sql: SQL Editor > New query > paste > Run.
-- Safe to run again.
--
-- An athlete can add a photo of themselves; their trainer sees it on their
-- player profile and can add or change it for them. The picture is stored in a Supabase Storage bucket called
-- "avatars", in a folder named after the person's own id, and users.avatar_path
-- remembers which file is current.
--
-- Who can do what:
--   - You can add, replace or delete files in your own folder. A trainer can
--     also do that in the folder of any athlete on one of their teams.
--   - The bucket is public: anyone who has a photo's full web address can
--     open it. The address contains two long random-looking ids and isn't
--     listed anywhere, but don't treat these photos as secret.
-- =====================================================================

begin;

-- ---------- Which file is the person's current photo ----------

alter table public.users add column if not exists avatar_path text;

-- The path must be inside the person's own folder, so nobody can point their
-- profile at someone else's file or at another website.
alter table public.users drop constraint if exists users_avatar_path_check;
alter table public.users add constraint users_avatar_path_check
  check (avatar_path is null or avatar_path like id::text || '/%');

-- People may already edit their own name and phone; add the photo.
grant update (avatar_path) on public.users to authenticated;

-- ---------- Where the files live ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- May I write to this person's photo folder? Yes if it's mine, or if I'm a
-- trainer on a team with them. The folder name is checked to be an id first,
-- so an odd file name can't cause an error.
create or replace function private.can_edit_photo_folder(p_folder text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_folder is null then
    return false;
  end if;
  if p_folder = (select auth.uid())::text then
    return true;
  end if;
  if p_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_trainer_of(p_folder::uuid);
end;
$$;

revoke execute on function private.can_edit_photo_folder(text) from public, anon;
grant execute on function private.can_edit_photo_folder(text) to authenticated;

-- A trainer sets (or, with null, removes) which file is an athlete's photo.
-- Athletes change their own row directly; this is for the trainer, who
-- can't otherwise edit someone else's row in users.
create or replace function public.set_athlete_photo(p_athlete uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_trainer_of(p_athlete) then
    raise exception 'Only this athlete''s trainer can change their photo.';
  end if;
  update public.users set avatar_path = p_path where id = p_athlete;
end;
$$;

revoke execute on function public.set_athlete_photo(uuid, text) from public, anon;
grant execute on function public.set_athlete_photo(uuid, text) to authenticated;

-- Each rule: the file is in the avatars bucket, in a folder you may write to.
drop policy if exists "See own profile photo files" on storage.objects;
create policy "See own profile photo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and private.can_edit_photo_folder((storage.foldername(name))[1]));

drop policy if exists "Add own profile photo" on storage.objects;
create policy "Add own profile photo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and private.can_edit_photo_folder((storage.foldername(name))[1]));

drop policy if exists "Replace own profile photo" on storage.objects;
create policy "Replace own profile photo" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and private.can_edit_photo_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'avatars' and private.can_edit_photo_folder((storage.foldername(name))[1]));

drop policy if exists "Delete own profile photo" on storage.objects;
create policy "Delete own profile photo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and private.can_edit_photo_folder((storage.foldername(name))[1]));

commit;

-- Check it worked: should show one row, public = true.
-- select id, public, file_size_limit from storage.buckets where id = 'avatars';
