-- =====================================================================
-- Comeback: athletes can have more than one injury at a time
--
-- Run after supabase/live_data.sql (and push.sql, if you set up push
-- reminders). SQL Editor > New query > paste > Run. One transaction, so
-- if any line fails nothing changes.
--
-- The tables were already many-to-many: athlete_injuries is the junction
-- between users (athletes) and injuries, so one athlete can have many
-- injury rows and one injury (e.g. "Ankle sprain") can be on many
-- athletes. What stopped it working was the logic on top:
--   * assign_plan() overwrote the athlete's one active case, so picking a
--     second injury replaced the first instead of adding to it.
--   * The push reminder query and the app only looked at the newest
--     active case.
--
-- This script:
--   1. Allows any number of active injuries per athlete, but only one
--      active case per (athlete, injury) pair, so the same injury can't
--      be opened twice at once.
--   2. Rewrites assign_plan(): it opens or updates the case for the
--      injury you pick and leaves the athlete's other injuries alone.
--   3. Adds clear_injury(): the trainer marks one injury as cleared.
--
-- If you set up push reminders, run supabase/push.sql again afterwards
-- (safe to re-run): its reminder query now covers every active injury.
-- =====================================================================

begin;

-- ---------- 1. One active case per athlete per injury ----------

-- If old data has the same injury open twice for one athlete, keep the
-- newest open and mark the rest cleared, so the index below can be built.
update public.athlete_injuries ai
set status = 'cleared', cleared_at = now()
where ai.status = 'active'
  and exists (
    select 1 from public.athlete_injuries newer
    where newer.athlete_id = ai.athlete_id
      and newer.injury_id = ai.injury_id
      and newer.status = 'active'
      and (newer.start_date, newer.id) > (ai.start_date, ai.id)
  );

-- Cleared cases don't count, so an athlete can re-injure the same spot
-- later and get a fresh case with its own history.
create unique index athlete_injuries_one_active_per_injury
  on public.athlete_injuries (athlete_id, injury_id)
  where status = 'active';

create index if not exists athlete_injuries_injury_id_idx
  on public.athlete_injuries (injury_id);

-- ---------- 2. Assigning a plan for one injury ----------

-- Opens a case for this athlete + injury, or updates it if one is already
-- active, and sets that case's exercise list. The athlete's other active
-- injuries and their exercises are not touched.
-- Exercises not picked are switched off, not deleted, so past logs keep
-- their names. Runs as the trainer (security invoker), so row level
-- security still applies. Same name and arguments as before, so the app
-- call doesn't change.
create or replace function public.assign_plan(p_athlete uuid, p_injury uuid, p_exercises uuid[])
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
  where athlete_id = p_athlete and injury_id = p_injury and status = 'active';

  if v_case is null then
    insert into public.athlete_injuries (athlete_id, injury_id, assigned_by)
    values (p_athlete, p_injury, (select auth.uid()))
    returning id into v_case;
  else
    update public.athlete_injuries
    set assigned_by = (select auth.uid())
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

-- ---------- 3. Clearing one injury ----------

-- Marks one case cleared. Its exercises drop off the athlete's daily list;
-- logs, goals and points stay for history.
create function public.clear_injury(p_case uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_trainer_of(private.case_athlete(p_case)) then
    raise exception 'Only this athlete''s trainer can clear an injury.';
  end if;

  update public.athlete_injuries
  set status = 'cleared', cleared_at = now()
  where id = p_case and status = 'active';
end;
$$;

revoke execute on function public.clear_injury(uuid) from public, anon;
grant execute on function public.clear_injury(uuid) to authenticated;

commit;
