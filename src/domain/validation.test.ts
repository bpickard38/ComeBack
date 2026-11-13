import { describe, expect, it } from 'vitest';
import { validatePrescription } from './validation';

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
