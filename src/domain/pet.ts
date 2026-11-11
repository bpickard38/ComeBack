/*
  Player Pet: an optional game buddy on the athlete's Today screen.

  The athlete's exercises give the pet energy. Every night the pet plays one
  game, and the more energy he had that day, the better he plays. Games are
  never stored: they are worked out from the exercise logs and the date, using
  a "seeded" random number so the same day always gives the same score. That
  is how the app can show games that were "played while you were away"
  without a game server.

  Rehab safety: energy tops out at 100% of the plan (extra work adds nothing),
  rest days count as full energy, and a missed day only means one tired game.
*/
import { addDays, dayKey } from './dates';
import { doneOnDay, findLog } from './logs';
import { isHighPain } from './pain';
import type { Athlete, ExerciseLog, Result } from './types';

/** How the athlete customized their pet. */
export interface PetLook {
  name: string;
  number: number;
  jersey: string;
  trim: string;
  skin: string;
}

export const JERSEY_COLORS = [
  { label: 'Red', value: '#c8332b' },
  { label: 'Navy', value: '#22408f' },
  { label: 'Green', value: '#2e8540' },
  { label: 'Purple', value: '#6a3fa0' },
  { label: 'Orange', value: '#e0701f' },
  { label: 'Black', value: '#24282d' },
  { label: 'Gold', value: '#d9a521' },
  { label: 'Sky', value: '#3c9ad6' },
] as const;

export const TRIM_COLORS = [
  { label: 'White', value: '#f4f4f4' },
  ...JERSEY_COLORS,
] as const;

export const SKIN_TONES = [
  { label: 'Light', value: '#f6cfa8' },
  { label: 'Medium light', value: '#dca577' },
  { label: 'Medium dark', value: '#a8693f' },
  { label: 'Dark', value: '#6b4126' },
] as const;

export const DEFAULT_LOOK: PetLook = {
  name: 'Rookie',
  number: 12,
  jersey: JERSEY_COLORS[0].value,
  trim: TRIM_COLORS[0].value,
  skin: SKIN_TONES[0].value,
};

export const PET_NAME_MAX = 16;

/** Games in one season. A new season starts after the last one. */
export const SEASON_LENGTH = 10;

const OPPONENTS = [
  'Hawks', 'Wolves', 'Bears', 'Comets', 'Rhinos', 'Storm',
  'Vipers', 'Titans', 'Falcons', 'Bulldogs', 'Rockets', 'Panthers',
];

export function validatePetLook(look: PetLook): Result<PetLook> {
  const name = look.name.trim();
  if (!name) return { ok: false, error: 'Give your player a name.' };
  if (name.length > PET_NAME_MAX) return { ok: false, error: `Keep the name to ${PET_NAME_MAX} letters or fewer.` };
  if (!Number.isInteger(look.number) || look.number < 0 || look.number > 99) {
    return { ok: false, error: 'Jersey number must be 0 to 99.' };
  }
  return { ok: true, value: { ...look, name } };
}

/**
 * Energy (0 to 100) on one day: the share of the plan that was logged.
 * A day with nothing assigned is a rest day, which counts as full.
 */
export function energyOn(athlete: Athlete, logs: ExerciseLog[], day: Date): number {
  const assigned = athlete.assignedExerciseIds.length;
  if (assigned === 0) return 100;
  return Math.round((100 * doneOnDay(athlete, logs, day)) / assigned);
}

/* ---------- Seeded randomness ---------- */

/** Turns text into a number (FNV-1a hash). Same text, same number. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A tiny random number generator (mulberry32) that repeats for the same seed. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

/* ---------- Games ---------- */

export interface PetGame {
  /** The day the game was played, "YYYY-MM-DD". */
  day: string;
  opponent: string;
  /** Energy going into the game, 0 to 100. */
  energy: number;
  ourScore: number;
  theirScore: number;
  won: boolean;
  touchdowns: number;
  yards: number;
}

/** Who the pet plays on a given day. */
export function opponentOn(athleteId: string, day: Date): string {
  return pick(OPPONENTS, seededRandom(hash(`${athleteId}:${dayKey(day)}:opp`)));
}

/**
 * Chance of winning: 25% on an empty tank, 85% fully charged. He can still
 * win tired or lose rested, so it feels like a game, not a punishment.
 */
export function winChance(energy: number): number {
  return 0.25 + 0.6 * (Math.max(0, Math.min(100, energy)) / 100);
}

