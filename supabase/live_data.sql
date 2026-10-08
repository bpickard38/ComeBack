-- =====================================================================
-- Comeback: what the app needs to run on the real tables.
-- Run AFTER erd_schema.sql and signup.sql: SQL Editor > New query > Run.
--
--   1. Conversations belong to a team, and are created automatically:
--      - creating a team opens its coach <-> trainer conversation
--      - an athlete joining opens their athlete <-> trainer conversation
--      - a coach joining is added to the coach <-> trainer conversation
--   2. assign_plan(): the trainer's "Assign injury and exercises" form, as
--      one all-or-nothing step.
-- =====================================================================

begin;

-- ---------- 1. Conversations per team ----------

alter table public.conversations
  add column team_id uuid references public.teams (id) on delete cascade;

-- Add every trainer on the team to a conversation.
create function private.add_team_trainers(p_conversation uuid, p_team uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.conversation_members (conversation_id, user_id)
  select p_conversation, user_id from public.team_members
  where team_id = p_team and role = 'trainer'
  on conflict do nothing;
$$;

-- The team's coach <-> trainer conversation, created if it doesn't exist yet.
create function private.coach_conversation(p_team uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations
  where team_id = p_team and kind = 'coach_trainer'
  limit 1;
  if v_id is null then
    insert into public.conversations (kind, team_id) values ('coach_trainer', p_team)
    returning id into v_id;
  end if;
  perform private.add_team_trainers(v_id, p_team);
  return v_id;
end;
$$;

-- An athlete's conversation with the team's trainers, created if needed.
create function private.athlete_conversation(p_team uuid, p_athlete uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations
  where team_id = p_team and kind = 'trainer_athlete' and athlete_id = p_athlete
  limit 1;
  if v_id is null then
    insert into public.conversations (kind, team_id, athlete_id) values ('trainer_athlete', p_team, p_athlete)
    returning id into v_id;
  end if;
  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, p_athlete)
  on conflict do nothing;
  perform private.add_team_trainers(v_id, p_team);
  return v_id;
end;
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- create_team, now also opening the coach conversation.
create or replace function public.create_team(p_name text, p_sport text default null, p_school text default null)
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
  perform private.coach_conversation(v_team);
  return v_team;
end;
$$;

-- join_team, now also opening the right conversation.
create or replace function public.join_team(p_code text) returns uuid
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

  insert into public.team_members (team_id, user_id, role, availability)
  values (v_team, v_me, v_my_role, case when v_my_role = 'athlete' then 'cleared' end)
  on conflict (team_id, user_id) do nothing; -- joining twice is fine

  if v_my_role = 'athlete' then
    perform private.athlete_conversation(v_team, v_me);
  else
    insert into public.conversation_members (conversation_id, user_id)
    values (private.coach_conversation(v_team), v_me)
    on conflict do nothing;
  end if;
  return v_team;
end;
$$;

-- Teams created before this script: give them their conversations now.
do $$
declare
  r record;
begin
  for r in select distinct team_id from public.team_members loop
    perform private.coach_conversation(r.team_id);
  end loop;
  -- Old conversations without a team: attach them to the athlete's team.
  update public.conversations c set team_id = tm.team_id
  from public.team_members tm
  where c.team_id is null and c.athlete_id = tm.user_id and tm.role = 'athlete';
  for r in select team_id, user_id from public.team_members where role = 'athlete' loop
    perform private.athlete_conversation(r.team_id, r.user_id);
  end loop;
  for r in select team_id, user_id from public.team_members where role = 'coach' loop
    insert into public.conversation_members (conversation_id, user_id)
    values (private.coach_conversation(r.team_id), r.user_id)
    on conflict do nothing;
  end loop;
end;
$$;

-- ---------- 2. Assigning a plan ----------

-- Sets an athlete's injury and exercise list in one step. If they have an
-- active case, its injury is updated (goals and history stay); otherwise a
-- new case starts. Exercises not picked are switched off, not deleted, so
-- past logs keep their names.
-- "security invoker" (the default): it runs as the trainer, so all the
-- row level security rules still apply.
create function public.assign_plan(p_athlete uuid, p_injury uuid, p_exercises uuid[])
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_case uuid;
begin
  if not private.is_trainer_of(p_athlete) then
    raise exception 'Only this athlete''s trainer can assign their plan.';
  end if;
  if p_injury is null or coalesce(cardinality(p_exercises), 0) = 0 then
    raise exception 'Pick an athlete, an injury and at least one exercise.';
  end if;

  select id into v_case from public.athlete_injuries
  where athlete_id = p_athlete and status = 'active'
  order by start_date desc
  limit 1;

  if v_case is null then
    insert into public.athlete_injuries (athlete_id, injury_id, assigned_by)
    values (p_athlete, p_injury, (select auth.uid()))
    returning id into v_case;
  else
    update public.athlete_injuries
    set injury_id = p_injury, assigned_by = (select auth.uid())
    where id = v_case;
  end if;

  update public.plan_exercises
  set active = (exercise_id = any (p_exercises))
  where athlete_injury_id = v_case;

  insert into public.plan_exercises (athlete_injury_id, exercise_id)
  select v_case, e from unnest(p_exercises) as e
  on conflict (athlete_injury_id, exercise_id) do update set active = true;

  return v_case;
end;
$$;

revoke execute on function public.assign_plan(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.assign_plan(uuid, uuid, uuid[]) to authenticated;

commit;
