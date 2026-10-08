-- =====================================================================
-- Comeback: full database from reference/erd.mmd
--
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Everything is inside one transaction, so if any line fails nothing is
-- created and you can fix it and run again.
--
-- Order: 1 tables, 2 helper functions, 3 automatic rules (triggers),
--        4 security (row level security), 5 catalog data.
--
-- Not included: notifications (skipped until real reminders are in scope).
-- The existing app_state table (supabase/schema.sql) is left alone.
-- =====================================================================

begin;

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- ---------- People and teams ----------

-- One row per person, linked 1:1 to their Supabase login (auth.users).
-- Rows are created automatically when you add a user (see section 3).
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text, -- for SMS reminders later
  role text not null default 'athlete' check (role in ('athlete', 'trainer', 'coach')),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text,
  school text
);

-- The roster. Who is on which team, and as what. This table decides who can
-- see whom: a trainer or coach only sees athletes on their own teams.
create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('athlete', 'trainer', 'coach')),
  -- Added beyond the ERD: what the coach sees instead of medical details.
  -- Set by the trainer; only used on athlete rows.
  availability text check (availability in ('out', 'limited', 'cleared')),
  expected_return date,
  primary key (team_id, user_id),
  check (role = 'athlete' or (availability is null and expected_return is null))
);

-- ---------- Rehab plan ----------

-- Catalog of injuries the trainer picks from.
create table public.injuries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  body_region text
);

-- An injury case: one athlete, one injury, from start to cleared.
-- The plan, goals and appointments all hang off this.
create table public.athlete_injuries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.users (id) on delete cascade,
  injury_id uuid not null references public.injuries (id),
  assigned_by uuid references public.users (id) on delete set null, -- the trainer
  start_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'cleared')),
  cleared_at timestamptz,
  check ((status = 'cleared') = (cleared_at is not null))
);

-- Catalog of exercises, each with a tutorial video.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  video_url text
);

-- An exercise prescribed for one case. Sets/reps/hold live here so the same
-- exercise can be prescribed differently for different athletes.
create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  athlete_injury_id uuid not null references public.athlete_injuries (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  sets int check (sets > 0),
  reps int check (reps > 0),
  hold_seconds int check (hold_seconds > 0),
  active boolean not null default true,
  unique (athlete_injury_id, exercise_id)
);

-- ---------- Daily logging ----------

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  plan_exercise_id uuid not null references public.plan_exercises (id) on delete cascade,
  athlete_id uuid not null references public.users (id) on delete cascade,
  -- The athlete's local calendar day. Send it from the app: the database's
  -- current_date is in UTC, which is "tomorrow" on US evenings.
  log_date date not null default current_date,
  logged_at timestamptz not null default now(),
  source text not null default 'app' check (source in ('app', 'in_office')),
  -- Added beyond the ERD: pain felt, 0 (none) to 10 (worst). The app requires
  -- it; an in-office log entered by the trainer may leave it empty.
  pain smallint check (pain between 0 and 10),
  check (source <> 'app' or pain is not null),
  -- The "can't log the same exercise twice in a day" rule.
  unique (plan_exercise_id, log_date)
);

-- ---------- Milestones ----------

-- Catalog of tests, with a plain-language explanation for athletes.
create table public.milestone_tests (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  unit text not null
);

-- A test as a goal for one case: where they started and where they need to get.
create table public.case_milestones (
  id uuid primary key default gen_random_uuid(),
  athlete_injury_id uuid not null references public.athlete_injuries (id) on delete cascade,
  test_id uuid not null references public.milestone_tests (id),
  baseline numeric not null,
  target numeric not null, -- set by the trainer
  unique (athlete_injury_id, test_id)
);

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  case_milestone_id uuid not null references public.case_milestones (id) on delete cascade,
  value numeric not null check (value >= 0),
  recorded_by uuid references public.users (id) on delete set null,
  source text not null check (source in ('athlete', 'trainer')),
  -- Empty until the trainer confirms a self-reported result.
  confirmed_by uuid references public.users (id) on delete set null,
  confirmed_at timestamptz,
  recorded_at timestamptz not null default now(),
  check ((confirmed_by is null) = (confirmed_at is null))
);

-- ---------- Appointments ----------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.users (id) on delete cascade,
  trainer_id uuid references public.users (id) on delete set null,
  athlete_injury_id uuid references public.athlete_injuries (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled'))
);

