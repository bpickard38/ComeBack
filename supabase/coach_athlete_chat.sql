-- =====================================================================
-- Comeback: a private trainer <-> coaches conversation about one athlete.
-- Run AFTER erd_schema.sql and live_data.sql: SQL Editor > New query >
-- paste > Run. Safe to run again.
--
-- Until now a team had one coach <-> trainer conversation for everything.
-- This adds a third kind of conversation, 'coach_athlete': one per athlete
-- per team, between that team's trainers and coaches. The athlete is never
-- a member, so they can't read it. It is still only messages: coaches get
-- no new access to injuries, logs, results or notes.
--
-- A conversation is created the first time a trainer or coach opens it in
-- the app (coach_athlete_conversation below). Staff who join the team
-- later are added automatically.
-- =====================================================================

begin;

-- ---------- 1. Allow the new kind ----------

-- The two CHECK rules on conversations were made without names, so find and
-- drop whatever is there, then add them back with the new kind included.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.conversations'::regclass and contype = 'c'
  loop
    execute format('alter table public.conversations drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.conversations
  add constraint conversations_kind_check
    check (kind in ('trainer_athlete', 'coach_trainer', 'coach_athlete')),
  -- Only the whole-team coach thread has no athlete.
  add constraint conversations_athlete_check
    check ((kind = 'coach_trainer') = (athlete_id is null));

-- One per athlete per team.
create unique index if not exists conversations_coach_athlete_key
  on public.conversations (team_id, athlete_id)
  where kind = 'coach_athlete';

-- ---------- 2. Open (or find) the conversation ----------

-- Called by the app when a trainer or coach opens the chat about an athlete.
-- Returns the conversation's id, with every trainer and coach on the team in it.
create or replace function public.coach_athlete_conversation(p_team uuid, p_athlete uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.is_staff_of_team(p_team) then
    raise exception 'Only this team''s trainers and coaches can open this conversation.';
  end if;
  if not exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = p_athlete and role = 'athlete'
  ) then
    raise exception 'That athlete isn''t on this team.';
  end if;

  select id into v_id from public.conversations
  where kind = 'coach_athlete' and team_id = p_team and athlete_id = p_athlete;
  if v_id is null then
    insert into public.conversations (kind, team_id, athlete_id)
    values ('coach_athlete', p_team, p_athlete)
    on conflict (team_id, athlete_id) where kind = 'coach_athlete' do nothing
    returning id into v_id;
    if v_id is null then -- someone else opened it at the same moment
      select id into v_id from public.conversations
      where kind = 'coach_athlete' and team_id = p_team and athlete_id = p_athlete;
    end if;
  end if;

  -- Staff only. The athlete is deliberately left out.
  insert into public.conversation_members (conversation_id, user_id)
  select v_id, user_id from public.team_members
  where team_id = p_team and role in ('trainer', 'coach')
  on conflict do nothing;
  return v_id;
end;
$$;

revoke execute on function public.coach_athlete_conversation(uuid, uuid) from public, anon;
grant execute on function public.coach_athlete_conversation(uuid, uuid) to authenticated;

-- ---------- 3. Keep membership in step with the roster ----------

-- A trainer or coach who joins a team gets its existing athlete
-- conversations; one who is removed loses them.
create or replace function private.sync_coach_athlete_members() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.role in ('trainer', 'coach') then
    insert into public.conversation_members (conversation_id, user_id)
    select c.id, new.user_id from public.conversations c
    where c.team_id = new.team_id and c.kind = 'coach_athlete'
    on conflict do nothing;
  elsif tg_op = 'DELETE' and old.role in ('trainer', 'coach') then
    delete from public.conversation_members m
    using public.conversations c
    where m.conversation_id = c.id and m.user_id = old.user_id
      and c.team_id = old.team_id and c.kind = 'coach_athlete';
  end if;
  return null;
end;
$$;

revoke execute on function private.sync_coach_athlete_members() from public, anon;

drop trigger if exists sync_coach_athlete_members on public.team_members;
create trigger sync_coach_athlete_members
  after insert or delete on public.team_members
  for each row execute function private.sync_coach_athlete_members();

commit;

-- Check it worked: should show the two rules with 'coach_athlete' in the first.
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.conversations'::regclass and contype = 'c';
