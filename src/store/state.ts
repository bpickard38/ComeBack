import type {
  Appointment,
  Athlete,
  AthleteNote,
  Exercise,
  ExerciseLog,
  InjuryRecord,
  Message,
  MessageThread,
  MilestoneTest,
  Role,
  Team,
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
  /** The teams you're on, by name. A trainer can have several. */
  teams: Team[];
  /** Athletes on all of those teams; each lists its teamIds. */
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
  /** Every injury on file, active and cleared, for the trainer's player profiles. Empty for coaches. */
  injuryHistory: InjuryRecord[];
  /** Trainer notes by athlete id. null for other roles, or when
   * supabase/athlete_notes.sql hasn't been run yet. */
  notes: Record<string, AthleteNote> | null;
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
  /** Which team a trainer or coach is looking at. null means the first one. */
  selectedTeamId: string | null;
  /** Demo toggle: pretend the connection is down so saves fail. */
  offline: boolean;
  /** Demo button: show the end-of-day reminder regardless of the clock. */
  reminderSimulated: boolean;
}

export function createInitialState(role: Role, data: RemoteData, selectedTeamId: string | null = null): AppState {
  return { role, selectedTeamId, offline: false, reminderSimulated: false, ...data };
}