-- "What to work on before this visit": tests...
create table public.appointment_tests (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  case_milestone_id uuid not null references public.case_milestones (id) on delete cascade,
  note text, -- added beyond the ERD: e.g. "Retest: aim for 25 sec"
  primary key (appointment_id, case_milestone_id)
);

-- ...and exercises.
create table public.appointment_exercises (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  plan_exercise_id uuid not null references public.plan_exercises (id) on delete cascade,
  primary key (appointment_id, plan_exercise_id)
);

-- ---------- Gamification ----------

-- The rank ladder. Change thresholds here without touching anyone's points.
create table public.ranks (
  id int primary key,
  name text not null unique,
  metal text not null check (metal in ('bronze', 'silver', 'gold')),
  min_points int not null unique check (min_points >= 0)
);

-- The points ledger. Totals are added up from here, never stored, so they
-- can't drift. Rows are created automatically (see section 3).
create table public.point_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.users (id) on delete cascade,
  source_type text not null check (source_type in ('exercise_log', 'goal_reached', 'prior')),
  -- The log or case milestone that earned the points. Empty only for 'prior'
  -- (exercises done before the app).
  source_id uuid,
  points int not null, -- 1 per exercise, 10 per goal
  created_at timestamptz not null default now(),
  check (source_type = 'prior' or source_id is not null),
  -- A log or goal can only award points once.
  unique (source_type, source_id)
);

