/* Tests for the Player Pet rules in pet.ts. */
import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from './dates';
import {
  careerStats,
  currentSeason,
  DEFAULT_LOOK,
  energyOn,
  gamesPlayed,
  moodFor,
  petSays,
  playGame,
  SEASON_LENGTH,
  unseenGames,
  validatePetLook,
  winChance,
} from './pet';
import type { Athlete, ExerciseLog } from './types';

const TODAY = new Date(2026, 10, 11, 14, 0);

const athlete: Athlete = {
  id: 'p1',
  name: 'Test Athlete',
  sport: 'Football',
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

  it('sets the mood from energy', () => {
    expect(moodFor(0)).toBe('tired');
    expect(moodFor(50)).toBe('ready');
    expect(moodFor(100)).toBe('pumped');
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
  it('needs a name and a 0 to 99 jersey number', () => {
    expect(validatePetLook(DEFAULT_LOOK).ok).toBe(true);
    expect(validatePetLook({ ...DEFAULT_LOOK, name: '  ' }).ok).toBe(false);
    expect(validatePetLook({ ...DEFAULT_LOOK, number: 100 }).ok).toBe(false);
    expect(validatePetLook({ ...DEFAULT_LOOK, number: 4.5 }).ok).toBe(false);
  });

  it('counts down the exercises left', () => {
    expect(petSays(athlete, [log('e1', 0)], TODAY)).toMatch(/^1 more exercise and/);
    expect(petSays(athlete, [log('e1', 0), log('e2', 0)], TODAY)).toMatch(/Fully charged/);
  });

  it('switches to taking it easy after a high pain rating', () => {
    expect(petSays(athlete, [log('e1', 0, 7)], TODAY)).toMatch(/Take it easy/);
  });
});
