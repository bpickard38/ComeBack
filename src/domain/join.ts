/*
  Join links. A trainer can share a link (or its QR code) instead of reading
  out a code. Opening it takes someone to sign up or sign in, and then adds
  them to the team without typing anything. The link carries the same join
  code, so it stops working when the trainer makes new codes.
*/
import type { Role } from './types';

/** Who a team's join codes are for. Trainers create teams; they don't join them. */
export type JoinRole = Extract<Role, 'athlete' | 'coach'>;

export interface JoinInvite {
  code: string;
  /** Which kind of account the code is for, to pre-pick it at sign-up. Missing on hand-typed links. */
  role: JoinRole | null;
}

/** Codes are 8 letters and digits (see new_join_code in supabase/signup.sql). */
const CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

/** "https://app.example/?join=7F3A9C21&as=athlete" */
export function joinLink(origin: string, code: string, role: JoinRole): string {
  return `${origin.replace(/\/+$/, '')}/?join=${encodeURIComponent(code)}&as=${role}`;
}

/** The invite in a page address's query string ("?join=...&as=..."), or null if there isn't a usable one. */
export function parseJoinLink(search: string): JoinInvite | null {
  const params = new URLSearchParams(search);
  const code = (params.get('join') ?? '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) return null;
  const as = params.get('as');
  return { code, role: as === 'athlete' || as === 'coach' ? as : null };
}

/** What goes with the link when it's shared to a group chat. */
export function inviteText(teamName: string, role: JoinRole, code: string): string {
  const who = role === 'athlete' ? 'an athlete' : 'a coach';
  return `Join ${teamName} on Comeback as ${who}. Open the link to sign up, or enter join code ${code}.`;
}
