import { describe, expect, it } from 'vitest';
import { validateMilestone, validatePrescription } from './validation';

describe('validatePrescription', () => {
  it('turns what was typed into numbers', () => {
    expect(validatePrescription({ sets: '3', reps: ' 12 ', hold: '' })).toEqual({
      ok: true,
      value: { sets: 3, reps: 12, holdSeconds: null },
    });
  });

  it('allows everything blank, which reads as "as directed"', () => {
    expect(validatePrescription({ sets: '', reps: '', hold: '' })).toEqual({
      ok: true,
      value: { sets: null, reps: null, holdSeconds: null },
    });
  });

  it('refuses zero, negatives, fractions and words', () => {
    for (const bad of ['0', '-2', '2.5', 'ten', '1000']) {
      expect(validatePrescription({ sets: bad, reps: '10', hold: '' }).ok).toBe(false);
    }
  });
});

describe('validateMilestone', () => {
  const base = { testId: 't1', newName: '', newUnit: '', baseline: '10', target: '30' };

  it('accepts a picked test with numbers', () => {
    expect(validateMilestone(base)).toEqual({ ok: true, value: { test: { testId: 't1' }, baseline: 10, target: 30 } });
  });

  it('makes a new test from a name and unit', () => {
    const result = validateMilestone({ ...base, testId: '', newName: ' Plank hold ', newUnit: 'seconds' });
    expect(result.ok && result.value.test).toEqual({ name: 'Plank hold', unit: 'seconds' });
  });

  it('needs a test, numbers, and a goal that differs from the start', () => {
    expect(validateMilestone({ ...base, testId: '' }).ok).toBe(false);
    expect(validateMilestone({ ...base, baseline: '' }).ok).toBe(false);
    expect(validateMilestone({ ...base, target: '-1' }).ok).toBe(false);
    expect(validateMilestone({ ...base, target: '10' }).ok).toBe(false);
  });
});
