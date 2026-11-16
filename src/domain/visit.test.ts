import { describe, expect, it } from 'vitest';
import {
  buildVisit,
  cleanDay,
  cleanMeasure,
  cleanPain,
  sanitizeVisit,
  visitSavedSummary,
  type VisitContext,
  type VisitProposal,
} from '../../supabase/functions/trainer-assistant/plan';

function context(): VisitContext {
  return {
    athletes: [
      { id: 'a-maya', name: 'Maya Torres' },
      { id: 'a-devon', name: 'Devon Clarke' },
    ],
    injuries: [{ id: 'i-ankle', name: 'Ankle sprain', body_region: 'Ankle' }],
    exercises: [{ id: 'e-calf', name: 'Double-leg calf raise', video_url: null }],
    videos: new Map(),
    goals: [
      { id: 'g-balance', athleteId: 'a-maya', name: 'Single-leg balance', unit: 'sec', target: 30 },
      { id: 'g-devon', athleteId: 'a-devon', name: 'Shoulder flexion', unit: 'degrees', target: 170 },
    ],
  };
}

function ok<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('buildVisit', () => {
  it('turns what the trainer said into a visit card', () => {
    const visit = ok(
      buildVisit(
        {
          athlete_id: 'a-maya',
          summary: '  Ankle feeling better.\n\n\n\nWalking without a limp. ',
          pain: 3,
          done_today: 'Balance work, band eversions',
          test_results: [{ goal_id: 'g-balance', value: 25 }],
          availability: { status: 'limited', expected_return: '2026-12-01' },
          plan_changes: { injury: { id: 'i-ankle' }, exercises: [{ id: 'e-calf', sets: 4, reps: 15 }] },
        },
        context(),
      ),
    );
    expect(visit.athlete).toEqual({ id: 'a-maya', name: 'Maya Torres' });
    expect(visit.summary).toBe('Ankle feeling better.\n\nWalking without a limp.');
    expect(visit.pain).toBe(3);
    expect(visit.results).toEqual([{ goalId: 'g-balance', name: 'Single-leg balance', unit: 'sec', target: 30, value: 25 }]);
    expect(visit.availability).toEqual({ status: 'limited', expectedReturn: '2026-12-01' });
    expect(visit.plan?.exercises[0]).toMatchObject({ name: 'Double-leg calf raise', sets: 4, reps: 15 });
  });

  it('keeps only what came up: no pain, results, status or plan', () => {
    const visit = ok(buildVisit({ athlete_id: 'a-maya', summary: 'Quick check-in.' }, context()));
    expect(visit).toMatchObject({ pain: null, doneToday: null, results: [], availability: null, plan: null });
  });

  it('refuses an athlete the trainer does not have, and a visit with no summary', () => {
    expect(buildVisit({ athlete_id: 'a-someone', summary: 'x' }, context()).ok).toBe(false);
    expect(buildVisit({ athlete_id: 'a-maya', summary: '   ' }, context()).ok).toBe(false);
  });

  it("refuses a result for another athlete's goal", () => {
    const result = buildVisit({ athlete_id: 'a-maya', summary: 'x', test_results: [{ goal_id: 'g-devon', value: 150 }] }, context());
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Maya Torres's goals") });
  });

  it('passes plan problems back to the AI', () => {
    const result = buildVisit({ athlete_id: 'a-maya', summary: 'x', plan_changes: { injury: { id: 'i-made-up' }, exercises: [{ id: 'e-calf' }] } }, context());
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('plan_changes:') });
  });

  it('drops a return date when the athlete is cleared', () => {
    const visit = ok(buildVisit({ athlete_id: 'a-maya', summary: 'Back to full.', availability: { status: 'cleared', expected_return: '2026-12-01' } }, context()));
    expect(visit.availability).toEqual({ status: 'cleared', expectedReturn: null });
  });
});

describe('sanitizeVisit', () => {
  const visit: VisitProposal = {
    athlete: { id: 'a-maya', name: 'Maya Torres' },
    summary: 'Ankle feeling better.',
    pain: 3,
    doneToday: null,
    results: [{ goalId: 'g-balance', name: 'Single-leg balance', unit: 'sec', target: 30, value: 25 }],
    availability: { status: 'out', expectedReturn: '2026-12-01' },
    plan: null,
  };

  it('passes an edited visit through', () => {
    const edited = { ...visit, pain: '5', results: [{ ...visit.results[0], value: '27.5' }] };
    expect(ok(sanitizeVisit(JSON.parse(JSON.stringify(edited))))).toMatchObject({ pain: 5, results: [{ value: 27.5 }] });
  });

  it('asks for a summary and for numbers', () => {
    expect(sanitizeVisit({ ...visit, summary: '' })).toMatchObject({ ok: false, error: "Write how they're doing before saving." });
    expect(sanitizeVisit({ ...visit, results: [{ ...visit.results[0], value: 'lots' }] })).toMatchObject({
      ok: false,
      error: 'Enter a number for Single-leg balance, or remove it.',
    });
  });

  it('refuses a plan for a different athlete', () => {
    const plan = { athlete: { id: 'a-devon', name: 'Devon' }, injury: { id: 'i-ankle', name: 'Ankle sprain', bodyRegion: null }, exercises: [{ id: 'e-calf', name: 'Calf raise' }] };
    expect(sanitizeVisit({ ...visit, plan }).ok).toBe(false);
  });

  it('refuses things that are not a visit', () => {
    expect(sanitizeVisit(null).ok).toBe(false);
    expect(sanitizeVisit({ summary: 'no athlete' }).ok).toBe(false);
  });
});

describe('cleaning numbers and days', () => {
  it('keeps pain from 0 to 10 only', () => {
    expect(cleanPain(0)).toBe(0);
    expect(cleanPain('7')).toBe(7);
    expect(cleanPain(11)).toBeNull();
    expect(cleanPain(2.5)).toBeNull();
  });

  it('keeps measurements, rounded to 2 places', () => {
    expect(cleanMeasure(25.456)).toBe(25.46);
    expect(cleanMeasure(-1)).toBeNull();
    expect(cleanMeasure('abc')).toBeNull();
  });

  it('only accepts real calendar days', () => {
    expect(cleanDay('2026-12-01')).toBe('2026-12-01');
    expect(cleanDay('2026-02-30')).toBeNull();
    expect(cleanDay('next week')).toBeNull();
  });
});

describe('visitSavedSummary', () => {
  it('says what was saved', () => {
    expect(
      visitSavedSummary({
        athlete: { id: 'a-maya', name: 'Maya Torres' },
        summary: 'x',
        pain: null,
        doneToday: null,
        results: [{ goalId: 'g', name: 'n', unit: 'sec', target: 30, value: 25 }],
        availability: null,
        plan: { athlete: { id: 'a-maya', name: 'Maya Torres' }, injury: null, exercises: [] },
      }),
    ).toBe("Saved Maya Torres's visit: 1 test result, plan updated.");
  });
});
