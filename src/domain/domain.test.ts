/*
  Tests for the business rules in PLAN.md section 7. Run with `npm test`.
  Each `it(...)` describes one rule; `expect(...)` checks the answer.
*/
import { describe, expect, it } from 'vitest';
import { createSeed, TESTS } from '../data/seed';
import { addDays, daysThisWeek, startOfWeek } from './dates';
import { goalPercent, isGoalReached, overallGoalPercent, parseResultValue } from './goals';
import { createLog } from './logs';
import { pointsFor, POINTS_PER_GOAL } from './points';
import { RANKS, rankIndex, rankStatus, rankUp } from './rank';
import { shouldShowReminder } from './reminder';
import { bestStreak, currentStreak } from './streak';
import { normalizeAvailability } from './availability';
import { needsReply } from './messages';
import { highestRecentPain, validatePain } from './pain';
import type { Athlete, ExerciseLog, Message, TestResult } from './types';
import { validateAssignment, validateMessage } from './validation';
import { weekCompletion, weekStatus } from './week';

// A fixed "today" so tests don't depend on when they run: Wed Oct 7 2026, 2 PM.
const TODAY = new Date(2026, 9, 7, 14, 0);

const athlete: Athlete = {
  id: 'x',
  name: 'Test Athlete',
  sport: 'Soccer',
  injury: 'Ankle sprain',
  assignedExerciseIds: ['e1', 'e2'],
  priorExerciseCount: 10,
  priorBestStreak: 1,
  availability: 'limited',
  expectedReturn: null,
};

function log(exerciseId: string, daysAgo: number): ExerciseLog {
  const d = addDays(TODAY, -daysAgo);
  d.setHours(9, 0);
  return { athleteId: athlete.id, exerciseId, loggedAt: d.toISOString() };
}

/** Both exercises done on each of the given days ago. */
function fullDays(...daysAgo: number[]): ExerciseLog[] {
  return daysAgo.flatMap((d) => [log('e1', d), log('e2', d)]);
}

describe('day streak', () => {
  it('does not break when today is still pending', () => {
    const logs = [...fullDays(1, 2, 3), log('e1', 0)]; // today half done
    expect(currentStreak(athlete, logs, TODAY)).toBe(3);
  });

  it('counts today once every exercise is logged', () => {
    expect(currentStreak(athlete, fullDays(0, 1, 2), TODAY)).toBe(3);
  });

  it('stops at a missed day', () => {
    expect(currentStreak(athlete, fullDays(1, 3, 4), TODAY)).toBe(1);
  });

  it('is zero when yesterday was missed', () => {
    expect(currentStreak(athlete, fullDays(2, 3), TODAY)).toBe(0);
  });

  it('best streak is the larger of prior best and current', () => {
    expect(bestStreak(athlete, fullDays(1), TODAY)).toBe(1);
    expect(bestStreak(athlete, fullDays(1, 2, 3), TODAY)).toBe(3);
  });

  it('is zero with nothing assigned', () => {
    const empty = { ...athlete, assignedExerciseIds: [] };
    expect(currentStreak(empty, fullDays(0, 1), TODAY)).toBe(0);
  });
});

describe('logging exercises', () => {
  it('allows the first log of the day', () => {
    const result = createLog(athlete, [], 'e1', TODAY, 2);
    expect(result.ok).toBe(true);
  });

  it('blocks a duplicate log on the same day', () => {
    const result = createLog(athlete, [log('e1', 0)], 'e1', TODAY, 2);
    expect(result).toEqual({ ok: false, error: 'This exercise is already logged today.' });
  });

  it('allows the same exercise again on a new day', () => {
    expect(createLog(athlete, [log('e1', 1)], 'e1', TODAY, 2).ok).toBe(true);
  });

  it('requires a whole-number pain rating from 0 to 10', () => {
    expect(createLog(athlete, [], 'e1', TODAY, undefined).ok).toBe(false);
    expect(createLog(athlete, [], 'e1', TODAY, 11).ok).toBe(false);
    expect(createLog(athlete, [], 'e1', TODAY, 3.5).ok).toBe(false);
    const saved = createLog(athlete, [], 'e1', TODAY, 0);
    expect(saved.ok && saved.value.pain).toBe(0);
  });

  it('blocks exercises that are not assigned', () => {
    expect(createLog(athlete, [], 'other', TODAY, 2).ok).toBe(false);
  });
});

