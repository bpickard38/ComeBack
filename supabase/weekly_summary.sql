-- =====================================================================
-- Comeback: weekly progress summary for coaches
--
-- Run after supabase/workout_sets.sql. SQL Editor > New query > paste >
-- Run. Safe to re-run.
--
-- Coaches can't read exercise_logs, plans, injuries or test_results (no
-- row level security policy lets them), and that stays true. This adds
-- one database function that does the reading for them and hands back
-- only counts per athlete:
--   * how many exercises are on the athlete's plan right now
--   * how many were logged on each day (last 90 days)
--   * how many goals are set, reached, and improved this week
-- No injury names, no pain ratings, no test values leave the database.
-- The app turns the day counts into week %, days complete, streak and
-- On track / Behind (src/domain/progress.ts), the same rules the
-- trainer's roster uses.
--
-- The function runs with the definer's rights (it has to, to read the
-- logs) and only returns athletes on a team where the caller is staff.
-- =====================================================================

begin;

-- p_today is the caller's local calendar day, sent by the app, because the
-- database's current_date is UTC ("tomorrow" on US evenings).
create or replace function public.coach_weekly_summary(p_today date default current_date)
returns table (
  athlete_id uuid,
  assigned int,
  done_by_day jsonb,
  goals_total int,
  goals_reached int,
  goals_improved int
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
  -- Exercises on the athlete's daily list today: active rows on active cases.
  active_plan as (
    select pe.id as plan_exercise_id, ai.athlete_id
    from public.plan_exercises pe
    join public.athlete_injuries ai on ai.id = pe.athlete_injury_id
    where pe.active and ai.status = 'active'
  ),
  -- Logs per day for those exercises. log_date is the athlete's own
  -- calendar day, written by the app when they logged.
  daily as (
    select l.athlete_id, l.log_date, count(*)::int as done
    from public.exercise_logs l
    join active_plan ap on ap.plan_exercise_id = l.plan_exercise_id
    where l.log_date between p_today - 90 and p_today
    group by l.athlete_id, l.log_date
  ),
  -- Monday of p_today's week (ISO: Monday = 1), as a timestamp for results.
  week as (
    select (p_today - (extract(isodow from p_today)::int - 1))::timestamptz as monday
  ),
  goals as (
    select
      ai.athlete_id,
      cm.target,
      cm.baseline,
      (select r.value from public.test_results r
        where r.case_milestone_id = cm.id
        order by r.recorded_at desc limit 1) as latest,
      (select r.value from public.test_results r
        where r.case_milestone_id = cm.id and r.recorded_at >= (select monday from week)
        order by r.recorded_at desc limit 1) as latest_this_week,
      (select r.value from public.test_results r
        where r.case_milestone_id = cm.id and r.recorded_at < (select monday from week)
        order by r.recorded_at desc limit 1) as latest_before_week
    from public.case_milestones cm
    join public.athlete_injuries ai on ai.id = cm.athlete_injury_id
    where ai.status = 'active'
  )
  select
    v.athlete_id,
    (select count(*) from active_plan ap where ap.athlete_id = v.athlete_id)::int as assigned,
    coalesce(
      (select jsonb_object_agg(d.log_date::text, d.done) from daily d where d.athlete_id = v.athlete_id),
      '{}'::jsonb
    ) as done_by_day,
    (select count(*) from goals g where g.athlete_id = v.athlete_id)::int as goals_total,
    (select count(*) from goals g where g.athlete_id = v.athlete_id and g.latest >= g.target)::int as goals_reached,
    -- Improved: a result this week that beats the last one before this
    -- week (or the baseline when this week's is the first).
    (select count(*) from goals g
      where g.athlete_id = v.athlete_id
        and g.latest_this_week > coalesce(g.latest_before_week, g.baseline))::int as goals_improved
  from visible v;
$$;

revoke execute on function public.coach_weekly_summary(date) from public, anon;
grant execute on function public.coach_weekly_summary(date) to authenticated;

commit;

-- Check: as any signed-in staff account, `select * from coach_weekly_summary();`
-- shows one row per athlete on your teams.
