-- =====================================================================
-- Comeback: tutorial videos and workout sets per injury
--
-- Run after multi_injury.sql. Safe to run again.
--
-- This script:
--   1. Adds four exercises so every injury has a full set.
--   2. Gives every exercise a short how-to (one line) and a tutorial
--      video. Videos are short public YouTube clips (about 20 to 60
--      seconds) from physical therapists and clinics, all checked to
--      allow playing inside another site.
--   3. Adds injury_exercises: the workout set for each injury, with
--      starting sets/reps/hold. When the trainer picks an injury on the
--      Assign form, its set is ticked for them; they can still change it.
--   4. Updates assign_plan() so new plan exercises start with the set's
--      sets/reps/hold. Exercises already on a plan keep what they had.
-- =====================================================================

begin;

-- ---------- 1 + 2. Exercises, how-tos and videos ----------

insert into public.exercises (name, description, video_url) values
  -- Ankle sprain
  ('Ankle alphabet', 'Sit with your leg out and trace A to Z in the air with your big toe. Move only the ankle.', 'https://www.youtube.com/watch?v=vHMJ0zgrsFU'),
  ('Double-leg calf raise', 'Rise onto your toes on both feet, pause at the top, lower slowly.', 'https://www.youtube.com/watch?v=cqDMYUaIXvw'),
  ('Banded ankle eversion', 'Band around the forefoot. Turn the foot out against the band, return slowly.', 'https://www.youtube.com/watch?v=xfrncpP5ONQ'),
  ('Single-leg balance', 'Stand on the injured leg, knee soft. Hold near a counter if you wobble.', 'https://www.youtube.com/watch?v=Dtgh2_LFkBQ'),
  -- ACL reconstruction
  ('Heel slides', 'Lying on your back, slide the heel toward you to bend the knee, then slide it back out.', 'https://www.youtube.com/watch?v=Bz0wSFRjH2c'),
  ('Quad sets', 'Leg straight, press the back of the knee into the floor and tighten the thigh. Hold.', 'https://www.youtube.com/watch?v=au62CidApd0'),
  ('Straight leg raise', 'Tighten the thigh first, then lift the straight leg to the height of the other knee.', 'https://www.youtube.com/watch?v=U4L_6JEv9Jg'),
  ('Mini squat', 'Feet hip-width, hold a counter, bend knees a little (about 45 degrees), stand back up.', 'https://www.youtube.com/watch?v=0YAFlev6AYg'),
  -- Shoulder impingement
  ('Band external rotation', 'Elbow at your side bent to 90 degrees. Rotate the hand out against the band, return slowly.', 'https://www.youtube.com/watch?v=_UvmPNGtlPM'),
  ('Scapular squeeze', 'Sit or stand tall and pinch your shoulder blades together and down. Hold, relax.', 'https://www.youtube.com/watch?v=ouRhQE2iOI8'),
  ('Wall slide', 'Forearms on the wall, slide your arms up as far as is comfortable, then back down.', 'https://www.youtube.com/watch?v=Eaj_NG5_hIo'),
  ('Prone Y raise', 'Lie face down, arms in a Y, thumbs up. Lift the arms a few inches using the shoulder blades.', 'https://www.youtube.com/watch?v=TudaAEghZdY'),
  -- Hamstring strain
  ('Glute bridge', 'On your back, knees bent. Squeeze your glutes and lift your hips until body is in a line.', 'https://www.youtube.com/watch?v=PhTDzR0TpZs'),
  ('Slider hamstring curl', 'Heels on sliders, hips up in a bridge. Slide the heels out slowly, pull them back in.', 'https://www.youtube.com/watch?v=kkkTfzi2gj4'),
  ('Bird dog', 'On hands and knees, reach one arm and the opposite leg out long. Keep your back still.', 'https://www.youtube.com/watch?v=ZdAHe9_HeEw'),
  ('Single-leg Romanian deadlift', 'Stand on one leg, hinge at the hip and reach down while the other leg goes back. Stand tall.', 'https://www.youtube.com/watch?v=YKVi-BsdKw4'),
  -- Patellar tendinopathy
  ('Spanish squat', 'Strap behind the knees anchored in front. Sit back into a squat, shins upright, and hold.', 'https://www.youtube.com/watch?v=1CJ3hteGxo4'),
  ('Eccentric step-down', 'Stand on a step on the injured leg. Lower the other heel to the floor slowly, step back up.', 'https://www.youtube.com/watch?v=clYXgefsFrQ')
