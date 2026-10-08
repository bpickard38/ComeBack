-- =====================================================================
-- Comeback: demo data for the demo accounts (listed in README.md).
-- Run AFTER erd_schema.sql, signup.sql and live_data.sql.
--
-- Safe to run again: it deletes the demo team and the demo athletes'
-- records, then rebuilds them with dates relative to right now. Run it the
-- morning of a demo so "today" and "yesterday" look right.
--
-- The accounts themselves must already exist (sign up in the app, or ask
-- Claude to create them). Missing demo athletes are skipped.
-- All names and numbers are made up.
-- =====================================================================

begin;

do $$
declare
  -- Times are shown in this time zone; change it if you're not in Mountain time.
  tz constant text := 'America/Denver';

  v_trainer uuid := (select id from auth.users where email = 'bpickard38+demo-trainer@gmail.com');
  v_coach uuid := (select id from auth.users where email = 'bpickard38+demo-coach@gmail.com');
  v_team uuid;
  v_athlete uuid;
  v_case uuid;
  v_conv uuid;
  v_plan uuid[];
  v_id uuid;
  v_ms uuid;
  v_at timestamptz;
  a record;
  i int;
  d int;
begin
  if v_trainer is null or v_coach is null then
    raise exception 'Create the demo trainer and coach accounts first (see README.md).';
  end if;

  -- Make sure their roles are right even if they were made some other way.
  update public.users set role = 'trainer', name = 'Sam Rivera' where id = v_trainer;
  update public.users set role = 'coach', name = 'Coach Lee' where id = v_coach;

  -- ---------- Clean out the old demo ----------
  delete from public.teams t
  where exists (select 1 from public.team_members m where m.team_id = t.id and m.user_id = v_trainer);
  delete from public.athlete_injuries ai using auth.users u
  where ai.athlete_id = u.id and u.email like 'bpickard38+demo-%';
  delete from public.appointments ap using auth.users u
  where ap.athlete_id = u.id and u.email like 'bpickard38+demo-%';
  delete from public.point_events pe using auth.users u
  where pe.athlete_id = u.id and u.email like 'bpickard38+demo-%';
  delete from public.conversations c using auth.users u
  where c.athlete_id = u.id and u.email like 'bpickard38+demo-%';

  -- ---------- Team ----------
  insert into public.teams (name, sport, school) values ('Demo Soccer', 'Soccer', 'Demo University')
  returning id into v_team;
  insert into public.team_members (team_id, user_id, role) values
    (v_team, v_trainer, 'trainer'),
    (v_team, v_coach, 'coach');
  insert into public.team_codes (team_id, athlete_code, coach_code)
  values (v_team, private.new_join_code(), private.new_join_code());
  insert into public.conversation_members (conversation_id, user_id)
  values (private.coach_conversation(v_team), v_coach);

  -- ---------- Athletes ----------
  -- Plan: each exercise with its sets, reps and hold (null = not used).
  -- done: how many of their exercises they logged [two days ago, yesterday, today]
  -- pain: what they reported on those days
  for a in
    select * from (values
      ('bpickard38+demo-athlete@gmail.com', 'Maya Torres', 'Ankle sprain', 'limited', 14, 48,
        array['Ankle alphabet', 'Double-leg calf raise', 'Banded ankle eversion', 'Single-leg balance'],
        array[2, 3, 3, 3], array[null, 15, 12, null]::int[], array[null, null, null, 30]::int[],
        array[4, 4, 1], array[2, 1, 1]),
      ('bpickard38+demo-jordan@gmail.com', 'Jordan Reyes', 'ACL reconstruction', 'out', 75, 30,
        array['Heel slides', 'Quad sets', 'Straight leg raise', 'Mini squat'],
        array[3, 3, 3, 3], array[15, 10, 12, 10], array[null, 5, null, null]::int[],
        array[4, 4, 2], array[3, 3, 2]),
      ('bpickard38+demo-devon@gmail.com', 'Devon Clarke', 'Shoulder impingement', 'limited', 10, 12,
        array['Band external rotation', 'Scapular squeeze', 'Wall slide'],
        array[3, 3, 3], array[12, 15, 10], array[null, null, null]::int[],
        array[3, 1, 0], array[4, 6, 0]),
      ('bpickard38+demo-priya@gmail.com', 'Priya Nair', 'Hamstring strain', 'cleared', null, 70,
        array['Glute bridge', 'Slider hamstring curl', 'Bird dog'],
        array[3, 3, 3], array[12, 8, 10], array[null, null, null]::int[],
        array[3, 3, 3], array[0, 1, 0])
    ) as t(email, name, injury, availability, back_in_days, prior, exercises, sets, reps, holds, done, pain)
  loop
    select id into v_athlete from auth.users where email = a.email;
    continue when v_athlete is null; -- account doesn't exist: skip

    update public.users set role = 'athlete', name = a.name where id = v_athlete;
    insert into public.team_members (team_id, user_id, role, availability, expected_return)
    values (v_team, v_athlete, 'athlete', a.availability, current_date + a.back_in_days);
    perform private.athlete_conversation(v_team, v_athlete);

    insert into public.athlete_injuries (athlete_id, injury_id, assigned_by, start_date)
    select v_athlete, id, v_trainer, current_date - 21 from public.injuries where name = a.injury
    returning id into v_case;

    v_plan := array[]::uuid[];
    for i in 1 .. cardinality(a.exercises) loop
      insert into public.plan_exercises (athlete_injury_id, exercise_id, sets, reps, hold_seconds)
      select v_case, e.id, a.sets[i], a.reps[i], a.holds[i]
      from public.exercises e where e.name = a.exercises[i]
      returning id into v_id;
      v_plan := v_plan || v_id;
    end loop;

    -- Logs for the last three days. Times are relative to now, so they land
    -- on the right local day whenever this runs.
    for d in 0 .. 2 loop
      v_at := now() - make_interval(days => 2 - d, mins => case when d = 2 then 30 else 0 end);
      for i in 1 .. least(a.done[d + 1], cardinality(v_plan)) loop
        insert into public.exercise_logs (plan_exercise_id, athlete_id, log_date, logged_at, source, pain)
        values (v_plan[i], v_athlete, (v_at at time zone tz)::date, v_at, 'app', a.pain[d + 1]);
      end loop;
    end loop;

    -- Exercises done before the app: 1 point each.
    insert into public.point_events (athlete_id, source_type, source_id, points)
    values (v_athlete, 'prior', null, a.prior);
  end loop;

  -- ---------- Maya's goals, history and appointments ----------
  select ai.id into v_case
  from public.athlete_injuries ai join auth.users u on u.id = ai.athlete_id
  where u.email = 'bpickard38+demo-athlete@gmail.com' and ai.status = 'active';

  if v_case is not null then
    for a in
      select * from (values
        ('One-leg balance', 8, 30, array[8, 11, 15, 19, 22]),
        ('One-leg heel raises', 5, 25, array[5, 7, 10, 12, 14]),
        ('Ankle flexibility', 6, 12, array[6, 7, 8, 9, 9]),
        ('Hop distance', 55, 90, array[55, 60, 66, 70, 72])
      ) as t(test, baseline, target, history)
    loop
      insert into public.case_milestones (athlete_injury_id, test_id, baseline, target)
      select v_case, id, a.baseline, a.target from public.milestone_tests where name = a.test
      returning id into v_ms;
      -- One retest a week for five weeks, the latest one this week.
      for i in 1 .. 5 loop
        insert into public.test_results (case_milestone_id, value, recorded_by, source, confirmed_by, confirmed_at, recorded_at)
        values (v_ms, a.history[i], v_trainer, 'trainer', v_trainer,
          now() - make_interval(days => (5 - i) * 7, hours => 1),
          now() - make_interval(days => (5 - i) * 7, hours => 1));
      end loop;
    end loop;

    -- Three upcoming visits: what to work on before each one.
    for a in
      select * from (values
        (2, 'Weekly check-in',
          array['One-leg balance'], array['Retest: aim for 25 sec'],
          array['Single-leg balance', 'Banded ankle eversion']),
        (7, 'Strength and hop retest',
          array['One-leg heel raises', 'Hop distance'], array['Retest: aim for 18 reps', 'Retest: aim for 78%'],
          array['Double-leg calf raise', 'Banded ankle eversion']),
        (14, 'Return-to-play review',
          array['One-leg balance', 'One-leg heel raises', 'Ankle flexibility', 'Hop distance'],
          array['Target 30 sec', 'Target 25 reps', 'Target 12 cm', 'Target 90%'],
          array['Ankle alphabet', 'Double-leg calf raise', 'Banded ankle eversion', 'Single-leg balance'])
      ) as t(in_days, title, tests, notes, exercises)
    loop
      insert into public.appointments (athlete_id, trainer_id, athlete_injury_id, title, starts_at, location)
      select ai.athlete_id, v_trainer, v_case, a.title,
        ((current_date + a.in_days)::timestamp + time '15:30') at time zone tz,
        'Athletic training room'
      from public.athlete_injuries ai where ai.id = v_case
      returning id into v_id;

      insert into public.appointment_tests (appointment_id, case_milestone_id, note)
      select v_id, cm.id, a.notes[array_position(a.tests, mt.name)]
      from public.case_milestones cm join public.milestone_tests mt on mt.id = cm.test_id
      where cm.athlete_injury_id = v_case and mt.name = any (a.tests);

      insert into public.appointment_exercises (appointment_id, plan_exercise_id)
      select v_id, pe.id
      from public.plan_exercises pe join public.exercises e on e.id = pe.exercise_id
      where pe.athlete_injury_id = v_case and e.name = any (a.exercises);
    end loop;
  end if;

  -- ---------- Devon's message: the trainer's roster flags it ----------
  select c.id into v_conv
  from public.conversations c join auth.users u on u.id = c.athlete_id
  where u.email = 'bpickard38+demo-devon@gmail.com' and c.team_id = v_team;
  if v_conv is not null then
    insert into public.messages (conversation_id, sender_id, body, sent_at)
    select v_conv, c.athlete_id, 'My shoulder ached after wall slides yesterday. Should I keep doing them?',
      now() - interval '20 hours'
    from public.conversations c where c.id = v_conv;
  end if;
end;
$$;

commit;

-- Show the join codes for the new demo team.
select t.name, c.athlete_code, c.coach_code
from public.teams t join public.team_codes c on c.team_id = t.id
where t.name = 'Demo Soccer';
