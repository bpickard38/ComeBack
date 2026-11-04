/*
  Weekly progress as the coach sees it. The coach can't read exercise logs
  or goals (see supabase/weekly_summary.sql); the database hands back only
  counts per athlete, and these rules turn them into week %, days complete,
  streak and On track / Behind. Same thresholds as the trainer's roster
  (week.ts, streak.ts), applied to day totals instead of individual logs.
*/
import { addDays, dayKey, daysThisWeek, startOfWeek } from './dates';
import { weekStatus } from './week';

/** One athlete's counts from coach_weekly_summary(). */
export interface AthleteProgress {
  athleteId: string;
  /** Exercises on the athlete's daily list right now. */
  assigned: number;
  /** How many of those were logged on each day, "YYYY-MM-DD" -> count. Days with none are missing. */
  doneByDay: Record<string, number>;
  goalsTotal: number;
  goalsReached: number;
  /** Goals with a result this week that beat the last one before this week. */
  goalsImproved: number;
}

/** What was done over a run of days. */
export interface SpanSummary {
  done: number;
  possible: number;
  /** 0 to 100; 0 when nothing was possible. */
  percent: number;
  /** Days where every assigned exercise was logged. */
  fullDays: number;
  days: number;
}

export function doneOn(progress: AthleteProgress, day: Date): number {
  return Math.min(progress.doneByDay[dayKey(day)] ?? 0, progress.assigned);
}

export function isFullDay(progress: AthleteProgress, day: Date): boolean {
  return progress.assigned > 0 && doneOn(progress, day) === progress.assigned;
}

export function summarizeDays(progress: AthleteProgress, days: Date[]): SpanSummary {
  const possible = progress.assigned * days.length;
  const done = days.reduce((sum, day) => sum + doneOn(progress, day), 0);
  const fullDays = days.filter((day) => isFullDay(progress, day)).length;
  return { done, possible, percent: possible === 0 ? 0 : Math.round((100 * done) / possible), fullDays, days: days.length };
}

/** Monday up to and including today, like the trainer's week %. */
export function thisWeek(progress: AthleteProgress, today: Date): SpanSummary {
  return summarizeDays(progress, daysThisWeek(today));
}

/** The full Monday-to-Sunday week before this one. */
export function lastWeek(progress: AthleteProgress, today: Date): SpanSummary {
  const monday = addDays(startOfWeek(today), -7);
  return summarizeDays(progress, Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
}

/** Consecutive full days ending today, or yesterday if today isn't finished. */
export function progressStreak(progress: AthleteProgress, today: Date): number {
  let day = isFullDay(progress, today) ? today : addDays(today, -1);
  let streak = 0;
  while (isFullDay(progress, day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export { weekStatus };
