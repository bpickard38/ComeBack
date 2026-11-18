-- Persist the recovery duration on each injury case when the trainer clears it.
-- Run after multi_injury.sql. Existing cleared cases are backfilled from their
-- start_date and cleared_at dates, so the OKR average includes their history.
begin;

alter table public.athlete_injuries
  add column if not exists recovery_days integer;

update public.athlete_injuries
set recovery_days = cleared_at::date - start_date
where status = 'cleared'
  and cleared_at is not null
  and recovery_days is null;

alter table public.athlete_injuries
  drop constraint if exists athlete_injuries_recovery_days_check;
alter table public.athlete_injuries
  add constraint athlete_injuries_recovery_days_check
  check (recovery_days is null or recovery_days >= 0);

alter table public.athlete_injuries
  drop constraint if exists athlete_injuries_recovery_status_check;
alter table public.athlete_injuries
  add constraint athlete_injuries_recovery_status_check
  check ((status = 'cleared') = (recovery_days is not null));

create or replace function public.clear_injury(p_case uuid)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_clear_date date := current_date;
  v_updated_id uuid;
begin
  if not private.is_trainer_of(private.case_athlete(p_case)) then
    raise exception 'Only this athlete''s trainer can clear an injury.';
  end if;

  update public.athlete_injuries
  set status = 'cleared',
      cleared_at = now(),
      recovery_days = greatest(0, v_clear_date - start_date)
  where id = p_case and status = 'active'
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'This injury is not active or could not be found.';
  end if;
end;
$$;

revoke execute on function public.clear_injury(uuid) from public, anon;
grant execute on function public.clear_injury(uuid) to authenticated;

-- The trainer profile's availability buttons update team status. When that
-- status becomes "cleared", close every currently active injury for this
-- athlete in the same transaction so both screens and OKR stay in sync.
create or replace function public.set_athlete_availability(
  p_athlete uuid,
  p_availability text,
  p_expected_return date default null
)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_clear_date date := current_date;
  v_updated_members integer;
begin
  if p_availability is null or p_availability not in ('out', 'limited', 'cleared') then
    raise exception 'Choose out, limited, or cleared availability.';
  end if;

  if not private.is_trainer_of(p_athlete) then
    raise exception 'Only this athlete''s trainer can change availability.';
  end if;

  update public.team_members
  set availability = p_availability,
      expected_return = case when p_availability = 'cleared' then null else p_expected_return end
  where user_id = p_athlete and role = 'athlete';
  get diagnostics v_updated_members = row_count;

  if v_updated_members = 0 then
    raise exception 'No team status was updated for this athlete.';
  end if;

  if p_availability = 'cleared' then
    update public.athlete_injuries
    set status = 'cleared',
        cleared_at = now(),
        recovery_days = greatest(0, v_clear_date - start_date)
    where athlete_id = p_athlete and status = 'active';
  end if;
end;
$$;

revoke execute on function public.set_athlete_availability(uuid, text, date) from public, anon;
grant execute on function public.set_athlete_availability(uuid, text, date) to authenticated;

commit;
