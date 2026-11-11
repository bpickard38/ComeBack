/*
  The shapes of the app's data. `interface` and `type` only exist for
  TypeScript's checker; they disappear when the app is built.
  Dates are ISO strings (e.g. "2026-10-07T18:10:00.000Z"), the way the
  database sends them.
*/

export type Role = 'athlete' | 'trainer' | 'coach';

/** What the coach sees instead of medical details. */
export type Availability = 'out' | 'limited' | 'cleared';

/** An exercise on an athlete's plan. id is the plan_exercises row, so the same
 * exercise can be prescribed differently for different athletes. */
export interface Exercise {
  id: string;
  name: string;
  /** What to do, in plain words, e.g. "3 sets of 12". */
  prescription: string;
  /** Tutorial video link (usually YouTube). null shows a placeholder. */
  videoUrl: string | null;
  /** One-line how-to from the exercises catalog. */
  description?: string | null;
  /** The injury (athlete_injuries row) this exercise was prescribed for. */
  caseId?: string;
  /** The prescription as numbers, for the trainer to edit. null means not used. */
  sets?: number | null;
  reps?: number | null;
  holdSeconds?: number | null;
  /** false once the trainer takes it off the plan. */
  active?: boolean;
}

/** One active injury on an athlete. caseId is the athlete_injuries row. */
export interface AthleteInjury {
  caseId: string;
  name: string;
}

/**
 * One injury an athlete has had, active or cleared, with what was prescribed
 * and how the milestone tests went. Loaded for trainers only.
 */
export interface InjuryRecord {
  /** The athlete_injuries row. */
  caseId: string;
  athleteId: string;
  name: string;
  bodyRegion: string | null;
  /** Calendar day "YYYY-MM-DD". */
  startDate: string;
  /** When the trainer cleared it; null while it's active. */
  clearedAt: string | null;
  /** Exercises on this injury's plan, e.g. "Calf raise: 3 sets of 15". */
  exercises: string[];
  goals: Array<{ name: string; unit: string; baseline: number; target: number; latest: number | null }>;
}

/** A trainer's private note about an athlete. */
export interface AthleteNote {
  text: string;
  updatedAt: string;
  /** Name of the trainer who last saved it, when known. */
  updatedBy?: string;
}

/** A team the signed-in person is on. A trainer can have several. */
export interface Team {
  id: string;
  name: string;
  sport: string | null;
  /** Names of the coaches on this team. */
  coachNames: string[];
}

export interface Athlete {
  id: string;
  name: string;
  sport: string;
  /** Every team this athlete is on (usually one). */
  teamIds: string[];
  /** Profile photo the athlete uploaded, as a web address. Missing until they add one. */
  photoUrl?: string | null;
  /** Contact details, loaded for trainers only. */
  email?: string;
  phone?: string | null;
  /** Every active injury. An athlete can have several at once. */
  injuries: AthleteInjury[];
  /** Plan exercises from all active injuries together. */
  assignedExerciseIds: string[];
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

/** A test as one athlete's goal. id is the case_milestones row. */
export interface MilestoneTest {
  id: string;
  athleteId: string;
  /** The injury (athlete_injuries row) this goal belongs to. */
  caseId?: string;
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
  source: 'athlete' | 'trainer';
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

/**
 * "athlete:<athlete id>" for trainer and athlete messages, "coach:<team id>"
 * for one team's coach-to-trainer thread (each team has its own), or
 * "about:<team id>:<athlete id>" for that team's trainers and coaches
 * talking about one athlete, which the athlete can't see.
 */
export type MessageThread = `athlete:${string}` | `coach:${string}` | `about:${string}`;

export interface Message {
  id: string;
  thread: MessageThread;
  from: 'Trainer' | 'Coach' | 'Athlete';
  /** Who sent it, when known (a users id), and their name. */
  senderId?: string;
  senderName?: string;
  text: string;
  sentAt: string;
  /** When the other person opened it. Missing means not read yet. */
  readAt?: string;
}

/**
 * Many functions return either success or an error message the UI can show.
 * Checking `result.ok` tells TypeScript which of the two you have.
 */
export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
