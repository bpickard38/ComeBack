import { addDays } from './dates';
import { doneOnDay } from './logs';
import type { Athlete, ExerciseLog } from './types';

/** True when every assigned exercise was logged on `day`. */
export function isFullDay(athlete: Athlete, logs: ExerciseLog[], day: Date): boolean {
  const assigned = athlete.assignedExerciseIds.length;
  return assigned > 0 && doneOnDay(athlete, logs, day) === assigned;
}

/**
 * Consecutive full days ending today. If today isn't finished yet, counting
 * starts from yesterday, so a pending today doesn't break the streak.
 */
export function currentStreak(athlete: Athlete, logs: ExerciseLog[], today: Date): number {
  let day = isFullDay(athlete, logs, today) ? today : addDays(today, -1);
  let streak = 0;
  while (isFullDay(athlete, logs, day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export function bestStreak(athlete: Athlete, logs: ExerciseLog[], today: Date): number {
  return Math.max(athlete.priorBestStreak, currentStreak(athlete, logs, today));
}
