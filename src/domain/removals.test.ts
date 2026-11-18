import { describe, expect, it } from 'vitest';
import {
  buildProposal,
  buildVisit,
  sanitizeProposal,
  sanitizeVisit,
  savedSummary,
  type VisitContext,
} from '../../supabase/functions/trainer-assistant/plan';

// Maya has an ankle sprain with two exercises on it. The trainer says:
// "Maya came in, she's feeling better, get rid of the ankle exercises and do hamstring curls."
function context(): VisitContext {
  return {
    athletes: [
      { id: 'a-maya', name: 'Maya Torres' },
      { id: 'a-devon', name: 'Devon Clarke' },
    ],
    injuries: [{ id: 'i-ankle', name: 'Ankle sprain', body_region: 'Ankle' }],
    exercises: [
      { id: 'e-calf', name: 'Double-leg calf raise', video_url: null },
      { id: 'e-alpha', name: 'Ankle alphabet', video_url: null },
      { id: 'e-ham', name: 'Hamstring curl', video_url: null },
    ],
    videos: new Map(),
    goals: [],
    plans: [
      {
        athleteId: 'a-maya',
        injuryId: 'i-ankle',
        injuryName: 'Ankle sprain',
        exercises: [
          { id: 'e-calf', name: 'Double-leg calf raise' },
          { id: 'e-alpha', name: 'Ankle alphabet' },
        ],
      },
    ],
  };
}

function ok<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('removing exercises', () => {
  it('swaps the ankle exercises for hamstring curls in one visit card', () => {
    const visit = ok(
      buildVisit(
        {
          athlete_id: 'a-maya',
          summary: 'Feeling better.',
          plan_changes: {
            injury: { id: 'i-ankle' },
            exercises: [{ id: 'e-ham', sets: 3, reps: 10 }],
            remove: [{ exercise_id: 'e-calf' }, { exercise_id: 'e-alpha', injury_id: 'i-ankle' }],
          },
        },
        context(),
      ),
    );
    expect(visit.plan?.exercises.map((e) => e.name)).toEqual(['Hamstring curl']);
    expect(visit.plan?.removed).toEqual([
      { exerciseId: 'e-calf', name: 'Double-leg calf raise', injuryId: 'i-ankle', injuryName: 'Ankle sprain' },
      { exerciseId: 'e-alpha', name: 'Ankle alphabet', injuryId: 'i-ankle', injuryName: 'Ankle sprain' },
    ]);
    // Survives the round trip through the browser.
    expect(ok(sanitizeVisit(visit)).plan?.removed).toHaveLength(2);
  });

  it('allows a plan that only removes', () => {
    const plan = ok(buildProposal({ athlete_id: 'a-maya', exercises: [], remove: [{ exercise_id: 'e-alpha' }] }, context()));
    expect(plan.injury).toBeNull();
    expect(plan.removed).toHaveLength(1);
    expect(savedSummary(plan)).toBe("Updated Maya Torres's plan. Removed Ankle alphabet.");
    expect(ok(sanitizeProposal(plan)).removed).toHaveLength(1);
  });

  it('refuses to remove an exercise that is not on the athlete’s plan', () => {
    const result = buildProposal({ athlete_id: 'a-maya', exercises: [], remove: [{ exercise_id: 'e-ham' }] }, context());
    expect(result.ok).toBe(false);
    const other = buildProposal({ athlete_id: 'a-devon', exercises: [], remove: [{ exercise_id: 'e-calf' }] }, context());
    expect(other.ok).toBe(false);
  });

  it('refuses removals with no athlete', () => {
    const result = buildProposal({ injury: { name: 'Turf toe' }, exercises: [], remove: [{ exercise_id: 'e-calf' }] }, context());
    expect(result.ok).toBe(false);
  });

  it('refuses adding and removing the same exercise on one injury', () => {
    const result = buildProposal(
      { athlete_id: 'a-maya', injury: { id: 'i-ankle' }, exercises: [{ id: 'e-calf' }], remove: [{ exercise_id: 'e-calf' }] },
      context(),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a removal from the browser with no athlete', () => {
    const result = sanitizeProposal({
      athlete: null,
      injury: { id: null, name: 'Turf toe' },
      exercises: [],
      removed: [{ exerciseId: 'e-calf', injuryId: 'i-ankle', name: 'x', injuryName: 'y' }],
    });
    expect(result.ok).toBe(false);
  });
});
