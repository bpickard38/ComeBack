-- =====================================================================
-- Comeback: run the send-reminders Edge Function every 15 minutes.
-- Do the steps in README.md > Push reminders first (push.sql, the
-- extensions pg_cron and pg_net, the function and its secrets).
-- =====================================================================

-- ---------- Part 1: give the database the shared secret ----------
-- The schedule sends CRON_SECRET (from supabase/.env.push.local) so the
-- function knows the call is ours. It's kept in Vault, Supabase's encrypted
-- store, so it isn't in this file. From the project folder, in Git Bash:
--
--   SECRET=$(grep '^CRON_SECRET=' supabase/.env.push.local | cut -d= -f2)
--   npx supabase db query --remote "select vault.create_secret('$SECRET', 'reminders_cron_secret')"
--
-- (If it already exists, use vault.update_secret(<its id>, '$SECRET') instead.)

-- ---------- Part 2: the schedule ----------
-- Replace YOUR-PROJECT-REF with the part before .supabase.co in your
-- project URL (it's in .env.local as VITE_SUPABASE_URL), then run just this
-- statement (SQL Editor, or npx supabase db query --remote).
-- Running it again with the same name updates the existing schedule.
select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---------- Checking on it ----------
-- Recent runs of the schedule:
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- What the function answered ({"sent":1,"failed":0}):
--   select status_code, content from net._http_response order by created desc limit 10;
-- What went out:
--   select * from public.notifications order by scheduled_for desc;
-- To stop it:
--   select cron.unschedule('send-reminders');