const LOSING_SCORES = [0, 3, 6, 7, 10, 13, 14, 17, 20, 21, 24];
const MARGINS = [3, 4, 7, 7, 10, 14, 17, 21];

/** Play one game. The same athlete, day and energy always give the same result. */
export function playGame(athleteId: string, day: Date, energy: number): PetGame {
  const random = seededRandom(hash(`${athleteId}:${dayKey(day)}`));
  const won = random() < winChance(energy);
  const low = pick(LOSING_SCORES, random);
  const high = low + pick(MARGINS, random);
  const ourScore = won ? high : low;
  const fit = energy / 100;
  return {
    day: dayKey(day),
    opponent: opponentOn(athleteId, day),
    energy,
    ourScore,
    theirScore: won ? low : high,
    won,
    // Roughly how many of the team's touchdowns were his.
    touchdowns: Math.min(Math.floor(ourScore / 7), Math.round(random() * 2 + fit)),
    yards: Math.round(30 + fit * 110 + random() * 60),
  };
}

/**
 * Every game played since the pet joined: one per night, from `startedOn` up
 * to yesterday. Today's game hasn't happened yet, so today's exercises still
 * count toward it.
 */
export function gamesPlayed(athlete: Athlete, logs: ExerciseLog[], startedOn: string, today: Date): PetGame[] {
  const games: PetGame[] = [];
  const [y, m, d] = startedOn.split('-').map(Number);
  for (let day = new Date(y, m - 1, d); dayKey(day) < dayKey(today); day = addDays(day, 1)) {
    games.push(playGame(athlete.id, day, energyOn(athlete, logs, day)));
  }
  return games;
}

export interface Season {
  /** 1 for the first season. */
  number: number;
  wins: number;
  losses: number;
  /** Games left in this season. */
  remaining: number;
  /** The record of the season that just ended, when its last game was the latest one. */
  justFinished: { number: number; wins: number; losses: number } | null;
}

function record(games: PetGame[]) {
  const wins = games.filter((g) => g.won).length;
  return { wins, losses: games.length - wins };
}

export function currentSeason(games: PetGame[]): Season {
  const played = games.length % SEASON_LENGTH;
  const number = Math.floor(games.length / SEASON_LENGTH) + 1;
  const thisSeason = games.slice(games.length - played);
  const lastSeason = games.slice(-SEASON_LENGTH);
  return {
    number,
    ...record(thisSeason),
    remaining: SEASON_LENGTH - played,
    justFinished: played === 0 && games.length > 0 ? { number: number - 1, ...record(lastSeason) } : null,
  };
}

export interface CareerStats {
  games: number;
  wins: number;
  touchdowns: number;
  yards: number;
}

export function careerStats(games: PetGame[]): CareerStats {
  return {
    games: games.length,
    wins: games.filter((g) => g.won).length,
    touchdowns: games.reduce((sum, g) => sum + g.touchdowns, 0),
    yards: games.reduce((sum, g) => sum + g.yards, 0),
  };
}

/** Games the athlete hasn't seen the recap for yet (played after `seenThrough`). */
export function unseenGames(games: PetGame[], seenThrough: string | null): PetGame[] {
  return seenThrough ? games.filter((g) => g.day > seenThrough) : games;
}

/* ---------- Mood and talk ---------- */

export type PetMood = 'tired' | 'ready' | 'pumped';

export function moodFor(energy: number): PetMood {
  if (energy >= 100) return 'pumped';
  if (energy >= 34) return 'ready';
  return 'tired';
}

/** What the pet says on the Today screen. */
export function petSays(athlete: Athlete, logs: ExerciseLog[], today: Date): string {
  const opponent = `the ${opponentOn(athlete.id, today)}`;
  const assigned = athlete.assignedExerciseIds.length;
  const done = doneOnDay(athlete, logs, today);
  const left = assigned - done;
  const painToday = athlete.assignedExerciseIds.some((id) =>
    isHighPain(findLog(logs, athlete.id, id, today)?.pain),
  );

  if (painToday) return 'I saw that pain rating. Take it easy. Your trainer will check in with you.';
  if (assigned === 0) return `Rest day! I'm stretching out for tonight's game against ${opponent}.`;
  if (left === 0) return `Fully charged! Let's go beat ${opponent} tonight!`;
  if (done === 0) return `Game tonight vs ${opponent} and I'm running on empty. Help me warm up?`;
  return `${left} more exercise${left === 1 ? '' : 's'} and I'm ready for ${opponent}!`;
}
