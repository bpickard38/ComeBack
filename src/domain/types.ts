/*
  The shapes of the app's data. `interface` and `type` only exist for
  TypeScript's checker; they disappear when the app is built.
  Dates are stored as ISO strings (e.g. "2026-10-07T18:10:00.000Z") so they
  survive being saved to localStorage, and later to a real database.
*/

export type Role = 'athlete' | 'trainer' | 'coach';

/** What the coach sees instead of medical details. */
export type Availability = 'out' | 'limited' | 'cleared';

export interface Exercise {
  id: string;
  name: string;
  /** What to do, in plain words, e.g. "3 sets of 12". */
  prescription: string;
  /** Tutorial video link. null until real videos exist; show a placeholder. */
  videoUrl: string | null;
}

export interface Athlete {
  id: string;
  name: string;
  sport: string;
  injury: string;
  assignedExerciseIds: string[];
  /** Exercises logged before this app's history starts. Each counts 1 point. */
  priorExerciseCount: number;
  priorBestStreak: number;
  /** Set by the trainer. The only rehab status the coach can see. */
  availability: Availability;
  /** Expected return as a calendar day "YYYY-MM-DD", or null if unknown or cleared. */
  expectedReturn: string | null;
}

export interface ExerciseLog {
  athleteId: string;
  exerciseId: string;
  loggedAt: string;
  /** Pain the athlete felt, 0 (none) to 10 (worst). Missing on older logs. */
  pain?: number;
}

export interface MilestoneTest {
  id: string;
  name: string;
  /** Plain-language explanation shown to the athlete. */
  description: string;
  unit: string;
  baseline: number;
  target: number;
}

export interface TestResult {
  athleteId: string;
  testId: string;
  value: number;
  recordedAt: string;
  source: 'athlete';
}

export interface Appointment {
  id: string;
  athleteId: string;
  startsAt: string;
  location: string;
  title: string;
  testIds: string[];
  /** Optional per-test wording for this visit, e.g. { balance: 'Retest: aim for 25 sec' }. */
  testNotes?: Record<string, string>;
  exerciseIds: string[];
}

/** "athlete:<id>" for trainer and athlete messages, or the coach-to-trainer thread. */
export type MessageThread = `athlete:${string}` | 'coach-trainer';

export interface Message {
  id: string;
  thread: MessageThread;
  from: 'Trainer' | 'Coach' | 'Athlete';
  text: string;
  sentAt: string;
}

/**
 * Many functions return either success or an error message the UI can show.
 * Checking `result.ok` tells TypeScript which of the two you have.
 */
export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
