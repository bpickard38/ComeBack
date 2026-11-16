import { describe, expect, it } from 'vitest';
import { athletesWithInjury, cleanHowTo, setsUsingExercise, validateCatalogName, validateVideoLink } from './catalog';
import type { Athlete } from './types';

const catalog = [
  { id: 'e-calf', name: 'Double-leg calf raise' },
  { id: 'e-balance', name: 'Single-leg balance' },
];

describe('validateCatalogName', () => {
  it('tidies spacing', () => {
    expect(validateCatalogName('  Copenhagen   plank ', catalog, 'exercise')).toEqual({ ok: true, value: 'Copenhagen plank' });
  });

  it('refuses blanks, long names and duplicates in any capitalization', () => {
    expect(validateCatalogName('   ', catalog, 'exercise')).toEqual({ ok: false, error: 'Give the exercise a name.' });
    expect(validateCatalogName('x'.repeat(81), catalog, 'exercise').ok).toBe(false);
    expect(validateCatalogName('single-leg BALANCE', catalog, 'exercise')).toEqual({ ok: false, error: 'Single-leg balance is already in the list.' });
  });

  it('lets an exercise keep its own name when it is edited', () => {
    expect(validateCatalogName('Single-leg balance', catalog, 'exercise', 'e-balance').ok).toBe(true);
  });
});

describe('validateVideoLink', () => {
  it('turns any YouTube link into the plain watch link', () => {
    expect(validateVideoLink('https://youtu.be/Dtgh2_LFkBQ')).toEqual({ ok: true, value: 'https://www.youtube.com/watch?v=Dtgh2_LFkBQ' });
    expect(validateVideoLink('https://www.youtube.com/shorts/Dtgh2_LFkBQ')).toEqual({ ok: true, value: 'https://www.youtube.com/watch?v=Dtgh2_LFkBQ' });
  });

  it('treats blank as no video and refuses other sites', () => {
    expect(validateVideoLink('  ')).toEqual({ ok: true, value: null });
    expect(validateVideoLink('https://vimeo.com/123').ok).toBe(false);
  });
});

describe('cleanHowTo', () => {
  it('keeps one tidy line, or nothing', () => {
    expect(cleanHowTo('  Stand tall.\n  Rise up. ')).toBe('Stand tall. Rise up.');
    expect(cleanHowTo('   ')).toBeNull();
  });
});

describe('counting who uses what', () => {
  const athlete = (id: string, injuries: string[]) => ({ id, injuries: injuries.map((name) => ({ caseId: `${id}-${name}`, name })) }) as unknown as Athlete;

  it('counts athletes with an injury active', () => {
    expect(athletesWithInjury([athlete('a', ['Ankle sprain']), athlete('b', ['Ankle sprain', 'ACL']), athlete('c', [])], 'Ankle sprain')).toBe(2);
  });

  it("lists the injuries whose starting set has an exercise", () => {
    const injuries = [
      { id: 'i-ankle', name: 'Ankle sprain' },
      { id: 'i-ham', name: 'Hamstring strain' },
    ];
    expect(setsUsingExercise('e-calf', { 'i-ankle': ['e-calf', 'e-balance'], 'i-ham': ['e-bridge'] }, injuries)).toEqual(['Ankle sprain']);
  });
});
