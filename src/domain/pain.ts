import { addDays, dayKey } from './dates';
import type { ExerciseLog, Result } from './types';

/** The 0 to 10 scale athletes pick from when they log an exercise. */
export const PAIN_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Pain at or above this flags the athlete for the trainer. A guess based on
 * common rehab advice (some discomfort is expected); tune with real trainers.
 */
export const PAIN_ALERT_LEVEL = 5;

/** How many days back (including today) a high pain report stays flagged. */
export const PAIN_LOOKBACK_DAYS = 3;

export function validatePain(pain: number | undefined): Result<number> {
  if (pain === undefined || !Number.isInteger(pain) || pain < 0 || pain > 10) {
    return { ok: false, error: 'Pick how much pain you felt, from 0 to 10.' };
  }
  return { ok: true, value: pain };
}

export function isHighPain(pain: number | undefined): boolean {
  return pain !== undefined && pain >= PAIN_ALERT_LEVEL;
}

/** Highest pain the athlete reported in the last few days, or null if none was rated. */
export function highestRecentPain(logs: ExerciseLog[], athleteId: string, today: Date): number | null {
  const oldest = dayKey(addDays(today, -(PAIN_LOOKBACK_DAYS - 1)));
  let highest: number | null = null;
  for (const log of logs) {
    if (log.athleteId !== athleteId || log.pain === undefined) continue;
    if (dayKey(new Date(log.loggedAt)) < oldest) continue; // "YYYY-MM-DD" strings compare like dates
    if (highest === null || log.pain > highest) highest = log.pain;
  }
  return highest;
}
