-- =====================================================================
-- Comeback: push reminders for athletes.
-- Run AFTER erd_schema.sql, signup.sql and live_data.sql. Safe to run again.
-- Then set up the sender and its schedule: README.md > Push reminders.
--
-- Two reminders, in each athlete's own time zone:
--   6 PM to 10 PM  "2 exercises left today"            if any are unlogged
--   9 AM to noon   "You missed 2 exercises yesterday"  if any went unlogged
-- The hours match REMINDER_HOUR and MISSED_HOUR in src/domain/reminder.ts.
-- Each goes out at most once a day; the notifications table remembers.
-- =====================================================================

begin;

-- ---------- Where to send: one row per phone or browser ----------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- From the browser's PushSubscription: an address only that browser can
  -- receive at, plus the keys to encrypt the message for it.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- e.g. 'America/Denver', so "6 PM" means 6 PM where the athlete is.
  time_zone text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists "See own devices" on public.push_subscriptions;
create policy "See own devices" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Turning reminders off (or signing out) deletes this device's row.
drop policy if exists "Remove own devices" on public.push_subscriptions;
create policy "Remove own devices" on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Adding goes through this function, so a browser that someone else used
-- before you (same endpoint) moves over to you instead of failing.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_zone text := p_time_zone;
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  -- An unknown zone name would break the time maths; fall back to UTC.
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    v_zone := 'UTC';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, time_zone)
  values (v_me, p_endpoint, p_p256dh, p_auth, v_zone)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        time_zone = excluded.time_zone;
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ---------- What was sent (the NOTIFICATIONS table from the ERD) ----------
-- Added beyond the ERD: 'push' channel, 'missed_exercises' kind, and the
-- title and body, so you can see in the Table Editor exactly what went out.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null
    check (kind in ('exercise_reminder', 'missed_exercises', 'appointment_reminder', 'message')),
  channel text not null default 'push' check (channel in ('in_app', 'sms', 'push')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  title text,
  body text,
  -- The athlete's 6 PM or 9 AM on that day. One of each kind per day.
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  unique (user_id, kind, scheduled_for)
);

alter table public.notifications enable row level security;

drop policy if exists "See own notifications" on public.notifications;
create policy "See own notifications" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Who is due a reminder right now ----------
-- Called by the send-reminders Edge Function every 15 minutes. It records
-- each due reminder as 'pending' (so a second run can't send it again) and
-- returns one row per device to send it to.

create or replace function public.claim_due_reminders()
returns table (
  notification_id uuid, kind text, title text, body text,
  endpoint text, p256dh text, auth text
)
language sql volatile security definer set search_path = '' as $$
  with athletes as (
    -- Athletes with reminders on, and the time where they are (their
    -- newest device decides the time zone).
    select distinct on (s.user_id)
      s.user_id, s.time_zone, (now() at time zone s.time_zone) as local_now
    from public.push_subscriptions s
    join public.users u on u.id = s.user_id and u.role = 'athlete'
    order by s.user_id, s.created_at desc
  ),
  current_case as (
    -- Same rule as the app: the newest active injury is "the plan".
    select distinct on (ai.athlete_id) ai.athlete_id, ai.id, ai.start_date
    from public.athlete_injuries ai
    where ai.status = 'active'
    order by ai.athlete_id, ai.start_date desc
  ),
  windows as (
    -- for_day: the day the reminder is about. local_at: when it's due.
    select a.user_id, a.time_zone, 'exercise_reminder' as kind,
      a.local_now::date as for_day, a.local_now::date + time '18:00' as local_at
    from athletes a
    where a.local_now::time >= time '18:00' and a.local_now::time < time '22:00'
    union all
    select a.user_id, a.time_zone, 'missed_exercises',
      a.local_now::date - 1, a.local_now::date + time '09:00'
    from athletes a
    where a.local_now::time >= time '09:00' and a.local_now::time < time '12:00'
  ),
  undone as (
    -- Plan exercises with no log on that day. A plan that started after
    -- that day can't have been missed.
    select w.user_id, w.kind, w.time_zone, w.local_at, e.name
    from windows w
    join current_case c on c.athlete_id = w.user_id and c.start_date <= w.for_day
    join public.plan_exercises pe on pe.athlete_injury_id = c.id and pe.active
    join public.exercises e on e.id = pe.exercise_id
    where not exists (
      select 1 from public.exercise_logs l
      where l.plan_exercise_id = pe.id and l.log_date = w.for_day
    )
  ),
  due as (
    select u.user_id, u.kind,
      u.local_at at time zone u.time_zone as scheduled_for,
      count(*)::int as n,
      string_agg(u.name, ', ' order by u.name) as names
    from undone u
    group by u.user_id, u.kind, u.time_zone, u.local_at
  ),
  claimed as (
    insert into public.notifications (user_id, kind, channel, status, title, body, scheduled_for)
    select d.user_id, d.kind, 'push', 'pending',
      case d.kind
        when 'exercise_reminder' then
          d.n || case when d.n = 1 then ' exercise' else ' exercises' end || ' left today'
        else
          'You missed ' || d.n || case when d.n = 1 then ' exercise' else ' exercises' end || ' yesterday'
      end,
      case d.kind
        when 'exercise_reminder' then d.names || '. A few minutes now keeps your streak going.'
        else d.names || '. Today''s plan is ready when you are.'
      end,
      d.scheduled_for
    from due d
    on conflict (user_id, kind, scheduled_for) do nothing
    returning id, user_id, kind, title, body
  )
  select c.id, c.kind, c.title, c.body, s.endpoint, s.p256dh, s.auth
  from claimed c
  join public.push_subscriptions s on s.user_id = c.user_id;
$$;

-- Only the Edge Function (using the service role) may run it.
revoke execute on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

commit;
