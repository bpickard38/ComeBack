import { describe, expect, it } from 'vitest';
import { PRACTICE_PERCENT, projectedDay, recoveryPace } from './recovery';

const TODAY = new Date(2026, 10, 11, 14, 0); // Wed Nov 11 2026, 2:00 PM

describe('projectedDay', () => {
  it('projects from the pace so far', () => {
    // 50% after 20 days: 100% takes 40 days in all.
    expect(projectedDay('2026-10-22', 50, 100, TODAY)).toBe('2026-12-01');
    // ...and 75% takes 30.
    expect(projectedDay('2026-10-22', 50, 75, TODAY)).toBe('2026-11-21');
  });

  it('moves later when progress is slower', () => {
    const faster = projectedDay('2026-10-22', 50, 100, TODAY)!;
    const slower = projectedDay('2026-10-22', 25, 100, TODAY)!;
    expect(slower > faster).toBe(true);
    expect(slower).toBe('2027-01-10'); // 25% after 20 days: 80 days in all
  });

  it('is always after today while there is progress left', () => {
    expect(projectedDay('2026-10-22', 99, 100, TODAY)! > '2026-11-11').toBe(true);
  });

  it('rounds a part day up', () => {
    // 30% after 20 days: 66.7 days in all, so day 67.
    expect(projectedDay('2026-10-22', 30, 100, TODAY)).toBe('2026-12-28');
  });

  it('has no date before any progress is made', () => {
    expect(projectedDay('2026-10-22', 0, 100, TODAY)).toBeNull();
  });

  it('has no date once the target is reached', () => {
    expect(projectedDay('2026-10-22', 80, PRACTICE_PERCENT, TODAY)).toBeNull();
    expect(projectedDay('2026-10-22', 100, 100, TODAY)).toBeNull();
  });

  it('gives a pace for progress made on the first day', () => {
    expect(projectedDay('2026-11-11', 50, 100, TODAY)).toBe('2026-11-13');
  });
});

describe('recoveryPace', () => {
  it('gives the percent and both dates partway through', () => {
    expect(recoveryPace({ percent: 50, started: '2026-10-22' }, false, TODAY)).toEqual({
      percent: 50,
      practiceOn: '2026-11-21',
      playOn: '2026-12-01',
    });
  });

  it('drops the practice date once past the practice mark', () => {
    const pace = recoveryPace({ percent: 80, started: '2026-10-22' }, false, TODAY)!;
    expect(pace.practiceOn).toBeNull();
    expect(pace.playOn).toBe('2026-11-16'); // 80% after 20 days: 25 days in all
  });

  it('is 100 with no dates for a cleared athlete, whatever the tests say', () => {
    expect(recoveryPace({ percent: 40, started: '2026-10-22' }, true, TODAY)).toEqual({ percent: 100, practiceOn: null, playOn: null });
    expect(recoveryPace(undefined, true, TODAY)).toEqual({ percent: 100, practiceOn: null, playOn: null });
  });

  it('is null with no milestones set', () => {
    expect(recoveryPace({ percent: null, started: '2026-10-22' }, false, TODAY)).toBeNull();
    expect(recoveryPace(undefined, false, TODAY)).toBeNull();
  });

  it('shows the percent without dates when the start day is unknown', () => {
    expect(recoveryPace({ percent: 50, started: null }, false, TODAY)).toEqual({ percent: 50, practiceOn: null, playOn: null });
  });

  it('shows 0 without dates before any progress', () => {
    expect(recoveryPace({ percent: 0, started: '2026-10-22' }, false, TODAY)).toEqual({ percent: 0, practiceOn: null, playOn: null });
  });
});
