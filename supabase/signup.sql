-- =====================================================================
-- Comeback: sign-up with roles, teams and join codes.
-- Run AFTER erd_schema.sql: SQL Editor > New query > paste > Run.
--
-- How it works:
--   1. Anyone signs up and picks athlete, coach or trainer. That choice only
--      decides which screens they see; on its own it unlocks no data.
--   2. A trainer creates a team and gets two join codes: one for athletes,
--      one for coaches. Only trainers can see the codes.
--   3. Athletes and coaches enter a code to join. An athlete code only works
--      for an athlete account, a coach code only for a coach account.
--   4. What anyone can see is still decided by team_members (erd_schema.sql),
--      so a stranger who signs up as "trainer" only ever sees their own
--      empty team.
-- =====================================================================

begin;

-- ---------- Role and name from the sign-up form ----------

-- The app sends { name, role } as user metadata when signing up.
-- Anything unexpected becomes 'athlete', the role with the least access.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_role in ('athlete', 'coach', 'trainer') then v_role else 'athlete' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------- Join codes ----------

-- Kept apart from teams so athletes and coaches, who can read their team's
-- row, can't read the codes.
create table public.team_codes (
  team_id uuid primary key references public.teams (id) on delete cascade,
  athlete_code text not null unique,
  coach_code text not null unique
);

alter table public.team_codes enable row level security;
revoke all on public.team_codes from anon, authenticated;
grant select on public.team_codes to authenticated;

create policy "Trainer sees team codes" on public.team_codes
  for select to authenticated
  using (private.is_trainer_of_team(team_id));

-- An 8-character code like "7F3A9C21". gen_random_uuid() is cryptographically
-- random, so codes can't be predicted.
create function private.new_join_code() returns text
language sql volatile set search_path = '' as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- ---------- Actions the app calls (supabase.rpc) ----------
-- "security definer" lets these write to tables the caller can't write to
-- directly, so each one checks who is calling before doing anything.

-- A trainer creates a team, becomes its trainer and gets its codes.
create function public.create_team(p_name text, p_sport text default null, p_school text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_team uuid;
begin
  if not exists (select 1 from public.users where id = v_me and role = 'trainer') then
    raise exception 'Only trainer accounts can create a team.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Give your team a name.';
  end if;

  insert into public.teams (name, sport, school)
  values (trim(p_name), nullif(trim(p_sport), ''), nullif(trim(p_school), ''))
  returning id into v_team;

  insert into public.team_members (team_id, user_id, role) values (v_team, v_me, 'trainer');
  insert into public.team_codes (team_id, athlete_code, coach_code)
  values (v_team, private.new_join_code(), private.new_join_code());
  return v_team;
end;
$$;

-- An athlete or coach joins with a code. Returns the team's id.
create function public.join_team(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_code text := upper(trim(coalesce(p_code, '')));
  v_my_role text;
  v_team uuid;
  v_code_role text;
begin
  select role into v_my_role from public.users where id = v_me;
  if v_my_role is null then
    raise exception 'Your account is not set up yet. Sign out and back in.';
  end if;

  select team_id, case when athlete_code = v_code then 'athlete' else 'coach' end
  into v_team, v_code_role
  from public.team_codes
  where athlete_code = v_code or coach_code = v_code;

  if v_team is null then
    raise exception 'That code doesn''t match any team. Check it with your trainer.';
  end if;
  if v_code_role <> v_my_role then
    raise exception 'That code is for % accounts, but you signed up as %.',
      v_code_role,
      case v_my_role when 'athlete' then 'an athlete' else 'a ' || v_my_role end;
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_team, v_me, v_my_role)
  on conflict (team_id, user_id) do nothing; -- joining twice is fine
  return v_team;
end;
$$;

-- A trainer replaces both codes, e.g. if one was shared too widely.
-- People already on the team stay on it.
create function public.reset_team_codes(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_trainer_of_team(p_team) then
    raise exception 'Only this team''s trainer can change its codes.';
  end if;
  update public.team_codes
  set athlete_code = private.new_join_code(), coach_code = private.new_join_code()
  where team_id = p_team;
end;
$$;

revoke execute on function public.create_team(text, text, text), public.join_team(text), public.reset_team_codes(uuid)
  from public, anon;
grant execute on function public.create_team(text, text, text), public.join_team(text), public.reset_team_codes(uuid)
  to authenticated;
revoke execute on function private.new_join_code() from public, anon;

commit;