describe('rank', () => {
  it('59 points is Starter III, 60 is Varsity I', () => {
    expect(RANKS[rankIndex(59)].name).toBe('Starter III');
    expect(RANKS[rankIndex(60)].name).toBe('Varsity I');
  });

  it('starts at Starter I and tops out at All-conference III', () => {
    expect(RANKS[rankIndex(0)].name).toBe('Starter I');
    expect(RANKS[rankIndex(10_000)].name).toBe('All-conference III');
  });

  it('reports points to the next rank', () => {
    const s = rankStatus(57);
    expect(s.next?.name).toBe('Varsity I');
    expect(s.pointsToNext).toBe(3);
    expect(rankStatus(270).next).toBeNull();
  });

  it('detects a rank up only when a threshold is crossed', () => {
    expect(rankUp(59, 60)?.name).toBe('Varsity I');
    expect(rankUp(60, 61)).toBeNull();
  });
});

describe('points and goals', () => {
  const test = TESTS[0]; // One-leg balance, target 30
  const result = (value: number, daysAgo: number): TestResult => ({
    athleteId: athlete.id,
    testId: test.id,
    value,
    recordedAt: addDays(TODAY, -daysAgo).toISOString(),
    source: 'athlete',
  });

  it('counts 1 point per exercise including prior ones', () => {
    expect(pointsFor(athlete, fullDays(1), TESTS, []).total).toBe(12);
  });

  it('adds 10 points for each goal reached', () => {
    const before = pointsFor(athlete, [], TESTS, [result(22, 7)]);
    const after = pointsFor(athlete, [], TESTS, [result(22, 7), result(30, 0)]);
    expect(after.goalsReached).toBe(1);
    expect(after.total - before.total).toBe(POINTS_PER_GOAL);
  });

  it('uses the latest result, not the best one', () => {
    expect(isGoalReached(test, [result(31, 7), result(25, 0)], athlete.id)).toBe(false);
  });

  it('measures progress from baseline to target', () => {
    expect(goalPercent(test, 8)).toBe(0);
    expect(goalPercent(test, 19)).toBe(50);
    expect(goalPercent(test, 40)).toBe(100);
  });

  it('averages progress across tests for the overall percent', () => {
    const seed = createSeed(TODAY);
    expect(overallGoalPercent(TESTS, seed.results, 'a1')).toBe(52); // prototype shows 52%
  });

  it('rejects empty or non-numeric results', () => {
    expect(parseResultValue('', 'Hop').ok).toBe(false);
    expect(parseResultValue('abc', 'Hop').ok).toBe(false);
    expect(parseResultValue('-3', 'Hop').ok).toBe(false);
    expect(parseResultValue(' 12.5 ', 'Hop')).toEqual({ ok: true, value: 12.5 });
  });
});

describe('week completion', () => {
  it('counts days from Monday through today', () => {
    expect(startOfWeek(TODAY).getDay()).toBe(1);
    expect(daysThisWeek(TODAY)).toHaveLength(3); // Mon, Tue, Wed
  });

  it('divides logs by assigned x days elapsed', () => {
    // Mon and Tue full, Wed half: 5 of 6
    const pct = weekCompletion(athlete, [...fullDays(1, 2), log('e1', 0)], TODAY);
    expect(pct).toBe(83);
    expect(weekStatus(pct)).toBe('On track');
  });

  it('ignores logs from last week', () => {
    expect(weekCompletion(athlete, fullDays(3, 4), TODAY)).toBe(0);
    expect(weekStatus(0)).toBe('Behind');
  });

  it('is "Behind" just under 80%', () => {
    expect(weekStatus(79)).toBe('Behind');
    expect(weekStatus(80)).toBe('On track');
  });
});

