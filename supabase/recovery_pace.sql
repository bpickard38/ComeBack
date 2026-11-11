-- =====================================================================
-- Comeback: recovery progress for the coach's screen.
-- Run AFTER erd_schema.sql: SQL Editor > New query > paste > Run.
-- Safe to run again.
--
-- The coach's recovery bar shows how far each athlete is through their
-- milestone tests, and the app projects "back to practice" and "back to
-- play" dates from how fast they're getting there. Coaches can't read
-- milestones or test results, so this function hands back only three things
-- per athlete: one percentage (0 to 100), the day their rehab started, and
-- the day their last injury was cleared (so the coach's Status list can keep
-- someone on it for a while after they're back). No injury names, test names
-- or test values.
--
-- The percentage is worked out the same way as the athlete's own Progress
-- tab (src/domain/goals.ts): each milestone's progress from its starting
-- value to its goal, averaged.
-- =====================================================================

begin;

-- Dropped first because the columns it returns have changed since the first
-- version, and Postgres won't change those in place.
drop function if exists public.coach_recovery();

create function public.coach_recovery()
returns table (
  athlete_id uuid,
  started date,
  percent int,
  cleared_on date
)
language sql stable security definer set search_path = '' as $$
  with visible as (
    -- Athletes on any team where the caller is a trainer or coach.
    select distinct athlete.user_id as athlete_id
    from public.team_members athlete
    join public.team_members staff on staff.team_id = athlete.team_id
    where athlete.role = 'athlete'
      and staff.user_id = (select auth.uid())
      and staff.role in ('trainer', 'coach')
  ),
  goals as (
    select
      ai.athlete_id,
      cm.baseline,
      cm.target,
      -- No result yet counts as still at the starting value.
      coalesce(
        (select r.value from public.test_results r
          where r.case_milestone_id = cm.id
          order by r.recorded_at desc limit 1),
        cm.baseline
      ) as current
    from public.case_milestones cm
    join public.athlete_injuries ai on ai.id = cm.athlete_injury_id
    where ai.status = 'active'
  ),
  scored as (
    select
      g.athlete_id,
      case
        when g.target - g.baseline <= 0 then case when g.current >= g.target then 100 else 0 end
        else greatest(0, least(100, round(100 * (g.current - g.baseline) / (g.target - g.baseline))))
      end as pct
    from goals g
  )
  select
    v.athlete_id,
    -- The oldest injury still being treated.
    (select min(ai.start_date) from public.athlete_injuries ai
      where ai.athlete_id = v.athlete_id and ai.status = 'active') as started,
    -- null when the trainer hasn't set any milestones.
    (select round(avg(s.pct))::int from scored s where s.athlete_id = v.athlete_id) as percent,
    -- The most recent day an injury was marked cleared; null if none ever was.
    (select max(ai.cleared_at)::date from public.athlete_injuries ai
      where ai.athlete_id = v.athlete_id and ai.status = 'cleared') as cleared_on
  from visible v;
$$;

revoke execute on function public.coach_recovery() from public, anon;
grant execute on function public.coach_recovery() to authenticated;

commit;

-- Check: as a signed-in coach or trainer, `select * from coach_recovery();`
-- shows one row per athlete on your teams.
