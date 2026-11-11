/* Tests for the Player Pet rules in pet.ts. */
import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from './dates';
import {
  careerStats,
  currentSeason,
  DEFAULT_LOOK,
  energyOn,
  gamesPlayed,
  goalReachedRecently,
  petSays,
  petState,
  playGame,
  SEASON_LENGTH,
  unseenGames,
  validatePetLook,
  winChance,
} from './pet';
import type { Athlete, ExerciseLog, MilestoneTest } from './types';

const TODAY = new Date(2026, 10, 11, 14, 0);

const athlete: Athlete = {
  id: 'p1',
  name: 'Test Athlete',
  sport: 'Football',
  teamIds: ['team'],
  injuries: [],
  assignedExerciseIds: ['e1', 'e2'],
  priorBestStreak: 0,
  availability: 'limited',
  expectedReturn: null,
};

function log(exerciseId: string, daysAgo: number, pain = 1): ExerciseLog {
  const d = addDays(TODAY, -daysAgo);
  d.setHours(9, 0);
  return { athleteId: athlete.id, exerciseId, loggedAt: d.toISOString(), pain };
}

describe('pet energy', () => {
  it('is the share of the plan logged that day', () => {
    expect(energyOn(athlete, [], TODAY)).toBe(0);
    expect(energyOn(athlete, [log('e1', 0)], TODAY)).toBe(50);
    expect(energyOn(athlete, [log('e1', 0), log('e2', 0)], TODAY)).toBe(100);
  });

  it('counts a rest day (nothing assigned) as full', () => {
    expect(energyOn({ ...athlete, assignedExerciseIds: [] }, [], TODAY)).toBe(100);
  });

});

describe('pet state (which sprite shows)', () => {
  const base = { athlete, today: TODAY, goalJustReached: false, unseenWin: false };
  const morning = new Date(2026, 10, 11, 9, 0);

  it('trains while part of the plan is done, and is happy when it is all done', () => {
    expect(petState({ ...base, logs: [log('e1', 0)] })).toBe('training');
    expect(petState({ ...base, logs: [log('e1', 0), log('e2', 0)] })).toBe('happy');
  });

  it('is idle in the morning when yesterday was active', () => {
    expect(petState({ ...base, today: morning, logs: [log('e1', 1)] })).toBe('idle');
  });

  it('gets tired after a day off, or in the evening with nothing done', () => {
    expect(petState({ ...base, today: morning, logs: [] })).toBe('tired');
    const evening = new Date(2026, 10, 11, 19, 0);
    expect(petState({ ...base, today: evening, logs: [log('e1', 1)] })).toBe('tired');
  });

  it('is idle on a rest day', () => {
    expect(petState({ ...base, athlete: { ...athlete, assignedExerciseIds: [] }, logs: [] })).toBe('idle');
  });

  it('celebrates a new goal or a win you have not seen yet', () => {
    expect(petState({ ...base, logs: [], goalJustReached: true })).toBe('celebrating');
    expect(petState({ ...base, logs: [], unseenWin: true })).toBe('celebrating');
  });

  it('only counts goals reached in the last few days', () => {
    const test: MilestoneTest = { id: 't1', athleteId: athlete.id, name: 'Hop', description: '', unit: 'cm', baseline: 10, target: 20 };
    const result = (value: number, daysAgo: number) => ({
      athleteId: athlete.id, testId: 't1', value, recordedAt: addDays(TODAY, -daysAgo).toISOString(), source: 'trainer' as const,
    });
    expect(goalReachedRecently([test], [result(21, 1)], athlete.id, TODAY)).toBe(true);
    expect(goalReachedRecently([test], [result(21, 10)], athlete.id, TODAY)).toBe(false);
    expect(goalReachedRecently([test], [result(15, 1)], athlete.id, TODAY)).toBe(false);
  });
});

