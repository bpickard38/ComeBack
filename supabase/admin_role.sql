-- Run after erd_schema.sql (and preferably signup.sql) in Supabase SQL Editor.
-- This adds the role and the database-side access checks for the admin console.
-- Admin accounts are promoted manually by a trusted project owner; public sign-up
-- intentionally does not offer the admin role.

begin;

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('athlete', 'trainer', 'coach', 'admin'));

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create or replace function private.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.users where id = (select auth.uid());
$$;
revoke execute on function private.current_role() from public, anon;
grant execute on function private.current_role() to authenticated;

-- The profile table contains the admin-maintained directory. Auth credentials
-- remain in auth.users and are managed through Supabase Authentication.
revoke all on public.users from authenticated;
grant select, insert, delete on public.users to authenticated;
grant update (name, phone, role) on public.users to authenticated;

drop policy if exists "Admin manages users" on public.users;
create policy "Admin manages users" on public.users
  for all to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Keep the role column grant from turning profile self-editing into
-- self-service role escalation.
drop policy if exists "Edit own profile" on public.users;
create policy "Edit own profile" on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = private.current_role());

drop policy if exists "Admin adds exercises" on public.exercises;
create policy "Admin adds exercises" on public.exercises
  for insert to authenticated with check (private.is_admin());

drop policy if exists "Admin edits exercises" on public.exercises;
create policy "Admin edits exercises" on public.exercises
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists "Admin deletes exercises" on public.exercises;
create policy "Admin deletes exercises" on public.exercises
  for delete to authenticated using (private.is_admin());

-- Admin catalog deletion also removes prescribed rows and their dependent
-- logs/appointment links, after the dashboard's confirmation prompt.
alter table public.plan_exercises drop constraint if exists plan_exercises_exercise_id_fkey;
alter table public.plan_exercises add constraint plan_exercises_exercise_id_fkey
  foreign key (exercise_id) references public.exercises (id) on delete cascade;

commit;
