-- =====================================================================
-- Comeback: "Join the demo team" button for new athlete accounts.
-- Run AFTER signup.sql, live_data.sql and demo_data.sql.
-- Safe to run again.
--
-- For class demos: a new athlete can join the demo team ("Demo Soccer",
-- the one the demo trainer is on) without a join code. The demo team gets
-- a new code every time demo_data.sql runs, so this looks the current one
-- up and joins with it, using the same checks as a typed code.
--
-- Athletes only: coaches still need the coach code, because a coach can
-- see every athlete's status. To turn it off, set DEMO_TEAM_FEATURE to
-- false in src/features.ts, or remove the function:
--   drop function if exists public.join_demo_team();
-- =====================================================================

begin;

create or replace function public.join_demo_team() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if (select role from public.users where id = (select auth.uid())) is distinct from 'athlete' then
    raise exception 'Only athlete accounts can join the demo team without a code.';
  end if;

  -- The demo team is the one the demo trainer is on. Matching the trainer,
  -- not just the name, means another trainer's team called "Demo Soccer"
  -- can never be joined this way.
  select c.athlete_code into v_code
  from public.teams t
  join public.team_codes c on c.team_id = t.id
  join public.team_members m on m.team_id = t.id and m.role = 'trainer'
  join auth.users u on u.id = m.user_id
  where t.name = 'Demo Soccer' and u.email = 'bpickard38+demo-trainer@gmail.com'
  limit 1;

  if v_code is null then
    raise exception 'The demo team isn''t set up right now. Ask for a join code instead.';
  end if;
  return public.join_team(v_code);
end;
$$;

revoke execute on function public.join_demo_team() from public, anon;
grant execute on function public.join_demo_team() to authenticated;

commit;
