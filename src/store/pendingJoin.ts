/*
  Remembers a join link someone opened until they're signed in. The invite
  is taken off the address bar straight away and kept on this device, so it
  survives creating an account (and confirming an email, if that's on).
  AuthGate uses it once, right after sign-in, then forgets it.
*/
import { parseJoinLink, type JoinInvite } from '../domain/join';

const KEY = 'comeback.join';

/** An invite nobody acted on is forgotten after a week, so it can't surprise a later sign-in. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Call once when the app starts: moves ?join=... from the address into storage. */
export function capturePendingJoin(): void {
  const invite = parseJoinLink(window.location.search);
  if (!invite) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...invite, savedAt: Date.now() }));
  } catch {
    // Storage blocked: they can still type the code by hand.
  }
  // Drop the code from the address so it isn't bookmarked or shared by accident.
  window.history.replaceState(null, '', window.location.pathname);
}

/** The invite waiting to be used, if any. */
export function pendingJoin(): JoinInvite | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as JoinInvite & { savedAt?: number };
    if (!saved.code || Date.now() - (saved.savedAt ?? 0) > KEEP_MS) return null;
    return { code: saved.code, role: saved.role ?? null };
  } catch {
    return null;
  }
}

export function clearPendingJoin(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
