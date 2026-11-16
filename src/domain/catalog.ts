/*
  Rules for the trainer's Exercises page: adding injuries and exercises,
  pasting a video link, and counting who uses what. Plain functions, tested
  in catalog.test.ts.
*/
import type { Athlete, Result } from './types';
import { youtubeId } from './video';

export const CATALOG_NAME_MAX = 80;
export const HOW_TO_MAX = 300;

/** Trimmed, single-spaced, and not already in the catalog (in any capitalization). */
export function validateCatalogName(raw: string, existing: Array<{ id: string; name: string }>, what: string, exceptId?: string): Result<string> {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: `Give the ${what} a name.` };
  if (name.length > CATALOG_NAME_MAX) return { ok: false, error: `Keep the name to ${CATALOG_NAME_MAX} characters.` };
  const same = existing.find((e) => e.id !== exceptId && e.name.toLowerCase() === name.toLowerCase());
  if (same) return { ok: false, error: `${same.name} is already in the list.` };
  return { ok: true, value: name };
}

/**
 * A pasted video link as the plain YouTube watch link, so every saved
 * link looks the same and plays in the app. Blank means no video.
 */
export function validateVideoLink(raw: string): Result<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const id = youtubeId(trimmed);
  if (!id) return { ok: false, error: 'Paste a YouTube link, like https://www.youtube.com/watch?v=… or https://youtu.be/…' };
  return { ok: true, value: `https://www.youtube.com/watch?v=${id}` };
}

/** The how-to line athletes see: trimmed, one paragraph, not too long. */
export function cleanHowTo(raw: string): string | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, HOW_TO_MAX) : null;
}

/** How many athletes have this injury active right now (matched by name, as on the roster). */
export function athletesWithInjury(athletes: Athlete[], injuryName: string): number {
  return athletes.filter((a) => a.injuries.some((i) => i.name === injuryName)).length;
}

/** Which injuries' starting sets include this exercise, by injury name. */
export function setsUsingExercise(
  exerciseId: string,
  workoutSets: Record<string, string[]>,
  injuries: Array<{ id: string; name: string }>,
): string[] {
  return injuries.filter((i) => workoutSets[i.id]?.includes(exerciseId)).map((i) => i.name);
}
