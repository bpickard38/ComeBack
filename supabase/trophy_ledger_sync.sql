-- Run after erd_schema.sql to align existing data with the trophy ledger.
-- Safe to run more than once: the ledger's unique key prevents duplicate awards.

begin;

-- The exercise trigger only covers new logs. Backfill logs recorded before it
-- was installed so the ledger and the athlete screen start from the same total.
insert into public.point_events (athlete_id, source_type, source_id, points)
select athlete_id, 'exercise_log', id, 1
from public.exercise_logs
on conflict (source_type, source_id) do nothing;

-- Award a goal once if any saved result met the current target. This matches
-- the one-time reward trigger used for future results.
insert into public.point_events (athlete_id, source_type, source_id, points)
select ai.athlete_id, 'goal_reached', cm.id, 10
from public.case_milestones cm
join public.athlete_injuries ai on ai.id = cm.athlete_injury_id
where exists (
  select 1
  from public.test_results tr
  where tr.case_milestone_id = cm.id
    and tr.value >= cm.target
)
on conflict (source_type, source_id) do nothing;

-- If a milestone is removed, its one-time reward should be removed too.
create or replace function public.remove_deleted_goal_points() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.point_events
  where source_type = 'goal_reached' and source_id = old.id;
  return old;
end;
$$;

drop trigger if exists case_milestones_remove_goal_points on public.case_milestones;
create trigger case_milestones_remove_goal_points
after delete on public.case_milestones
for each row execute function public.remove_deleted_goal_points();

commit;
