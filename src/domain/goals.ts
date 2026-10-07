import type { MilestoneTest, Result, TestResult } from './types';

/** Most recent result for one athlete on one test, if any. */
export function latestResult(
  results: TestResult[],
  athleteId: string,
  testId: string,
): TestResult | undefined {
  let latest: TestResult | undefined;
  for (const r of results) {
    if (r.athleteId !== athleteId || r.testId !== testId) continue;
    if (!latest || r.recordedAt >= latest.recordedAt) latest = r; // ISO strings sort by time
  }
  return latest;
}

/** The athlete's current number for a test. Falls back to the baseline. */
export function currentValue(test: MilestoneTest, results: TestResult[], athleteId: string): number {
  return latestResult(results, athleteId, test.id)?.value ?? test.baseline;
}

export function isGoalReached(test: MilestoneTest, results: TestResult[], athleteId: string): boolean {
  const latest = latestResult(results, athleteId, test.id);
  return latest !== undefined && latest.value >= test.target;
}

export function goalsReached(tests: MilestoneTest[], results: TestResult[], athleteId: string): number {
  return tests.filter((t) => isGoalReached(t, results, athleteId)).length;
}

/** How far from baseline to target, 0 to 100. */
export function goalPercent(test: MilestoneTest, value: number): number {
  const span = test.target - test.baseline;
  if (span <= 0) return value >= test.target ? 100 : 0;
  const pct = Math.round((100 * (value - test.baseline)) / span);
  return Math.max(0, Math.min(100, pct));
}

/** Average progress across all tests, 0 to 100. */
export function overallGoalPercent(tests: MilestoneTest[], results: TestResult[], athleteId: string): number {
  if (tests.length === 0) return 0;
  const total = tests.reduce((sum, t) => sum + goalPercent(t, currentValue(t, results, athleteId)), 0);
  return Math.round(total / tests.length);
}

/** Turn what the athlete typed into a number, or an error to show them. */
export function parseResultValue(raw: string, testName: string): Result<number> {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(value) || value < 0) {
    return { ok: false, error: `Enter a number for ${testName}.` };
  }
  return { ok: true, value };
}
