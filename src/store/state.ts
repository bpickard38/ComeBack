import type {
  Appointment,
  Athlete,
  Exercise,
  ExerciseLog,
  Message,
  MessageThread,
  MilestoneTest,
  Role,
  TestResult,
} from '../domain/types';
import type { AthleteProgress } from '../domain/progress';

/** A catalog entry the trainer picks from (injuries, exercises). */
export interface CatalogItem {
  id: string;
  name: string;
}

/**
 * Everything the signed-in person is allowed to see, loaded from Supabase
 * (see remote.ts). Row level security decides what's in here: an athlete
 * gets only their own records, a coach gets the roster without medical
 * details, a trainer gets their teams' athletes.
 */
export interface RemoteData {
  athletes: Athlete[];
  /** Plan exercises for every athlete above. */
  exercises: Exercise[];
  /** Each athlete's goals. */
  tests: MilestoneTest[];
  logs: ExerciseLog[];
  results: TestResult[];
  appointments: Appointment[];
  messages: Message[];
  /** Which database conversation each message thread is. */
  conversations: Array<{ thread: MessageThread; id: string }>;
  /** Per-athlete counts for the coach's weekly summary. null for other roles,
   * or when supabase/weekly_summary.sql hasn't been run yet. */
  progress: AthleteProgress[] | null;
  /** What the trainer can assign. Empty for everyone else. */
  catalog: {
    injuries: CatalogItem[];
    exercises: CatalogItem[];
    /** Each injury's workout set: injury id to exercise ids, in order. */
    workoutSets: Record<string, string[]>;
  };
}

/** RemoteData plus a few things that only live on this screen. */
export interface AppState extends RemoteData {
  /** Fixed by the account; see AuthGate. */
  role: Role;
  /** Demo toggle: pretend the connection is down so saves fail. */
  offline: boolean;
  /** Demo button: show the end-of-day reminder regardless of the clock. */
  reminderSimulated: boolean;
}

export function createInitialState(role: Role, data: RemoteData): AppState {
  return { role, offline: false, reminderSimulated: false, ...data };
}
