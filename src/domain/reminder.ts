import { addDays } from './dates';
import { findLog } from './logs';
import type { Athlete, ExerciseLog } from './types';

/*
  Reminder times. The push reminders use the same hours, worked out in the
  database (claim_due_reminders in supabase/push.sql); keep the two in step.
*/

/** Hour (24h, local time) after which the end-of-day reminder shows. */
export const REMINDER_HOUR = 18;

/** Hour (24h, local time) of the morning "you missed some yesterday" push. */
export const MISSED_HOUR = 9;

export function shouldShowReminder(now: Date, exercisesLeft: number): boolean {
  return exercisesLeft > 0 && now.getHours() >= REMINDER_HOUR;
}

/** The athlete's exercises (ids) with no log yesterday. */
export function missedYesterday(athlete: Athlete, logs: ExerciseLog[], now: Date): string[] {
  const yesterday = addDays(now, -1);
  return athlete.assignedExerciseIds.filter((id) => !findLog(logs, athlete.id, id, yesterday));
}

/** "Calf raises", "Calf raises and Wall slides", "Calf raises, Wall slides and 2 more". */
export function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
