import { goalsReached } from './goals';
import { logsFor } from './logs';
import type { Athlete, ExerciseLog, MilestoneTest, TestResult } from './types';

/** Point values. Guesses for now; tune after real use. */
export const POINTS_PER_EXERCISE = 1;
export const POINTS_PER_GOAL = 10;

export interface PointsBreakdown {
  exercisesLogged: number;
  goalsReached: number;
  total: number;
}

export function pointsFor(
  athlete: Athlete,
  logs: ExerciseLog[],
  tests: MilestoneTest[],
  results: TestResult[],
): PointsBreakdown {
  const exercisesLogged = athlete.priorExerciseCount + logsFor(logs, athlete.id).length;
  const goals = goalsReached(tests, results, athlete.id);
  return {
    exercisesLogged,
    goalsReached: goals,
    total: exercisesLogged * POINTS_PER_EXERCISE + goals * POINTS_PER_GOAL,
  };
}