describe('reminder', () => {
  it('shows after 6 PM only when exercises remain', () => {
    const evening = new Date(2026, 9, 7, 18, 0);
    expect(shouldShowReminder(evening, 2)).toBe(true);
    expect(shouldShowReminder(evening, 0)).toBe(false);
    expect(shouldShowReminder(TODAY, 2)).toBe(false);
  });
});

describe('validation', () => {
  it('requires athlete, injury and at least one exercise', () => {
    expect(validateAssignment({ athleteId: 'a1', injury: '', exerciseIds: ['e1'] }).ok).toBe(false);
    expect(validateAssignment({ athleteId: 'a1', injury: 'Ankle sprain', exerciseIds: [] }).ok).toBe(false);
    expect(validateAssignment({ athleteId: 'a1', injury: 'Ankle sprain', exerciseIds: ['e1'] }).ok).toBe(true);
  });

  it('rejects blank messages', () => {
    expect(validateMessage('   ')).toEqual({ ok: false, error: 'Write a message first.' });
  });
});

describe('seed data', () => {
  it('has no logs or results in the future', () => {
    const morning = new Date(2026, 9, 7, 7, 0); // before the seeded 8:20 AM and 3:30 PM times
    const seed = createSeed(morning);
    const stamps = [...seed.logs.map((l) => l.loggedAt), ...seed.results.map((r) => r.recordedAt)];
    expect(stamps.every((s) => new Date(s) <= morning)).toBe(true);
  });

  it('a result entered today counts as the latest', () => {
    const seed = createSeed(TODAY);
    const later = new Date(TODAY.getTime() + 60_000).toISOString();
    const entered: TestResult = { athleteId: 'a1', testId: 'balance', value: 30, recordedAt: later, source: 'athlete' };
    expect(isGoalReached(TESTS[0], [...seed.results, entered], 'a1')).toBe(true);
  });

  it("puts Maya at 57 points, 3 short of Varsity I, with a 2-day streak", () => {
    const seed = createSeed(TODAY);
    const maya = seed.athletes[0];
    const points = pointsFor(maya, seed.logs, TESTS, seed.results);
    expect(points.total).toBe(57);
    expect(rankStatus(points.total).pointsToNext).toBe(3);
    expect(currentStreak(maya, seed.logs, TODAY)).toBe(2);
  });
});

describe('pain', () => {
  const painLog = (pain: number | undefined, daysAgo: number, athleteId = athlete.id): ExerciseLog => {
    const d = addDays(TODAY, -daysAgo);
    d.setHours(9, 0);
    return { athleteId, exerciseId: 'e1', loggedAt: d.toISOString(), pain };
  };

  it('validates the 0 to 10 scale', () => {
    expect(validatePain(0).ok).toBe(true);
    expect(validatePain(10).ok).toBe(true);
    expect(validatePain(-1).ok).toBe(false);
  });

  it('finds the highest pain from the last three days only', () => {
    const logs = [painLog(3, 0), painLog(6, 2), painLog(9, 3), painLog(8, 0, 'someone-else'), painLog(undefined, 1)];
    expect(highestRecentPain(logs, athlete.id, TODAY)).toBe(6);
  });

  it('is null when nothing was rated', () => {
    expect(highestRecentPain([painLog(undefined, 0)], athlete.id, TODAY)).toBeNull();
  });
});

describe('messages', () => {
  const msg = (from: Message['from'], minutes: number): Message => ({
    id: String(minutes),
    thread: 'athlete:x',
    from,
    text: 'hi',
    sentAt: new Date(TODAY.getTime() + minutes * 60_000).toISOString(),
  });

  it('needs a reply when the athlete wrote last', () => {
    expect(needsReply([msg('Trainer', 1), msg('Athlete', 2)], 'x')).toBe(true);
    expect(needsReply([msg('Athlete', 1), msg('Trainer', 2)], 'x')).toBe(false);
    expect(needsReply([], 'x')).toBe(false);
  });
});

describe('availability', () => {
  it('drops the return date once cleared', () => {
    expect(normalizeAvailability('cleared', '2026-11-01').expectedReturn).toBeNull();
    expect(normalizeAvailability('out', '2026-11-01').expectedReturn).toBe('2026-11-01');
    expect(normalizeAvailability('limited', '').expectedReturn).toBeNull();
  });
});
