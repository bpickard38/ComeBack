import { goalsReached } from './goals';
import { logsFor } from './logs';
import type { Athlete, ExerciseLog, MilestoneTest, PointEvent, TestResult } from './types';

/** Point values. Guesses for now; tune after real use. */
export const POINTS_PER_EXERCISE = 1;
export const POINTS_PER_GOAL = 10;

export interface PointsBreakdown {
  exercisesLogged: number;
  goalsReached: number;
  total: number;
}

/** Build the trophy totals from the authoritative database ledger. */
export function pointsFromEvents(athleteId: string, events: PointEvent[]): PointsBreakdown {
  const ownEvents = events.filter((event) => event.athleteId === athleteId);
  const exercisesLogged = ownEvents
    .filter((event) => event.sourceType === 'exercise_log' || event.sourceType === 'prior')
    .reduce((total, event) => total + event.points, 0);
  const goals = ownEvents.filter((event) => event.sourceType === 'goal_reached').length;
  return {
    exercisesLogged,
    goalsReached: goals,
    total: ownEvents.reduce((total, event) => total + event.points, 0),
  };
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
