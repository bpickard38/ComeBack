-- =====================================================================
-- Comeback: visit records, written when a trainer records a visit.
-- Run AFTER erd_schema.sql: SQL Editor > New query > paste > Run.
-- Safe to run again.
--
-- A visit is what happened when an athlete came in: how they're doing,
-- pain, what they did. The trainer says it out loud on the Record screen,
-- the AI drafts a visit card, and Save writes one row here (test results,
-- availability and plan changes from the same card go to their own tables).
--
-- Private like athlete_notes: only trainers on a team with the athlete can
-- read or write visits. Athletes and coaches have no access, so the coach
-- privacy rule still holds.
-- =====================================================================

begin;

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.users (id) on delete cascade,
  trainer_id uuid references public.users (id) on delete set null,
  visited_at timestamptz not null default now(),
  -- How they're doing, in the trainer's words (tidied by the AI, checked by the trainer).
  summary text not null check (char_length(summary) between 1 and 2000),
  -- Pain the athlete reported at the visit, 0 (none) to 10 (worst).
  pain int check (pain between 0 and 10),
  -- What they did in the training room.
  done_today text check (char_length(done_today) <= 1000)
);

create index if not exists visits_athlete_id_idx on public.visits (athlete_id, visited_at desc);
create index if not exists visits_trainer_id_idx on public.visits (trainer_id);

alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;
grant select, insert, delete on public.visits to authenticated;

drop policy if exists "Trainer reads visits" on public.visits;
create policy "Trainer reads visits" on public.visits
  for select to authenticated
  using (private.is_trainer_of(athlete_id));

drop policy if exists "Trainer records visits" on public.visits;
create policy "Trainer records visits" on public.visits
  for insert to authenticated
  with check (private.is_trainer_of(athlete_id) and trainer_id = (select auth.uid()));

-- A visit saved by mistake can be removed by the trainer who recorded it.
drop policy if exists "Trainer removes own visits" on public.visits;
create policy "Trainer removes own visits" on public.visits
  for delete to authenticated
  using (private.is_trainer_of(athlete_id) and trainer_id = (select auth.uid()));

commit;

-- Check it worked: should list the three policies above.
-- select policyname from pg_policies where tablename = 'visits';
