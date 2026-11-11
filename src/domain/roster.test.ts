import { describe, expect, it } from 'vitest';
import type { RecoveryStatus } from './recovery';
import { filterRoster, isInjured, isPracticing, onCoachStatus } from './roster';
import type { Availability } from './types';

function athlete(name: string, injured: boolean, availability: Availability = 'limited') {
  return { id: name, name, injuries: injured ? [{ caseId: `c-${name}`, name: 'Ankle sprain' }] : [], availability };
}

const maya = athlete('Maya', true);
const jordan = athlete('Jordan', true, 'out');
const devon = athlete('Devon', true);
const priya = athlete('Priya', false, 'cleared');
const alex = athlete('Alex', false, 'cleared');
const team = [maya, priya, jordan, alex, devon];

const recovery: Record<string, RecoveryStatus> = {
  Maya: { percent: 80, started: '2026-10-21' },
  Jordan: { percent: 20, started: '2026-10-21' },
  Devon: { percent: null, started: '2026-10-21' },
};
const names = (list: Array<{ name: string }>) => list.map((a) => a.name);

describe('isInjured', () => {
  it('is true only with an active injury', () => {
    expect(isInjured(maya)).toBe(true);
    expect(isInjured(priya)).toBe(false);
  });
});

describe('isPracticing', () => {
  it('goes by progress: at or past the practice mark', () => {
    expect(isPracticing(maya, { percent: 75, started: null })).toBe(true);
    expect(isPracticing(maya, { percent: 74, started: null })).toBe(false);
  });

  it('lets progress overrule the trainer status', () => {
    expect(isPracticing(jordan, { percent: 90, started: null })).toBe(true);
    expect(isPracticing(maya, { percent: 10, started: null })).toBe(false);
  });

  it('falls back to the trainer status with no milestones', () => {
    expect(isPracticing(devon, { percent: null, started: null })).toBe(true); // limited
    expect(isPracticing(jordan, undefined)).toBe(false); // out
  });
});

describe('filterRoster', () => {
  it('lists everyone, injured first, each group by name', () => {
    expect(names(filterRoster(team, 'all', 'any', recovery))).toEqual(['Devon', 'Jordan', 'Maya', 'Alex', 'Priya']);
  });

  it('keeps only the injured or only the healthy', () => {
    expect(names(filterRoster(team, 'injured', 'any', recovery))).toEqual(['Devon', 'Jordan', 'Maya']);
    expect(names(filterRoster(team, 'healthy', 'any', recovery))).toEqual(['Alex', 'Priya']);
  });

  it('splits the injured by practicing or not', () => {
    expect(names(filterRoster(team, 'injured', 'practicing', recovery))).toEqual(['Devon', 'Maya']);
    expect(names(filterRoster(team, 'injured', 'not-practicing', recovery))).toEqual(['Jordan']);
  });

  it('ignores the practice filter outside the injured list', () => {
    expect(names(filterRoster(team, 'healthy', 'practicing', recovery))).toEqual(['Alex', 'Priya']);
    expect(filterRoster(team, 'all', 'not-practicing', recovery)).toHaveLength(5);
  });

  it('works before recovery data is available', () => {
    expect(names(filterRoster(team, 'injured', 'not-practicing', null))).toEqual(['Jordan']);
  });
});

describe('onCoachStatus', () => {
  const today = new Date(2026, 10, 11, 14, 0); // Wed Nov 11 2026
  const cleared = { availability: 'cleared' as const };

  it('lists anyone who is out or limited', () => {
    expect(onCoachStatus({ availability: 'out' }, undefined, today)).toBe(true);
    expect(onCoachStatus({ availability: 'limited' }, { percent: null, started: null }, today)).toBe(true);
  });

  it('lists a cleared athlete whose injury is still open', () => {
    expect(onCoachStatus(cleared, { percent: 90, started: '2026-10-01' }, today)).toBe(true);
  });

  it('keeps a recently cleared athlete for two weeks, then drops them', () => {
    expect(onCoachStatus(cleared, { percent: null, started: null, clearedOn: '2026-11-05' }, today)).toBe(true);
    expect(onCoachStatus(cleared, { percent: null, started: null, clearedOn: '2026-10-28' }, today)).toBe(true); // day 14
    expect(onCoachStatus(cleared, { percent: null, started: null, clearedOn: '2026-10-27' }, today)).toBe(false);
  });

  it('leaves off healthy athletes who were never hurt', () => {
    expect(onCoachStatus(cleared, { percent: null, started: null, clearedOn: null }, today)).toBe(false);
    expect(onCoachStatus(cleared, undefined, today)).toBe(false);
  });
});
