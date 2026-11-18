-- Demo-only seed: add two cleared injury cases for recovery-history/OKR demos.
-- Requires recovery_timeline.sql. Does not modify existing active injury cases.
-- Safe to rerun: the fixed case IDs prevent duplicate inserts.
begin;

with trainer_candidates as (
  select distinct on (ai.athlete_id)
    ai.athlete_id,
    ai.injury_id,
    trainer_tm.user_id as trainer_id
  from public.athlete_injuries ai
  join public.team_members athlete_tm
    on athlete_tm.user_id = ai.athlete_id
   and athlete_tm.role = 'athlete'
  join public.team_members trainer_tm
    on trainer_tm.team_id = athlete_tm.team_id
   and trainer_tm.role = 'trainer'
  where ai.status = 'active'
  order by ai.athlete_id, ai.start_date desc, trainer_tm.user_id
), ranked_candidates as (
  select row_number() over (order by athlete_id) as slot, *
  from trainer_candidates
), demo_cases as (
  select * from (values
    (1, 'd3a08001-a5ba-4d12-9bc5-0b59627a1e01'::uuid, 14),
    (2, 'd3a08002-a5ba-4d12-9bc5-0b59627a1e02'::uuid, 28)
  ) as d(slot, case_id, recovery_days)
)
insert into public.athlete_injuries
  (id, athlete_id, injury_id, assigned_by, start_date, status, cleared_at, recovery_days)
select
  d.case_id,
  c.athlete_id,
  c.injury_id,
  c.trainer_id,
  current_date - d.recovery_days,
  'cleared',
  current_date::timestamp,
  d.recovery_days
from demo_cases d
join ranked_candidates c on c.slot = d.slot
on conflict (id) do nothing;

commit;

-- Cleanup for these two mock rows only, if you want to remove the demo data:
-- delete from public.athlete_injuries
-- where id in (
--   'd3a08001-a5ba-4d12-9bc5-0b59627a1e01'::uuid,
--   'd3a08002-a5ba-4d12-9bc5-0b59627a1e02'::uuid
-- );
