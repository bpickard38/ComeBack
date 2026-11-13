/*
  What a trainer wants to know before treating someone: every injury they've
  had here, how long each took, and how much pain they've reported lately.
  Used by the player profile (trainer only; coaches never get any of this).
*/
import { addDays, dayKey } from './dates';
import { isHighPain } from './pain';
import type { Appointment, ExerciseLog, InjuryRecord, Result } from './types';

/** How far back the profile's pain section looks, including today. */
export const PAIN_HISTORY_DAYS = 14;

/** Longest note the database accepts (see supabase/athlete_notes.sql). */
export const NOTE_MAX_LENGTH = 4000;

/** One athlete's injuries: active ones first (oldest first), then cleared ones, most recent first. */
export function injuryHistory(records: InjuryRecord[], athleteId: string): InjuryRecord[] {
  const mine = records.filter((r) => r.athleteId === athleteId);
  const active = mine.filter((r) => !r.clearedAt).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const cleared = mine.filter((r) => r.clearedAt).sort((a, b) => b.clearedAt!.localeCompare(a.clearedAt!));
  return [...active, ...cleared];
}

/** Whole days from the injury's start to when it was cleared, or to today if it's still active. */
export function injuryDays(record: InjuryRecord, today: Date): number {
  const [y, m, d] = record.startDate.split('-').map(Number);
  const start = new Date(y, m - 1, d); // local midnight, so the day doesn't shift
  const endTime = record.clearedAt ? new Date(record.clearedAt) : today;
  const end = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate());
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

export interface PainHistory {
  /** How many logs in the window carried a pain rating. */
  rated: number;
  /** Highest rating in the window, or null if nothing was rated. */
  highest: number | null;
  /** Logs at or above the alert level, newest first. */
  high: ExerciseLog[];
}

/** Pain the athlete reported over the last PAIN_HISTORY_DAYS days. */
export function painHistory(logs: ExerciseLog[], athleteId: string, today: Date): PainHistory {
  const oldest = dayKey(addDays(today, -(PAIN_HISTORY_DAYS - 1)));
  const rated = logs.filter(
    (l) => l.athleteId === athleteId && l.pain !== undefined && dayKey(new Date(l.loggedAt)) >= oldest,
  );
  return {
    rated: rated.length,
    highest: rated.length ? Math.max(...rated.map((l) => l.pain!)) : null,
    high: rated.filter((l) => isHighPain(l.pain)).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
  };
}

/** One athlete's visits that already started, most recent first. */
export function pastAppointments(appointments: Appointment[], athleteId: string, now: Date): Appointment[] {
  return appointments
    .filter((a) => a.athleteId === athleteId && new Date(a.startsAt) < now)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** A note may be empty (that clears it) but not longer than the database allows. */
export function validateNote(text: string): Result<string> {
  const trimmed = text.trim();
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `Notes can be up to ${NOTE_MAX_LENGTH} characters. This one is ${trimmed.length}.` };
  }
  return { ok: true, value: trimmed };
}
