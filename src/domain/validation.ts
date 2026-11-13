import type { Result } from './types';

export interface AssignmentInput {
  athleteId: string;
  /** The injury's id (injuries table). */
  injury: string;
  exerciseIds: string[];
}

export function validateAssignment(input: AssignmentInput): Result<AssignmentInput> {
  if (!input.athleteId || !input.injury || input.exerciseIds.length === 0) {
    return { ok: false, error: 'Pick an athlete, an injury and at least one exercise.' };
  }
  return { ok: true, value: input };
}

export function validateMessage(text: string): Result<string> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Write a message first.' };
  return { ok: true, value: trimmed };
}

export interface TeamInput {
  name: string;
  /** Optional, '' when left blank. */
  sport: string;
  school: string;
}

/** Same shape, trimmed and with a name. */
export type ValidTeam = TeamInput;

export function validateTeam(input: TeamInput): Result<ValidTeam> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Give your team a name.' };
  return { ok: true, value: { name, sport: input.sport.trim(), school: input.school.trim() } };
}

/** A prescription as typed into the trainer's number boxes; '' means not used. */
export interface PrescriptionInput {
  sets: string;
  reps: string;
  hold: string;
}

export interface ValidPrescription {
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
}

/** Each of sets, reps and hold is either blank or a whole number from 1 to 999. */
export function validatePrescription(input: PrescriptionInput): Result<ValidPrescription> {
  const parse = (raw: string): number | null | undefined => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isInteger(n) && n >= 1 && n <= 999 ? n : undefined;
  };
  const sets = parse(input.sets);
  const reps = parse(input.reps);
  const holdSeconds = parse(input.hold);
  if (sets === undefined || reps === undefined || holdSeconds === undefined) {
    return { ok: false, error: 'Sets, reps and hold must be whole numbers of 1 or more, or left blank.' };
  }
  return { ok: true, value: { sets, reps, holdSeconds } };
}

export interface AppointmentInput {
  athleteId: string;
  title: string;
  /** "2026-11-12", from a date input. */
  date: string;
  /** "15:30", from a time input. Read as the trainer's local time. */
  time: string;
  location: string;
  testIds: string[];
  exerciseIds: string[];
}

export interface ValidAppointment extends AppointmentInput {
  /** The visit time as an ISO timestamp, ready to save. */
  startsAt: string;
}

/** A visit needs a title and a date and time that hasn't passed yet. */
export function validateAppointment(input: AppointmentInput, now: Date): Result<ValidAppointment> {
  const title = input.title.trim();
  if (!input.athleteId) return { ok: false, error: 'Pick an athlete.' };
  if (!title) return { ok: false, error: 'Give the appointment a title.' };
  if (!input.date || !input.time) return { ok: false, error: 'Pick a date and time.' };
  // Without a "Z" on the end, this reads as local time.
  const starts = new Date(`${input.date}T${input.time}`);
  if (Number.isNaN(starts.getTime())) return { ok: false, error: 'Pick a date and time.' };
  if (starts <= now) return { ok: false, error: 'Pick a time that hasn’t passed yet.' };
  return {
    ok: true,
    value: { ...input, title, location: input.location.trim(), startsAt: starts.toISOString() },
  };
}
