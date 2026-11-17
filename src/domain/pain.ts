import { addDays, dayKey } from './dates';
import type { ExerciseLog, Result } from './types';

/** The 0 to 10 scale athletes pick from when they log an exercise. */
export const PAIN_SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * What each number means, so athletes can tell a 5 from a 9.
 * From the class's pain scale reference chart.
 */
export const PAIN_LEVELS = [
  { label: 'No pain', description: 'No pain at all' },
  { label: 'Very mild', description: 'Very light pain' },
  { label: 'Mild', description: 'Noticeable pain, but not distracting' },
  { label: 'Moderate', description: 'Distracting, but manageable' },
  { label: 'Moderate pain', description: 'More intense, some interference with tasks' },
  { label: 'Strong', description: 'Strong pain, limits daily activities' },
  { label: 'Strong pain', description: 'Hard to concentrate, avoids activity' },
  { label: 'Very strong', description: 'Severe pain, difficult to do most activities' },
  { label: 'Very severe', description: 'Intense pain, hard to think or move' },
  { label: 'Extreme', description: 'Worst pain imaginable, unable to function' },
  { label: 'Worst possible pain', description: 'Unbearable pain, seeking emergency relief' },
] as const;

/** "Strong pain" for 6. */
export function painLabel(pain: number): string {
  return PAIN_LEVELS[pain]?.label ?? '';
}

/** The color for a pain number: green at 0, through yellow, to red at 10 (a CSS color). */
export function painColor(pain: number): string {
  const hue = Math.round(130 - (130 * Math.max(0, Math.min(10, pain))) / 10);
  return `hsl(${hue} 65% 56%)`;
}

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
