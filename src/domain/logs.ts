import { dayKey } from './dates';
import { validatePain } from './pain';
import type { Athlete, ExerciseLog, Result } from './types';

export function logsFor(logs: ExerciseLog[], athleteId: string): ExerciseLog[] {
  return logs.filter((l) => l.athleteId === athleteId);
}

/** The log for one exercise on one calendar day, if there is one. */
export function findLog(
  logs: ExerciseLog[],
  athleteId: string,
  exerciseId: string,
  day: Date,
): ExerciseLog | undefined {
  const key = dayKey(day);
  return logs.find(
    (l) => l.athleteId === athleteId && l.exerciseId === exerciseId && dayKey(new Date(l.loggedAt)) === key,
  );
}

/** How many of the athlete's assigned exercises are logged on `day`. */
export function doneOnDay(athlete: Athlete, logs: ExerciseLog[], day: Date): number {
  return athlete.assignedExerciseIds.filter((id) => findLog(logs, athlete.id, id, day)).length;
}

export const ALREADY_LOGGED = 'This exercise is already logged today.';

/**
 * Build a new log, or explain why it isn't allowed. Each assigned exercise
 * can be logged once per calendar day, with a 0 to 10 pain rating.
 */
export function createLog(
  athlete: Athlete,
  logs: ExerciseLog[],
  exerciseId: string,
  now: Date,
  pain: number | undefined,
): Result<ExerciseLog> {
  if (!athlete.assignedExerciseIds.includes(exerciseId)) {
    return { ok: false, error: 'That exercise is not on your plan.' };
  }
  if (findLog(logs, athlete.id, exerciseId, now)) {
    return { ok: false, error: ALREADY_LOGGED };
  }
  const rating = validatePain(pain);
  if (!rating.ok) return rating;
  return { ok: true, value: { athleteId: athlete.id, exerciseId, loggedAt: now.toISOString(), pain: rating.value } };
}
