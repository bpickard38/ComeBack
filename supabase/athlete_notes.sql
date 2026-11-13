-- =====================================================================
-- Comeback: private trainer notes on an athlete's profile.
-- Run AFTER erd_schema.sql: SQL Editor > New query > paste > Run.
-- Safe to run again.
--
-- One note per athlete, for context the app doesn't track anywhere else
-- (past surgeries, allergies, what they told you in the training room).
-- Only trainers on a team with that athlete can read or write it. The
-- athlete and coaches have no access, so the coach privacy rule still holds.
-- =====================================================================

begin;

create table if not exists public.athlete_notes (
  athlete_id uuid primary key references public.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.athlete_notes enable row level security;
revoke all on public.athlete_notes from anon, authenticated;
grant select, insert, update on public.athlete_notes to authenticated;

drop policy if exists "Trainer reads notes" on public.athlete_notes;
create policy "Trainer reads notes" on public.athlete_notes
  for select to authenticated
  using (private.is_trainer_of(athlete_id));

drop policy if exists "Trainer writes notes" on public.athlete_notes;
create policy "Trainer writes notes" on public.athlete_notes
  for insert to authenticated
  with check (private.is_trainer_of(athlete_id) and updated_by = (select auth.uid()));

drop policy if exists "Trainer edits notes" on public.athlete_notes;
create policy "Trainer edits notes" on public.athlete_notes
  for update to authenticated
  using (private.is_trainer_of(athlete_id))
  with check (private.is_trainer_of(athlete_id) and updated_by = (select auth.uid()));

commit;

-- Check it worked: should list the three policies above.
-- select policyname from pg_policies where tablename = 'athlete_notes';
