import { describe, expect, it } from 'vitest';
import { aboutThread, athletesOnTeam, coachThread, currentTeam, teamThreads } from './teams';
import type { Athlete, Team } from './types';
import { validateTeam } from './validation';

const soccer: Team = { id: 'soccer', name: 'Women\'s Soccer', sport: 'Soccer' };
const track: Team = { id: 'track', name: 'Track and Field', sport: null };

function athlete(id: string, teamIds: string[]): Athlete {
  return {
    id,
    name: id,
    sport: '',
    teamIds,
    injuries: [],
    assignedExerciseIds: [],
    priorBestStreak: 0,
    availability: 'cleared',
    expectedReturn: null,
  };
}

const maya = athlete('maya', ['soccer']);
const jordan = athlete('jordan', ['track']);
const both = athlete('both', ['soccer', 'track']);

describe('currentTeam', () => {
  it('is the chosen team', () => {
    expect(currentTeam([soccer, track], 'track')).toBe(track);
  });

  it('falls back to the first team when nothing is chosen', () => {
    expect(currentTeam([soccer, track], null)).toBe(soccer);
  });

  it('falls back to the first team when the chosen one is gone', () => {
    expect(currentTeam([soccer, track], 'deleted')).toBe(soccer);
  });

  it('is undefined with no teams', () => {
    expect(currentTeam([], 'soccer')).toBeUndefined();
  });
});

describe('athletesOnTeam', () => {
  it('keeps only that team\'s athletes', () => {
    expect(athletesOnTeam([maya, jordan], 'soccer')).toEqual([maya]);
  });

  it('lists an athlete on two teams under both', () => {
    expect(athletesOnTeam([maya, jordan, both], 'soccer')).toEqual([maya, both]);
    expect(athletesOnTeam([maya, jordan, both], 'track')).toEqual([jordan, both]);
  });

  it('is empty for a team with nobody on it yet', () => {
    expect(athletesOnTeam([maya, jordan], 'new')).toEqual([]);
  });
});

describe('teamThreads', () => {
  it('is the team\'s own coach thread, its athletes, and the coach threads about them', () => {
    expect(teamThreads([maya, jordan], 'soccer')).toEqual([coachThread('soccer'), 'athlete:maya', aboutThread('soccer', 'maya')]);
  });

  it('keeps the coach thread about an athlete apart from the athlete\'s own and from other teams', () => {
    expect(aboutThread('soccer', 'both')).not.toBe('athlete:both');
    expect(aboutThread('soccer', 'both')).not.toBe(aboutThread('track', 'both'));
  });

  it('gives each team a different coach thread', () => {
    expect(coachThread('soccer')).not.toBe(coachThread('track'));
  });
});

describe('validateTeam', () => {
  it('needs a name', () => {
    expect(validateTeam({ name: '   ', sport: 'Soccer', school: '' })).toEqual({ ok: false, error: 'Give your team a name.' });
  });

  it('trims what was typed', () => {
    expect(validateTeam({ name: ' Track ', sport: ' Track and field ', school: '' })).toEqual({
      ok: true,
      value: { name: 'Track', sport: 'Track and field', school: '' },
    });
  });
});
