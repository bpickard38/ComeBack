/*
  Finding athletes by name, for the trainer's roster search (one team) and
  the search across all of their teams.
*/
import type { Athlete } from './types';

/** Lower case, without accents, so "jose" finds "José". */
function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Athletes whose name contains every word typed, in any order and any case
 * ("tor may" finds "Maya Torres"). Names that start with what was typed come
 * first, then the rest by name. An empty search returns everyone, by name.
 */
export function searchAthletes<T extends Pick<Athlete, 'name'>>(athletes: T[], query: string): T[] {
  const typed = plain(query).trim();
  const words = typed.split(/\s+/).filter(Boolean);
  const startsWithTyped = (a: T) => (typed !== '' && plain(a.name).startsWith(typed) ? 0 : 1);
  return athletes
    .filter((a) => words.every((w) => plain(a.name).includes(w)))
    .sort((a, b) => startsWithTyped(a) - startsWithTyped(b) || a.name.localeCompare(b.name));
}