-- ---------- Messaging ----------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('trainer_athlete', 'coach_trainer')),
  athlete_id uuid references public.users (id) on delete cascade,
  -- An athlete thread names its athlete; the coach thread doesn't.
  check ((kind = 'trainer_athlete') = (athlete_id is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.users (id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  sent_at timestamptz not null default now(),
  read_at timestamptz
);

-- Indexes on the columns the security rules and screens look up most.
create index on public.team_members (user_id);
create index on public.athlete_injuries (athlete_id);
create index on public.plan_exercises (athlete_injury_id);
create index on public.exercise_logs (athlete_id, log_date);
create index on public.case_milestones (athlete_injury_id);
create index on public.test_results (case_milestone_id);
create index on public.appointments (athlete_id, starts_at);
create index on public.point_events (athlete_id);
create index on public.conversation_members (user_id);
create index on public.messages (conversation_id, sent_at);

-- ---------- Derived: points and rank ----------

-- Points total and current rank per athlete, added up from the ledger.
-- security_invoker means it obeys the same security rules as point_events.
create view public.athlete_points with (security_invoker = true) as
select
  pe.athlete_id,
  sum(pe.points)::int as total_points,
  (
    select r.name from public.ranks r
    where r.min_points <= sum(pe.points)
    order by r.min_points desc
    limit 1
  ) as rank_name
from public.point_events pe
group by pe.athlete_id;

-- =====================================================================
-- 2. HELPER FUNCTIONS for the security rules
--
-- They live in a "private" schema, which the website can't call directly.
-- "security definer" lets them read the roster even though the security
-- rules would otherwise hide it (and stops rules from looping on themselves).
-- auth.uid() is the id of whoever is signed in and making the request.
-- =====================================================================

create schema if not exists private;

-- Am I a trainer on the same team as this athlete?
create function private.is_trainer_of(p_athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.team_members staff
    join public.team_members athlete on athlete.team_id = staff.team_id
    where staff.user_id = (select auth.uid()) and staff.role = 'trainer'
      and athlete.user_id = p_athlete and athlete.role = 'athlete'
  );
$$;

-- Is this me, or an athlete I train?
create function private.can_see_athlete(p_athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_athlete = (select auth.uid()) or private.is_trainer_of(p_athlete);
$$;

-- Am I a trainer on any team? (Who may edit the catalogs.)
create function private.is_trainer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where user_id = (select auth.uid()) and role = 'trainer'
  );
$$;

create function private.is_member_of_team(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = (select auth.uid())
  );
$$;

-- Trainer or coach on this team.
create function private.is_staff_of_team(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = (select auth.uid()) and role in ('trainer', 'coach')
  );
$$;

create function private.is_trainer_of_team(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = (select auth.uid()) and role = 'trainer'
  );
$$;

-- Are we on any team together?
create function private.shares_team(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.team_members mine
    join public.team_members theirs on theirs.team_id = mine.team_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

-- Which athlete does this case / plan exercise / milestone / appointment belong to?
create function private.case_athlete(p_case uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select athlete_id from public.athlete_injuries where id = p_case;
$$;

create function private.plan_athlete(p_plan uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select ai.athlete_id
  from public.plan_exercises pe
  join public.athlete_injuries ai on ai.id = pe.athlete_injury_id
  where pe.id = p_plan;
$$;

create function private.milestone_athlete(p_milestone uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select ai.athlete_id
  from public.case_milestones cm
  join public.athlete_injuries ai on ai.id = cm.athlete_injury_id
  where cm.id = p_milestone;
$$;

create function private.appointment_athlete(p_appointment uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select athlete_id from public.appointments where id = p_appointment;
$$;

create function private.is_conversation_member(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and user_id = (select auth.uid())
  );
$$;

-- May I add or remove people in this conversation? Trainers only: for an
-- athlete thread, the athlete must be theirs; for the coach thread, they must
-- already be in it (or it must still be empty, right after creating it).
create function private.can_manage_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation
      and private.is_trainer()
      and (
        (c.athlete_id is not null and private.is_trainer_of(c.athlete_id))
        or (
          c.kind = 'coach_trainer'
          and (
            private.is_conversation_member(c.id)
            or not exists (select 1 from public.conversation_members m where m.conversation_id = c.id)
          )
        )
      )
  );
$$;

-- Only signed-in users may run these, and only through the security rules.
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- =====================================================================
-- 3. AUTOMATIC RULES (triggers)
-- =====================================================================

-- When you add a user in Authentication > Users, give them a public.users row.
-- Their role starts as 'athlete'; change it in Table Editor > users if needed.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Logging an exercise earns 1 point. Done here, not by the app, so nobody
-- can give themselves points.
create function public.award_exercise_point() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.point_events (athlete_id, source_type, source_id, points)
  values (new.athlete_id, 'exercise_log', new.id, 1)
  on conflict (source_type, source_id) do nothing;
  return new;
end;
$$;

create trigger exercise_logs_award_point
after insert on public.exercise_logs
for each row execute function public.award_exercise_point();

-- If the trainer deletes a log, its point goes too.
create function public.remove_exercise_point() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.point_events where source_type = 'exercise_log' and source_id = old.id;
  return old;
end;
$$;

create trigger exercise_logs_remove_point
after delete on public.exercise_logs
for each row execute function public.remove_exercise_point();

-- A result that meets the target earns 10 points, once per goal.
-- source_id is the case milestone, so the unique rule stops a second award.
create function public.award_goal_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_target numeric;
  v_athlete uuid;
begin
  select cm.target, ai.athlete_id into v_target, v_athlete
  from public.case_milestones cm
  join public.athlete_injuries ai on ai.id = cm.athlete_injury_id
  where cm.id = new.case_milestone_id;

  if new.value >= v_target then
    insert into public.point_events (athlete_id, source_type, source_id, points)
    values (v_athlete, 'goal_reached', new.case_milestone_id, 10)
    on conflict (source_type, source_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger test_results_award_goal
after insert on public.test_results
for each row execute function public.award_goal_points();

-- Users already in Authentication before this script ran get their row now.
insert into public.users (id, name, email)
select id, coalesce(raw_user_meta_data ->> 'name', split_part(email, '@', 1)), email
from auth.users
on conflict (id) do nothing;

-- =====================================================================
-- 4. SECURITY (row level security)
--
-- With RLS on, every request is blocked unless a policy below allows it.
--   using (...)      = which existing rows you may see / change / delete
--   with check (...) = what new or changed rows must look like
-- Signed-out visitors ("anon") get nothing at all.
-- =====================================================================

-- Table-level permissions first. RLS then narrows these down row by row.
revoke all on
  public.users, public.teams, public.team_members, public.injuries,
  public.athlete_injuries, public.exercises, public.plan_exercises,
  public.exercise_logs, public.milestone_tests, public.case_milestones,
  public.test_results, public.appointments, public.appointment_tests,
  public.appointment_exercises, public.ranks, public.point_events,
  public.conversations, public.conversation_members, public.messages,
  public.athlete_points
from anon;

grant select, insert, update, delete on
  public.teams, public.injuries, public.athlete_injuries, public.exercises,
  public.plan_exercises, public.exercise_logs, public.milestone_tests,
  public.case_milestones, public.test_results, public.appointments,
  public.appointment_tests, public.appointment_exercises, public.point_events,
  public.conversations, public.conversation_members
to authenticated;
grant select on public.ranks, public.athlete_points to authenticated;

-- Some tables only allow changing certain columns:
-- people may edit their own name and phone, but not their role or email.
revoke all on public.users from authenticated;
grant select on public.users to authenticated;
grant update (name, phone) on public.users to authenticated;
-- trainers may change an athlete's availability, not their team or role.
revoke all on public.team_members from authenticated;
grant select, insert, delete on public.team_members to authenticated;
grant update (availability, expected_return) on public.team_members to authenticated;
-- messages can't be edited after sending; only marked as read.
revoke all on public.messages from authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.injuries enable row level security;
alter table public.athlete_injuries enable row level security;
alter table public.exercises enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.milestone_tests enable row level security;
alter table public.case_milestones enable row level security;
alter table public.test_results enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_tests enable row level security;
alter table public.appointment_exercises enable row level security;
alter table public.ranks enable row level security;
alter table public.point_events enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- ---------- People and teams ----------

-- You see yourself and anyone on a team with you.
create policy "See self and teammates" on public.users
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_team(id));

create policy "Edit own profile" on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "See own teams" on public.teams
  for select to authenticated
  using (private.is_member_of_team(id));

-- Staff see the whole roster (with availability). Athletes see their own row
-- and the staff, not other athletes.
create policy "See roster" on public.team_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_staff_of_team(team_id)
    or (private.is_member_of_team(team_id) and role <> 'athlete')
  );

create policy "Trainer adds to roster" on public.team_members
  for insert to authenticated
  with check (private.is_trainer_of_team(team_id));

create policy "Trainer sets availability" on public.team_members
  for update to authenticated
  using (private.is_trainer_of_team(team_id))
  with check (private.is_trainer_of_team(team_id));

create policy "Trainer removes from roster" on public.team_members
  for delete to authenticated
  using (private.is_trainer_of_team(team_id));

-- ---------- Catalogs: everyone reads, trainers edit ----------

create policy "Read injuries" on public.injuries for select to authenticated using (true);
create policy "Trainer adds injuries" on public.injuries for insert to authenticated with check (private.is_trainer());
create policy "Trainer edits injuries" on public.injuries for update to authenticated using (private.is_trainer()) with check (private.is_trainer());

create policy "Read exercises" on public.exercises for select to authenticated using (true);
create policy "Trainer adds exercises" on public.exercises for insert to authenticated with check (private.is_trainer());
create policy "Trainer edits exercises" on public.exercises for update to authenticated using (private.is_trainer()) with check (private.is_trainer());

create policy "Read tests" on public.milestone_tests for select to authenticated using (true);
create policy "Trainer adds tests" on public.milestone_tests for insert to authenticated with check (private.is_trainer());
create policy "Trainer edits tests" on public.milestone_tests for update to authenticated using (private.is_trainer()) with check (private.is_trainer());

create policy "Read ranks" on public.ranks for select to authenticated using (true);

-- ---------- Rehab plan: athlete reads own, trainer manages ----------
-- Coaches get no policy here, so they can't see injuries or plans at all.

create policy "Read cases" on public.athlete_injuries
  for select to authenticated
  using (private.can_see_athlete(athlete_id));

create policy "Trainer opens case" on public.athlete_injuries
  for insert to authenticated
  with check (private.is_trainer_of(athlete_id) and assigned_by = (select auth.uid()));

create policy "Trainer updates case" on public.athlete_injuries
  for update to authenticated
  using (private.is_trainer_of(athlete_id))
  with check (private.is_trainer_of(athlete_id));

create policy "Trainer deletes case" on public.athlete_injuries
  for delete to authenticated
  using (private.is_trainer_of(athlete_id));

create policy "Read plan" on public.plan_exercises
  for select to authenticated
  using (private.can_see_athlete(private.case_athlete(athlete_injury_id)));

create policy "Trainer adds to plan" on public.plan_exercises
  for insert to authenticated
  with check (private.is_trainer_of(private.case_athlete(athlete_injury_id)));

create policy "Trainer edits plan" on public.plan_exercises
  for update to authenticated
  using (private.is_trainer_of(private.case_athlete(athlete_injury_id)))
  with check (private.is_trainer_of(private.case_athlete(athlete_injury_id)));

create policy "Trainer removes from plan" on public.plan_exercises
  for delete to authenticated
  using (private.is_trainer_of(private.case_athlete(athlete_injury_id)));

-- ---------- Daily logging ----------

create policy "Read logs" on public.exercise_logs
  for select to authenticated
  using (private.can_see_athlete(athlete_id));

-- Athletes log their own plan exercises from the app; trainers can log an
-- in-office session for their athletes.
create policy "Log exercise" on public.exercise_logs
  for insert to authenticated
  with check (
    private.plan_athlete(plan_exercise_id) = athlete_id
    and (
      (athlete_id = (select auth.uid()) and source = 'app')
      or private.is_trainer_of(athlete_id)
    )
  );

create policy "Trainer deletes log" on public.exercise_logs
  for delete to authenticated
  using (private.is_trainer_of(athlete_id));

-- ---------- Milestones ----------

create policy "Read goals" on public.case_milestones
  for select to authenticated
  using (private.can_see_athlete(private.case_athlete(athlete_injury_id)));

create policy "Trainer sets goals" on public.case_milestones
  for insert to authenticated
  with check (private.is_trainer_of(private.case_athlete(athlete_injury_id)));

create policy "Trainer edits goals" on public.case_milestones
  for update to authenticated
  using (private.is_trainer_of(private.case_athlete(athlete_injury_id)))
  with check (private.is_trainer_of(private.case_athlete(athlete_injury_id)));

create policy "Trainer deletes goals" on public.case_milestones
  for delete to authenticated
  using (private.is_trainer_of(private.case_athlete(athlete_injury_id)));

create policy "Read results" on public.test_results
  for select to authenticated
  using (private.can_see_athlete(private.milestone_athlete(case_milestone_id)));

-- Athletes self-report (unconfirmed); trainers record their own measurements.
create policy "Record result" on public.test_results
  for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and (
      (
        source = 'athlete'
        and private.milestone_athlete(case_milestone_id) = (select auth.uid())
        and confirmed_by is null
      )
      or (source = 'trainer' and private.is_trainer_of(private.milestone_athlete(case_milestone_id)))
    )
  );

-- Only trainers confirm or correct results.
create policy "Trainer confirms result" on public.test_results
  for update to authenticated
  using (private.is_trainer_of(private.milestone_athlete(case_milestone_id)))
  with check (private.is_trainer_of(private.milestone_athlete(case_milestone_id)));

create policy "Trainer deletes result" on public.test_results
  for delete to authenticated
  using (private.is_trainer_of(private.milestone_athlete(case_milestone_id)));

-- ---------- Appointments ----------

create policy "Read appointments" on public.appointments
  for select to authenticated
  using (private.can_see_athlete(athlete_id));

create policy "Trainer books appointment" on public.appointments
  for insert to authenticated
  with check (private.is_trainer_of(athlete_id));

create policy "Trainer edits appointment" on public.appointments
  for update to authenticated
  using (private.is_trainer_of(athlete_id))
  with check (private.is_trainer_of(athlete_id));

create policy "Trainer deletes appointment" on public.appointments
  for delete to authenticated
  using (private.is_trainer_of(athlete_id));

create policy "Read appointment tests" on public.appointment_tests
  for select to authenticated
  using (private.can_see_athlete(private.appointment_athlete(appointment_id)));

create policy "Trainer adds appointment tests" on public.appointment_tests
  for insert to authenticated
  with check (private.is_trainer_of(private.appointment_athlete(appointment_id)));

create policy "Trainer edits appointment tests" on public.appointment_tests
  for update to authenticated
  using (private.is_trainer_of(private.appointment_athlete(appointment_id)))
  with check (private.is_trainer_of(private.appointment_athlete(appointment_id)));

create policy "Trainer removes appointment tests" on public.appointment_tests
  for delete to authenticated
  using (private.is_trainer_of(private.appointment_athlete(appointment_id)));

create policy "Read appointment exercises" on public.appointment_exercises
  for select to authenticated
  using (private.can_see_athlete(private.appointment_athlete(appointment_id)));

create policy "Trainer adds appointment exercises" on public.appointment_exercises
  for insert to authenticated
  with check (private.is_trainer_of(private.appointment_athlete(appointment_id)));

create policy "Trainer removes appointment exercises" on public.appointment_exercises
  for delete to authenticated
  using (private.is_trainer_of(private.appointment_athlete(appointment_id)));

-- ---------- Points ----------
-- Exercise and goal points are added by the triggers in section 3. The only
-- thing a person adds by hand is a trainer entering "prior" points.

create policy "Read points" on public.point_events
  for select to authenticated
  using (private.can_see_athlete(athlete_id));

create policy "Trainer adds prior points" on public.point_events
  for insert to authenticated
  with check (source_type = 'prior' and private.is_trainer_of(athlete_id));

create policy "Trainer removes prior points" on public.point_events
  for delete to authenticated
  using (source_type = 'prior' and private.is_trainer_of(athlete_id));

-- ---------- Messaging ----------
-- Who can talk to whom is decided by membership: a coach is only ever added
-- to coach_trainer conversations, so they can only message the trainer.

create policy "Read own conversations" on public.conversations
  for select to authenticated
  using (
    private.is_conversation_member(id)
    or (athlete_id is not null and private.is_trainer_of(athlete_id))
  );

create policy "Trainer starts conversation" on public.conversations
  for insert to authenticated
  with check (
    private.is_trainer()
    and (athlete_id is null or private.is_trainer_of(athlete_id))
  );

create policy "See members" on public.conversation_members
  for select to authenticated
  using (private.is_conversation_member(conversation_id) or private.can_manage_conversation(conversation_id));

create policy "Trainer adds member" on public.conversation_members
  for insert to authenticated
  with check (
    private.can_manage_conversation(conversation_id)
    and (user_id = (select auth.uid()) or private.shares_team(user_id))
  );

create policy "Trainer removes member" on public.conversation_members
  for delete to authenticated
  using (private.can_manage_conversation(conversation_id));

create policy "Read messages" on public.messages
  for select to authenticated
  using (private.is_conversation_member(conversation_id));

create policy "Send message" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id));

-- Mark someone else's message as read.
create policy "Mark read" on public.messages
  for update to authenticated
  using (private.is_conversation_member(conversation_id) and sender_id <> (select auth.uid()))
  with check (private.is_conversation_member(conversation_id));

-- =====================================================================
-- 5. CATALOG DATA (from src/domain/rank.ts and src/data/seed.ts)
-- No people or health records: add those through the app or Table Editor.
-- =====================================================================

insert into public.ranks (id, name, metal, min_points) values
  (1, 'Starter I', 'bronze', 0),
  (2, 'Starter II', 'bronze', 20),
  (3, 'Starter III', 'bronze', 40),
  (4, 'Varsity I', 'silver', 60),
  (5, 'Varsity II', 'silver', 90),
  (6, 'Varsity III', 'silver', 120),
  (7, 'All-conference I', 'gold', 160),
  (8, 'All-conference II', 'gold', 210),
  (9, 'All-conference III', 'gold', 270);

insert into public.injuries (name, body_region) values
  ('Ankle sprain', 'Ankle'),
  ('ACL reconstruction', 'Knee'),
  ('Hamstring strain', 'Thigh'),
  ('Shoulder impingement', 'Shoulder'),
  ('Patellar tendinopathy', 'Knee');

-- Videos are empty until real tutorials exist.
insert into public.exercises (name) values
  ('Ankle alphabet'),
  ('Double-leg calf raise'),
  ('Banded ankle eversion'),
  ('Single-leg balance'),
  ('Heel slides'),
  ('Quad sets'),
  ('Straight leg raise'),
  ('Mini squat'),
  ('Band external rotation'),
  ('Scapular squeeze'),
  ('Wall slide'),
  ('Glute bridge'),
  ('Slider hamstring curl'),
  ('Bird dog');

insert into public.milestone_tests (name, description, unit) values
  ('One-leg balance', 'How long you can stand on your injured leg.', 'seconds'),
  ('One-leg heel raises', 'How many heel raises you can do on your injured leg.', 'reps'),
  ('Ankle flexibility', 'How far your knee reaches toward a wall with your heel down.', 'cm'),
  ('Hop distance', 'How far you hop, compared with your healthy leg.', '% of healthy leg');

commit;
