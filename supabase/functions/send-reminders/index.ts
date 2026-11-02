/*
  Supabase Edge Function: sends athletes' exercise reminders as push
  notifications. A schedule in the database (supabase/push_schedule.sql)
  calls it every 15 minutes; the database decides who is due
  (claim_due_reminders in supabase/push.sql) and this sends them.

  This runs on Supabase's servers (Deno), not in the browser. Deploy with:
    npx supabase functions deploy send-reminders --no-verify-jwt --use-api
  Secrets it needs (npm run push-secrets makes them): VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY, VAPID_SUBJECT and CRON_SECRET. SUPABASE_URL and
  SUPABASE_SERVICE_ROLE_KEY are provided automatically. See README.md >
  Push reminders.
*/
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}. Add it under Edge Functions > Secrets.`);
  return value;
}

webpush.setVapidDetails(secret('VAPID_SUBJECT'), secret('VAPID_PUBLIC_KEY'), secret('VAPID_PRIVATE_KEY'));

// The service role can run claim_due_reminders and read every device.
const db = createClient(secret('SUPABASE_URL'), secret('SUPABASE_SERVICE_ROLE_KEY'));

interface DueReminder {
  notification_id: string;
  kind: string;
  title: string;
  body: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  // Only the schedule knows this secret, so nobody else can trigger sends.
  if (request.headers.get('Authorization') !== `Bearer ${secret('CRON_SECRET')}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data, error } = await db.rpc('claim_due_reminders');
  if (error) return json({ error: error.message }, 500);
  const due = (data ?? []) as DueReminder[];

  // One reminder can go to several devices (phone and laptop). It counts as
  // sent if it reached at least one.
  const delivered = new Map<string, boolean>();
  for (const r of due) {
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        // The service worker (public/sw.js) reads these fields.
        JSON.stringify({ title: r.title, body: r.body, tag: r.kind, url: '/athlete' }),
        { TTL: 3 * 60 * 60 }, // a phone that's off for 3+ hours skips a stale reminder
      );
      delivered.set(r.notification_id, true);
    } catch (err) {
      // 404/410: the browser dropped this subscription (reminders turned off,
      // app uninstalled), so forget the device.
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', r.endpoint);
      } else {
        console.error(`Push to ${new URL(r.endpoint).host} failed`, status, err);
      }
      if (!delivered.has(r.notification_id)) delivered.set(r.notification_id, false);
    }
  }

  const sent = [...delivered].filter(([, ok]) => ok).map(([id]) => id);
  const failed = [...delivered].filter(([, ok]) => !ok).map(([id]) => id);
  if (sent.length > 0) {
    await db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: 1 }).in('id', sent);
  }
  if (failed.length > 0) {
    await db.from('notifications').update({ status: 'failed', attempts: 1 }).in('id', failed);
  }
  return json({ sent: sent.length, failed: failed.length });
});
