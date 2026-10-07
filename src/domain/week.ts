import { daysThisWeek } from './dates';
import { doneOnDay } from './logs';
import type { Athlete, ExerciseLog } from './types';

/** At or above this percentage, an athlete is "On track". */
export const ON_TRACK_PERCENT = 80;

/**
 * Percent of this week's work done so far: logs for currently assigned
 * exercises since Monday, divided by (assigned count x days elapsed).
 */
export function weekCompletion(athlete: Athlete, logs: ExerciseLog[], today: Date): number {
  const days = daysThisWeek(today);
  const possible = athlete.assignedExerciseIds.length * days.length;
  if (possible === 0) return 0;
  const done = days.reduce((sum, day) => sum + doneOnDay(athlete, logs, day), 0);
  return Math.round((100 * done) / possible);
}

export function weekStatus(percent: number): 'On track' | 'Behind' {
  return percent >= ON_TRACK_PERCENT ? 'On track' : 'Behind';
}
