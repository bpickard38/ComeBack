/*
  Push reminders on this device.

  Turning them on asks the browser for permission, registers the service
  worker (public/sw.js), and gets a "subscription": an address only this
  browser can receive at, plus keys to encrypt messages for it. We save that
  in Supabase with the device's time zone, and the send-reminders function
  posts to it at 6 PM and 9 AM. See supabase/push.sql and
  README.md > Push reminders.
*/
import type { Result } from './domain/types';
import { supabase } from './store/supabase';

/** The VAPID public key: identifies our server to the browser's push service. */
const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/**
 * not-configured: the app has no VAPID key (a setup step, not the athlete's problem).
 * needs-install: iPhone/iPad only allow push from apps added to the home screen.
 */
export type PushStatus = 'not-configured' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

function isAppleMobile(): boolean {
  // iPads report themselves as Macs, but Macs don't have touch screens.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
}

function isInstalled(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function supportsPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!PUBLIC_KEY) return 'not-configured';
  if (isAppleMobile() && !isInstalled()) return 'needs-install';
  if (!supportsPush()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Browsers want the key as bytes; it's stored as URL-safe base64 text. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function turnOnReminders(): Promise<Result> {
  if (!PUBLIC_KEY || !supportsPush()) return { ok: false, error: 'This browser can’t show reminders.' };
  // Must run right after a tap: browsers ignore permission requests otherwise.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'Notifications are blocked. Allow them for this site in your browser settings, then try again.' };
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
    const { keys } = subscription.toJSON();
    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: keys?.p256dh ?? '',
      p_auth: keys?.auth ?? '',
      p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (error) {
      await subscription.unsubscribe(); // don't leave the browser thinking it's on
      return { ok: false, error: `Could not turn on reminders. ${error.message}` };
    }
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: `Could not turn on reminders. ${err instanceof Error ? err.message : ''}`.trim() };
  }
}

/** Stops reminders on this device. Also used on sign out, so the next person doesn't get yours. */
export async function turnOffReminders(): Promise<Result> {
  if (!supportsPush()) return { ok: true, value: undefined };
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true, value: undefined };
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
  return error ? { ok: false, error: `Could not turn off reminders. ${error.message}` } : { ok: true, value: undefined };
}

/**
 * Demo only: shows a notification right now, the way the real one looks,
 * without waiting for 6 PM or involving the server.
 */
export async function previewReminder(title: string, body: string): Promise<Result> {
  const registration = supportsPush() ? await navigator.serviceWorker.getRegistration('/') : undefined;
  if (!registration || Notification.permission !== 'granted') {
    return { ok: false, error: 'Turn on reminders first (on Today), then try the preview.' };
  }
  // A new tag each time: reusing one swaps out the old preview silently, so a second tap showed nothing.
  await registration.showNotification(title, { body, icon: '/icon-192.png', tag: `preview-${Date.now()}`, data: { url: '/athlete' } });
  return { ok: true, value: undefined };
}
