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
import { latestResult } from './goals';
import { doneOnDay, findLog } from './logs';
import { isHighPain } from './pain';
import { REMINDER_HOUR } from './reminder';
import type { Athlete, ExerciseLog, MilestoneTest, Result, TestResult } from './types';

/** How the athlete customized their pet. */
export interface PetLook {
  name: string;
  /** Jersey number, 0 to 99. */
  number: number;
  /** Uniform color (jersey, socks, helmet stripe), "#rrggbb". */
  jersey: string;
  /** Skin tone, "#rrggbb". */
  skin: string;
}

/** The red the artwork was drawn in. */
export const ORIGINAL_RED = '#9b3223';
/** The skin tone the artwork was drawn in. */
export const ORIGINAL_SKIN = '#f7cb94';

export const SKIN_TONES = [
  { label: 'Light', value: ORIGINAL_SKIN },
  { label: 'Medium light', value: '#e2a872' },
  { label: 'Medium', value: '#c18553' },
  { label: 'Medium dark', value: '#93603a' },
  { label: 'Dark', value: '#6a4128' },
] as const;

export const JERSEY_COLORS = [
  { label: 'Red', value: ORIGINAL_RED },
  { label: 'Navy', value: '#22408f' },
  { label: 'Royal blue', value: '#2f63c9' },
  { label: 'Sky blue', value: '#4a9fd8' },
  { label: 'Green', value: '#2e8540' },
  { label: 'Purple', value: '#5e3a9c' },
  { label: 'Orange', value: '#dd6b1f' },
  { label: 'Gold', value: '#d9a521' },
  { label: 'Maroon', value: '#6b1f2a' },
  { label: 'Black', value: '#2a2d33' },
] as const;

export const DEFAULT_LOOK: PetLook = { name: 'Rookie', number: 12, jersey: ORIGINAL_RED, skin: ORIGINAL_SKIN };

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
  if (!JERSEY_COLORS.some((c) => c.value === look.jersey)) return { ok: false, error: 'Pick a jersey color.' };
  if (!SKIN_TONES.some((c) => c.value === look.skin)) return { ok: false, error: 'Pick a skin tone.' };
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

/* ---------- State and talk ---------- */

/** Which sprite to show. Each one is an image in src/assets/pet. */
export type PetState = 'idle' | 'happy' | 'training' | 'tired' | 'celebrating';

export const PET_STATE_LABEL: Record<PetState, string> = {
  idle: 'Ready to go',
  happy: 'Pumped up',
  training: 'Training',
  tired: 'Tired',
  celebrating: 'Celebrating',
};

/** A milestone goal reached this recently still gets a celebration the first time the athlete sees him. */
export const CELEBRATE_GOAL_DAYS = 3;

/**
 * When the most recent goal was reached (the result's time), if one was
 * reached in the last few days. null otherwise.
 */
export function latestGoalReachedAt(
  tests: MilestoneTest[],
  results: TestResult[],
  athleteId: string,
  today: Date,
): string | null {
  const since = addDays(today, -CELEBRATE_GOAL_DAYS).toISOString();
  let latestAt: string | null = null;
  for (const t of tests) {
    if (t.athleteId !== athleteId) continue;
    const latest = latestResult(results, athleteId, t.id);
    if (latest && latest.value >= t.target && latest.recordedAt >= since && (!latestAt || latest.recordedAt > latestAt)) {
      latestAt = latest.recordedAt;
    }
  }
  return latestAt;
}

export interface PetStateInput {
  athlete: Athlete;
  logs: ExerciseLog[];
  today: Date;
}

/**
 * His resting pose, from today's exercises:
 * happy (today's plan is done), training (part of it is done),
 * tired (nothing done today, and it's evening or nothing was done yesterday either),
 * idle (otherwise, including rest days).
 * Celebrating is never a resting pose: it plays for a moment after something
 * happens (see PetReaction in the Today screen's PetCard).
 */
export function petState({ athlete, logs, today }: PetStateInput): PetState {
  const assigned = athlete.assignedExerciseIds.length;
  if (assigned === 0) return 'idle';
  const done = doneOnDay(athlete, logs, today);
  if (done === assigned) return 'happy';
  if (done > 0) return 'training';
  const inactiveYesterday = doneOnDay(athlete, logs, addDays(today, -1)) === 0;
  if (today.getHours() >= REMINDER_HOUR || inactiveYesterday) return 'tired';
  return 'idle';
}

/** A moment of excitement: a pose and a line, shown for a few seconds. */
export interface PetReaction {
  state: PetState;
  text: string;
  /** A short pop-up over him, like "+33%". */
  badge?: string;
}

/** How he reacts when an exercise is logged. A cheer, or a full celebration when the plan is done. */
export function reactionToExercise(energyBefore: number, energyAfter: number, exercisesLeft: number): PetReaction {
  const badge = `+${energyAfter - energyBefore}%`;
  if (exercisesLeft === 0) return { state: 'celebrating', text: 'Fully charged! We are winning tonight!', badge };
  return {
    state: 'happy',
    text: `${badge} energy! ${exercisesLeft} more to go.`,
    badge,
  };
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
