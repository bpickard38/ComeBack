/*
  Recovery progress and pace. The bar is how far an athlete is through
  their milestone tests (the same number as their own Progress tab). From
  how long that took, the app projects when they'll be back at practice and
  back to play, so the dates move as the athlete speeds up or stalls.

  This is what the coach sees: one percentage and two dates, never the
  tests or their values.
*/
import { addDays, dayKey } from './dates';

/**
 * How far through their milestones an athlete is expected to be before they
 * practice again. A guess to tune with real trainers; 100 is return to play.
 */
export const PRACTICE_PERCENT = 75;

/** What's known about one athlete's rehab. */
export interface RecoveryStatus {
  /** Average milestone progress, 0 to 100. null when no milestones are set. */
  percent: number | null;
  /** The day their oldest active injury started, "YYYY-MM-DD". null with no active injury. */
  started: string | null;
}

export interface RecoveryPace {
  /** 0 to 100. 100 means every milestone is reached, or the trainer cleared them. */
  percent: number;
  /** Projected day they reach PRACTICE_PERCENT. null if already past it, or there's no pace to go on yet. */
  practiceOn: string | null;
  /** Projected day they reach 100. null if already there, or there's no pace to go on yet. */
  playOn: string | null;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight, so the day doesn't shift
}

/**
 * The day an athlete reaches `target` percent if they keep improving at the
 * rate they have so far: they got to `percent` in the days since `started`.
 * null when they're already there, or haven't improved yet (no pace to project from).
 */
export function projectedDay(started: string, percent: number, target: number, today: Date): string | null {
  if (percent >= target || percent <= 0) return null;
  const start = parseDay(started);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Day one counts, so progress logged on the first day still gives a pace.
  const daysSoFar = Math.max(1, Math.round((now.getTime() - start.getTime()) / 86_400_000));
  return dayKey(addDays(start, Math.ceil((daysSoFar * target) / percent)));
}

/**
 * Progress and projected dates for one athlete. A cleared athlete is at 100.
 * null when there's nothing to show: no milestones set and not cleared.
 */
export function recoveryPace(status: RecoveryStatus | undefined, cleared: boolean, today: Date): RecoveryPace | null {
  if (cleared) return { percent: 100, practiceOn: null, playOn: null };
  if (!status || status.percent === null) return null;
  const percent = Math.max(0, Math.min(100, status.percent));
  const project = (target: number) => (status.started ? projectedDay(status.started, percent, target, today) : null);
  return { percent, practiceOn: project(PRACTICE_PERCENT), playOn: project(100) };
}
