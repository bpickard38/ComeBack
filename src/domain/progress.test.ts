import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from './dates';
import { lastWeek, progressStreak, summarizeDays, thisWeek, weekStatus, type AthleteProgress } from './progress';

// Wed Oct 7 2026: this week is Mon Oct 5 to Wed Oct 7; last week Sep 28 to Oct 4.
const TODAY = new Date(2026, 9, 7, 14, 0);

function progress(doneByDaysAgo: Record<number, number>, assigned = 3): AthleteProgress {
  const doneByDay: Record<string, number> = {};
  for (const [daysAgo, done] of Object.entries(doneByDaysAgo)) {
    doneByDay[dayKey(addDays(TODAY, -Number(daysAgo)))] = done;
  }
  return { athleteId: 'x', assigned, doneByDay, goalsTotal: 0, goalsReached: 0, goalsImproved: 0 };
}

describe('coach weekly progress', () => {
  it('counts this week as Monday up to today', () => {
    // Mon 3/3, Tue 2/3, Wed 1/3 so far.
    const week = thisWeek(progress({ 2: 3, 1: 2, 0: 1 }), TODAY);
    expect(week).toEqual({ done: 6, possible: 9, percent: 67, fullDays: 1, days: 3 });
    expect(weekStatus(week.percent)).toBe('Behind');
  });

  it('is On track at 80% or more', () => {
    expect(weekStatus(thisWeek(progress({ 2: 3, 1: 3, 0: 2 }), TODAY).percent)).toBe('On track');
  });

  it('counts last week as the previous Monday to Sunday', () => {
    // Days ago 3..9 cover Sun Oct 4 back to Mon Sep 28. Sep 27 (10 ago) is not last week.
    const week = lastWeek(progress({ 3: 3, 4: 3, 5: 1, 9: 3, 10: 3 }), TODAY);
    expect(week).toEqual({ done: 10, possible: 21, percent: 48, fullDays: 3, days: 7 });
  });

  it('never counts more than the assigned number for a day', () => {
    // A log on an exercise that was later swapped out could push a day over.
    expect(summarizeDays(progress({ 0: 5 }, 3), [TODAY]).done).toBe(3);
  });

  it('shows 0% with nothing possible instead of dividing by zero', () => {
    expect(thisWeek(progress({ 0: 2 }, 0), TODAY)).toEqual({ done: 0, possible: 0, percent: 0, fullDays: 0, days: 3 });
  });

  it('streak counts full days ending today, or yesterday when today is pending', () => {
    expect(progressStreak(progress({ 0: 3, 1: 3, 2: 3, 3: 2 }), TODAY)).toBe(3);
    expect(progressStreak(progress({ 0: 1, 1: 3, 2: 3 }), TODAY)).toBe(2);
    expect(progressStreak(progress({ 0: 1, 1: 1 }), TODAY)).toBe(0);
    expect(progressStreak(progress({ 0: 0 }, 0), TODAY)).toBe(0);
  });
});
