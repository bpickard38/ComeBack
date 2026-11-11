-- =====================================================================
-- Comeback: profile photos.
-- Run AFTER erd_schema.sql: SQL Editor > New query > paste > Run.
-- Safe to run again.
--
-- An athlete can add a photo of themselves; their trainer sees it on their
-- player profile. The picture is stored in a Supabase Storage bucket called
-- "avatars", in a folder named after the person's own id, and users.avatar_path
-- remembers which file is current.
--
-- Who can do what:
--   - You can only add, replace or delete files in your own folder.
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

-- Each rule: the file is in the avatars bucket, in a folder named after you.
drop policy if exists "See own profile photo files" on storage.objects;
create policy "See own profile photo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Add own profile photo" on storage.objects;
create policy "Add own profile photo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Replace own profile photo" on storage.objects;
create policy "Replace own profile photo" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Delete own profile photo" on storage.objects;
create policy "Delete own profile photo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;

-- Check it worked: should show one row, public = true.
-- select id, public, file_size_limit from storage.buckets where id = 'avatars';
