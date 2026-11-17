-- =====================================================================
-- Comeback: Player Pet, saved in the database.
-- Run AFTER erd_schema.sql: SQL Editor > New query > paste > Run.
-- Safe to run again.
--
-- athlete_pets: one row per athlete, the pet's look and settings.
-- pet_games:    one row per game he played (one a night). A game is saved
--               once and never changes, so his record stays the same even if
--               the trainer changes the plan later, and every device the
--               athlete signs in on shows the same season.
--
-- Only the athlete can read or write their own pet. Trainers and coaches
-- have no access: it's the athlete's game, not part of their medical record.
-- =====================================================================

begin;

create table if not exists public.athlete_pets (
  athlete_id uuid primary key references public.users (id) on delete cascade,
  enabled boolean not null default true,
  name text not null default 'Rookie' check (char_length(name) between 1 and 16),
  jersey_number smallint not null default 12 check (jersey_number between 0 and 99),
  jersey_color text not null default '#9b3223' check (jersey_color ~ '^#[0-9a-f]{6}$'),
  skin_tone text not null default '#f7cb94' check (skin_tone ~ '^#[0-9a-f]{6}$'),
  -- The day the pet joined; his first game is that night.
  started_on date not null default current_date,
  -- The last game day whose recap the athlete closed.
  seen_through date,
  -- The newest milestone goal he already celebrated.
  celebrated_goal_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.pet_games (
  athlete_id uuid not null references public.users (id) on delete cascade,
  day date not null,
  opponent text not null,
  energy smallint not null check (energy between 0 and 100),
  our_score smallint not null check (our_score >= 0),
  their_score smallint not null check (their_score >= 0),
  won boolean not null,
  touchdowns smallint not null check (touchdowns >= 0),
  yards smallint not null check (yards >= 0),
  primary key (athlete_id, day)
);

alter table public.athlete_pets enable row level security;
alter table public.pet_games enable row level security;
revoke all on public.athlete_pets from anon, authenticated;
revoke all on public.pet_games from anon, authenticated;
grant select, insert, update on public.athlete_pets to authenticated;
-- No update or delete on games: a played game is final.
grant select, insert on public.pet_games to authenticated;

drop policy if exists "Athlete reads own pet" on public.athlete_pets;
create policy "Athlete reads own pet" on public.athlete_pets
  for select to authenticated
  using (athlete_id = (select auth.uid()));

drop policy if exists "Athlete adds own pet" on public.athlete_pets;
create policy "Athlete adds own pet" on public.athlete_pets
  for insert to authenticated
  with check (athlete_id = (select auth.uid()));

drop policy if exists "Athlete edits own pet" on public.athlete_pets;
create policy "Athlete edits own pet" on public.athlete_pets
  for update to authenticated
  using (athlete_id = (select auth.uid()))
  with check (athlete_id = (select auth.uid()));

drop policy if exists "Athlete reads own games" on public.pet_games;
create policy "Athlete reads own games" on public.pet_games
  for select to authenticated
  using (athlete_id = (select auth.uid()));

drop policy if exists "Athlete saves own games" on public.pet_games;
create policy "Athlete saves own games" on public.pet_games
  for insert to authenticated
  -- Only games that have already been played (before today).
  with check (athlete_id = (select auth.uid()) and day < current_date + 1);

commit;

-- Check it worked: should list the five policies above.
-- select tablename, policyname from pg_policies where tablename in ('athlete_pets', 'pet_games');
