import { createSeed } from '../data/seed';
import type {
  Appointment,
  Athlete,
  ExerciseLog,
  Message,
  Role,
  TestResult,
} from '../domain/types';

/** Everything the app remembers. This whole object is saved to localStorage. */
export interface AppState {
  role: Role;
  /** Demo toggle: pretend the connection is down so saves fail. */
  offline: boolean;
  /** Demo button: show the end-of-day reminder regardless of the clock. */
  reminderSimulated: boolean;
  athletes: Athlete[];
  logs: ExerciseLog[];
  results: TestResult[];
  appointments: Appointment[];
  messages: Message[];
}

export function createInitialState(now: Date = new Date()): AppState {
  return {
    role: 'athlete',
    offline: false,
    reminderSimulated: false,
    ...createSeed(now),
  };
}