on conflict (name) do update
  set description = excluded.description,
      video_url = excluded.video_url;

-- ---------- 3. Workout set per injury ----------

create table if not exists public.injury_exercises (
  injury_id uuid not null references public.injuries (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  sets int check (sets > 0),
  reps int check (reps > 0),
  hold_seconds int check (hold_seconds > 0),
  position int not null default 0, -- order shown on the Assign form
  primary key (injury_id, exercise_id)
);

create index if not exists injury_exercises_exercise_id_idx
  on public.injury_exercises (exercise_id);

alter table public.injury_exercises enable row level security;

-- Same rules as the other catalogs: everyone reads, trainers edit.
drop policy if exists "Read workout sets" on public.injury_exercises;
drop policy if exists "Trainer adds workout sets" on public.injury_exercises;
drop policy if exists "Trainer edits workout sets" on public.injury_exercises;
drop policy if exists "Trainer removes workout sets" on public.injury_exercises;
create policy "Read workout sets" on public.injury_exercises
  for select to authenticated using (true);
create policy "Trainer adds workout sets" on public.injury_exercises
  for insert to authenticated with check (private.is_trainer());
create policy "Trainer edits workout sets" on public.injury_exercises
  for update to authenticated using (private.is_trainer()) with check (private.is_trainer());
create policy "Trainer removes workout sets" on public.injury_exercises
  for delete to authenticated using (private.is_trainer());

grant select, insert, update, delete on public.injury_exercises to authenticated;

insert into public.injury_exercises (injury_id, exercise_id, sets, reps, hold_seconds, position)
select i.id, e.id, s.sets, s.reps, s.hold_seconds, s.position
from (values
  ('Ankle sprain', 'Ankle alphabet', 2, null, null, 1),
  ('Ankle sprain', 'Double-leg calf raise', 3, 15, null, 2),
  ('Ankle sprain', 'Banded ankle eversion', 3, 15, null, 3),
  ('Ankle sprain', 'Single-leg balance', 3, null, 30, 4),

  ('ACL reconstruction', 'Quad sets', 3, 10, 5, 1),
  ('ACL reconstruction', 'Heel slides', 3, 10, null, 2),
  ('ACL reconstruction', 'Straight leg raise', 3, 10, null, 3),
  ('ACL reconstruction', 'Mini squat', 3, 10, null, 4),

  ('Hamstring strain', 'Glute bridge', 3, 12, null, 1),
  ('Hamstring strain', 'Bird dog', 3, 10, null, 2),
  ('Hamstring strain', 'Slider hamstring curl', 3, 8, null, 3),
  ('Hamstring strain', 'Single-leg Romanian deadlift', 3, 8, null, 4),

  ('Shoulder impingement', 'Scapular squeeze', 3, 10, 5, 1),
  ('Shoulder impingement', 'Band external rotation', 3, 15, null, 2),
  ('Shoulder impingement', 'Wall slide', 3, 10, null, 3),
  ('Shoulder impingement', 'Prone Y raise', 3, 10, null, 4),

  ('Patellar tendinopathy', 'Spanish squat', 5, null, 45, 1),
  ('Patellar tendinopathy', 'Eccentric step-down', 3, 10, null, 2),
  ('Patellar tendinopathy', 'Glute bridge', 3, 12, null, 3),
  ('Patellar tendinopathy', 'Single-leg balance', 3, null, 30, 4)
) as s (injury, exercise, sets, reps, hold_seconds, position)
join public.injuries i on i.name = s.injury
join public.exercises e on e.name = s.exercise
on conflict (injury_id, exercise_id) do update
  set sets = excluded.sets,
      reps = excluded.reps,
      hold_seconds = excluded.hold_seconds,
      position = excluded.position;

-- ---------- 4. assign_plan uses the set's sets/reps/hold ----------

-- Same name, arguments and checks as multi_injury.sql. The only change:
-- a newly added plan exercise copies sets/reps/hold from the injury's
-- workout set (if the exercise is in it). Exercises already on the plan
-- keep their numbers, so a trainer's edits aren't overwritten.
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

  insert into public.plan_exercises (athlete_injury_id, exercise_id, sets, reps, hold_seconds)
  select v_case, e, ie.sets, ie.reps, ie.hold_seconds
  from unnest(p_exercises) as e
  left join public.injury_exercises ie on ie.injury_id = p_injury and ie.exercise_id = e
  on conflict (athlete_injury_id, exercise_id) do update set active = true;

  return v_case;
end;
$$;

commit;
