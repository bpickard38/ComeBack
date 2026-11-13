/*
  The trainer's roster lists everyone on the team, healthy or not. These
  rules sort it and narrow it down: injured or healthy, and for the injured,
  whether they're far enough along to be practicing.
*/
import { addDays, dayKey } from './dates';
import { PRACTICE_PERCENT, type RecoveryStatus } from './recovery';
import type { Athlete } from './types';

export type HealthFilter = 'all' | 'injured' | 'healthy';
export type PracticeFilter = 'any' | 'practicing' | 'not-practicing';

/** Injured means at least one injury the trainer hasn't cleared. */
export function isInjured(athlete: Pick<Athlete, 'injuries'>): boolean {
  return athlete.injuries.length > 0;
}

/**
 * Is an injured athlete far enough along to practice? Decided by their
 * progress: at or past PRACTICE_PERCENT of the way through their milestone
 * tests. With no milestones to go on, the trainer's own status decides
 * (Limited and Cleared practice, Out doesn't).
 */
export function isPracticing(
  athlete: Pick<Athlete, 'availability'>,
  recovery: RecoveryStatus | undefined,
): boolean {
  if (recovery && recovery.percent !== null) return recovery.percent >= PRACTICE_PERCENT;
  return athlete.availability !== 'out';
}

/**
 * The roster for the chosen filters. "All" lists injured athletes first,
 * then healthy ones, each group by name. The practice filter only applies
 * to injured athletes.
 */
export function filterRoster<T extends Pick<Athlete, 'id' | 'name' | 'injuries' | 'availability'>>(
  athletes: T[],
  health: HealthFilter,
  practice: PracticeFilter,
  recovery: Record<string, RecoveryStatus> | null,
): T[] {
  return athletes
    .filter((a) => {
      if (health === 'healthy') return !isInjured(a);
      if (health === 'all') return true;
      if (!isInjured(a)) return false;
      if (practice === 'any') return true;
      return isPracticing(a, recovery?.[a.id]) === (practice === 'practicing');
    })
    .sort((a, b) => Number(isInjured(b)) - Number(isInjured(a)) || a.name.localeCompare(b.name));
}

/** How long a cleared athlete stays on the coach's Status list, in days. */
export const RECENTLY_CLEARED_DAYS = 14;

/**
 * Does this athlete belong on the coach's Status list? It's for people the
 * coach needs to plan around: anyone not fully available, anyone still in
 * rehab, and anyone cleared in the last RECENTLY_CLEARED_DAYS days. Healthy
 * athletes who haven't been hurt lately are left off.
 */
export function onCoachStatus(
  athlete: Pick<Athlete, 'availability'>,
  recovery: RecoveryStatus | undefined,
  today: Date,
): boolean {
  if (athlete.availability !== 'cleared') return true;
  if (recovery?.started) return true; // an injury is still open
  if (!recovery?.clearedOn) return false;
  return recovery.clearedOn >= dayKey(addDays(today, -RECENTLY_CLEARED_DAYS)); // "YYYY-MM-DD" strings compare like dates
}
