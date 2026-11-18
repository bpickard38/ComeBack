-- Comeback OKR dashboard and admin proxy time studies.
-- Run after erd_schema.sql and admin_role.sql in Supabase SQL Editor.
begin;

create table if not exists public.admin_okr_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users (id) on delete cascade,
  workflow text not null check (workflow in ('trainer_setup', 'coach_checkin')),
  duration_seconds int not null check (duration_seconds > 0),
  details jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);
create index if not exists admin_okr_sessions_completed_at_idx
  on public.admin_okr_sessions (completed_at desc);

alter table public.admin_okr_sessions enable row level security;
revoke all on public.admin_okr_sessions from anon, authenticated;
grant select, insert on public.admin_okr_sessions to authenticated;
drop policy if exists "Admins manage OKR sessions" on public.admin_okr_sessions;
create policy "Admins manage OKR sessions" on public.admin_okr_sessions
  for all to authenticated using (private.is_admin()) with check (
    private.is_admin() and admin_id = (select auth.uid())
  );

-- Only cohort aggregates leave the database. Completion denominator is each
-- active prescribed exercise per elapsed day of the current Monday-Sunday week.
create or replace function public.admin_okr_metrics(p_today date default current_date)
returns table (
  completed_exercises int,
  assigned_exercise_opportunities int,
  completion_percent numeric,
  recovered_cases int,
  average_recovery_days numeric
)
language sql stable security definer set search_path = '' as $$
  with week_bounds as (
    select (p_today - (extract(isodow from p_today)::int - 1)) as monday,
      p_today as today
  ),
  active_plan as (
    select pe.id as plan_exercise_id, ai.athlete_id
    from public.plan_exercises pe
    join public.athlete_injuries ai on ai.id = pe.athlete_injury_id
    where pe.active and ai.status = 'active'
  ),
  counts as (
    select
      coalesce((select count(*) from public.exercise_logs l
        join active_plan ap on ap.plan_exercise_id = l.plan_exercise_id
        cross join week_bounds w
        where l.log_date between w.monday and w.today), 0)::int as completed,
      coalesce((select count(*) from active_plan), 0)
        * (select (today - monday + 1) from week_bounds) as opportunities
  ),
  recovery as (
    select count(ai.recovery_days)::int as cases,
      round(avg(ai.recovery_days)::numeric, 1) as average_days
    from public.athlete_injuries ai
    where ai.status = 'cleared' and ai.recovery_days is not null
  )
  select c.completed, c.opportunities,
    case when c.opportunities = 0 then null
      else round(c.completed * 100.0 / c.opportunities, 1) end,
    r.cases, r.average_days
  from counts c cross join recovery r
  where private.is_admin();
$$;
revoke execute on function public.admin_okr_metrics(date) from public, anon;
grant execute on function public.admin_okr_metrics(date) to authenticated;

-- Coach proxy needs only the same availability summary the coach product view
-- receives; no injury names, diagnoses, plans, pain or milestone results.
create or replace function public.admin_okr_coach_roster()
returns table (
  athlete_id uuid,
  athlete_name text,
  team_id uuid,
  team_name text,
  availability text,
  expected_return date
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.name, tm.team_id, t.name, tm.availability, tm.expected_return
  from public.team_members tm
  join public.users u on u.id = tm.user_id
  join public.teams t on t.id = tm.team_id
  where tm.role = 'athlete' and private.is_admin()
  order by t.name, u.name;
$$;
revoke execute on function public.admin_okr_coach_roster() from public, anon;
grant execute on function public.admin_okr_coach_roster() to authenticated;

create or replace function public.admin_okr_best_times()
returns table (workflow text, best_seconds int, session_count bigint)
language sql stable security definer set search_path = '' as $$
  select s.workflow, min(s.duration_seconds), count(*)
  from public.admin_okr_sessions s
  where private.is_admin()
  group by s.workflow;
$$;
revoke execute on function public.admin_okr_best_times() from public, anon;
grant execute on function public.admin_okr_best_times() to authenticated;

commit;
