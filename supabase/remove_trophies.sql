-- Removes the points and rank (trophy) system from an existing database.
-- The app no longer has trophies; the Progress tab shows recovery milestones
-- instead, which come from case_milestones and test_results (untouched here).
--
-- Run in the Supabase SQL Editor AFTER the app version without trophies is
-- deployed. The older app still reads these tables and would fail to load.
--
-- This permanently deletes every athlete's points history. It cannot be undone.
-- Safe to run more than once.

begin;

-- Triggers that awarded points when a log or result was saved.
drop trigger if exists exercise_logs_award_point on public.exercise_logs;
drop trigger if exists exercise_logs_remove_point on public.exercise_logs;
drop trigger if exists test_results_award_goal on public.test_results;
drop trigger if exists case_milestones_remove_goal_points on public.case_milestones;

drop function if exists public.award_exercise_point();
drop function if exists public.remove_exercise_point();
drop function if exists public.award_goal_points();
drop function if exists public.remove_deleted_goal_points();

-- The totals view, then the tables. Their security rules go with them.
drop view if exists public.athlete_points;
drop table if exists public.point_events;
drop table if exists public.ranks;

commit;