describe('pet games', () => {
  it('gives the same result for the same day and energy', () => {
    expect(playGame('p1', TODAY, 60)).toEqual(playGame('p1', TODAY, 60));
  });

  it('never ends in a tie and the winner has more points', () => {
    for (let i = 0; i < 50; i++) {
      const g = playGame('p1', addDays(TODAY, i), 50);
      expect(g.ourScore).not.toBe(g.theirScore);
      expect(g.won).toBe(g.ourScore > g.theirScore);
    }
  });

  it('wins more often with more energy', () => {
    expect(winChance(100)).toBeGreaterThan(winChance(0));
    const wins = (energy: number) =>
      Array.from({ length: 200 }, (_, i) => playGame('p1', addDays(TODAY, i), energy)).filter((g) => g.won).length;
    expect(wins(100)).toBeGreaterThan(wins(0));
  });

  it('plays one game per night up to yesterday, using that day’s energy', () => {
    const started = dayKey(addDays(TODAY, -3));
    const logs = [log('e1', 2), log('e2', 2)];
    const games = gamesPlayed(athlete, logs, started, TODAY);
    expect(games.map((g) => g.day)).toEqual([3, 2, 1].map((n) => dayKey(addDays(TODAY, -n))));
    expect(games.map((g) => g.energy)).toEqual([0, 100, 0]);
  });

  it('has no games on the first day', () => {
    expect(gamesPlayed(athlete, [], dayKey(TODAY), TODAY)).toEqual([]);
  });

  it('only shows recaps for games after the last one seen', () => {
    const games = gamesPlayed(athlete, [], dayKey(addDays(TODAY, -3)), TODAY);
    expect(unseenGames(games, null)).toHaveLength(3);
    expect(unseenGames(games, games[1].day)).toEqual([games[2]]);
  });
});

describe('pet seasons', () => {
  const games = gamesPlayed(athlete, [], dayKey(addDays(TODAY, -SEASON_LENGTH - 2)), TODAY);

  it('counts the record for the current season only', () => {
    const season = currentSeason(games);
    expect(season.number).toBe(2);
    expect(season.wins + season.losses).toBe(2);
    expect(season.remaining).toBe(SEASON_LENGTH - 2);
    expect(season.justFinished).toBeNull();
  });

  it('reports the finished season right after its last game', () => {
    const season = currentSeason(games.slice(0, SEASON_LENGTH));
    expect(season.number).toBe(2);
    expect(season.justFinished?.number).toBe(1);
    expect(season.justFinished!.wins + season.justFinished!.losses).toBe(SEASON_LENGTH);
  });

  it('adds up career stats', () => {
    const stats = careerStats(games);
    expect(stats.games).toBe(games.length);
    expect(stats.yards).toBe(games.reduce((s, g) => s + g.yards, 0));
  });
});

describe('pet look and talk', () => {
  it('needs a name, a 0 to 99 number and one of the jersey colors', () => {
    expect(validatePetLook(DEFAULT_LOOK).ok).toBe(true);
    expect(validatePetLook({ ...DEFAULT_LOOK, name: '  ' }).ok).toBe(false);
    expect(validatePetLook({ ...DEFAULT_LOOK, name: 'x'.repeat(40) }).ok).toBe(false);
    expect(validatePetLook({ ...DEFAULT_LOOK, number: 100 }).ok).toBe(false);
    expect(validatePetLook({ ...DEFAULT_LOOK, number: 4.5 }).ok).toBe(false);
    expect(validatePetLook({ ...DEFAULT_LOOK, jersey: '#123456' }).ok).toBe(false);
  });

  it('counts down the exercises left', () => {
    expect(petSays(athlete, [log('e1', 0)], TODAY)).toMatch(/^1 more exercise and/);
    expect(petSays(athlete, [log('e1', 0), log('e2', 0)], TODAY)).toMatch(/Fully charged/);
  });

  it('switches to taking it easy after a high pain rating', () => {
    expect(petSays(athlete, [log('e1', 0, 7)], TODAY)).toMatch(/Take it easy/);
  });
});
