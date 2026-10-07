/*
  The store makes app state available to every screen.

  - React Context lets any component read the store without passing props
    down through every layer.
  - useReducer holds the state and applies actions (see reducer.ts).
  - Commands below are what screens call. They check the rules from
    src/domain, then dispatch an action. Each returns a Result, so a screen
    can show `result.error` in a toast when something isn't allowed.
*/
import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { EXERCISES, SIGNED_IN_ATHLETE_ID, TESTS } from '../data/seed';
import { isGoalReached, parseResultValue } from '../domain/goals';
import { normalizeAvailability } from '../domain/availability';
import { ALREADY_LOGGED, createLog } from '../domain/logs';
import { athleteThread } from '../domain/messages';
import { pointsFor } from '../domain/points';
import { rankUp, type Rank } from '../domain/rank';
import type {
  Athlete,
  Availability,
  ExerciseLog,
  Message,
  MessageThread,
  Result,
  Role,
  TestResult,
} from '../domain/types';
import { validateAssignment, validateMessage, type AssignmentInput } from '../domain/validation';
import { loadState, saveState } from './persistence';
import { reducer, type Action } from './reducer';
import { createInitialState, type AppState } from './state';

const OFFLINE_ERROR = 'Nothing was recorded. Check your connection and try again.';

/** Short unique id. (crypto.randomUUID needs HTTPS, which a phone on your Wi-Fi won't have.) */
function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeCommands(state: AppState, dispatch: Dispatch<Action>) {
  /** The new rank if these changes push the athlete over a threshold, else null. */
  function rankUpFrom(athlete: Athlete, logs: ExerciseLog[], results: TestResult[]): Rank | null {
    const before = pointsFor(athlete, state.logs, TESTS, state.results).total;
    const after = pointsFor(athlete, logs, TESTS, results).total;
    return rankUp(before, after);
  }

  return {
    setRole: (role: Role) => dispatch({ type: 'setRole', role }),
    toggleOffline: () => dispatch({ type: 'setOffline', offline: !state.offline }),
    simulateReminder: () => dispatch({ type: 'simulateReminder' }),
    resetDemo: () => dispatch({ type: 'reset', state: createInitialState() }),

    logExercise(
      athleteId: string,
      exerciseId: string,
      pain: number | undefined,
    ): Result<{ log: ExerciseLog; rankUp: Rank | null }> {
      const athlete = state.athletes.find((a) => a.id === athleteId);
      const name = EXERCISES.find((e) => e.id === exerciseId)?.name ?? 'this exercise';
      if (!athlete) return { ok: false, error: 'Athlete not found.' };
      if (state.offline) return { ok: false, error: `Could not save your log for ${name}. ${OFFLINE_ERROR}` };
      const created = createLog(athlete, state.logs, exerciseId, new Date(), pain);
      if (!created.ok) {
        return { ok: false, error: created.error === ALREADY_LOGGED ? `${name} is already logged today.` : created.error };
      }
      const log = created.value;
      dispatch({ type: 'addLog', log });
      return { ok: true, value: { log, rankUp: rankUpFrom(athlete, [...state.logs, log], state.results) } };
    },

    recordResult(
      athleteId: string,
      testId: string,
      raw: string,
    ): Result<{ result: TestResult; newlyReached: boolean; rankUp: Rank | null }> {
      const athlete = state.athletes.find((a) => a.id === athleteId);
      const test = TESTS.find((t) => t.id === testId);
      if (!athlete || !test) return { ok: false, error: 'Test not found.' };
      const parsed = parseResultValue(raw, test.name);
      if (!parsed.ok) return parsed;
      if (state.offline) return { ok: false, error: `Could not save your result. ${OFFLINE_ERROR}` };
      const result: TestResult = {
        athleteId,
        testId,
        value: parsed.value,
        recordedAt: new Date().toISOString(),
        source: 'athlete',
      };
      const results = [...state.results, result];
      dispatch({ type: 'addResult', result });
      return {
        ok: true,
        value: {
          result,
          newlyReached: !isGoalReached(test, state.results, athleteId) && isGoalReached(test, results, athleteId),
          rankUp: rankUpFrom(athlete, state.logs, results),
        },
      };
    },

    assignPlan(input: AssignmentInput): Result<AssignmentInput> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can assign injuries and exercises.' };
      const valid = validateAssignment(input);
      if (valid.ok) dispatch({ type: 'assignPlan', assignment: valid.value });
      return valid;
    },

    sendMessage(thread: MessageThread, text: string): Result<Message> {
      const valid = validateMessage(text);
      if (!valid.ok) return valid;
      // Who may write where: athletes only in their own thread with the trainer,
      // coaches only to the trainer, the trainer anywhere.
      if (state.role === 'athlete' && thread !== athleteThread(SIGNED_IN_ATHLETE_ID)) {
        return { ok: false, error: 'You can only message your trainer.' };
      }
      if (state.role === 'coach' && thread !== 'coach-trainer') {
        return { ok: false, error: 'Coaches can only message the trainer.' };
      }
      const from = ({ trainer: 'Trainer', coach: 'Coach', athlete: 'Athlete' } as const)[state.role];
      const message: Message = {
        id: makeId(),
        thread,
        from,
        text: valid.value,
        sentAt: new Date().toISOString(),
      };
      dispatch({ type: 'addMessage', message });
      return { ok: true, value: message };
    },

    setAvailability(athleteId: string, availability: Availability, expectedReturn: string | null): Result {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can change availability.' };
      if (state.offline) return { ok: false, error: `Could not save the change. ${OFFLINE_ERROR}` };
      dispatch({ type: 'setAvailability', athleteId, ...normalizeAvailability(availability, expectedReturn) });
      return { ok: true, value: undefined };
    },
  };
}

interface StoreValue {
  state: AppState;
  commands: ReturnType<typeof makeCommands>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  // The third argument runs once on startup: saved data if there is any, else fresh demo data.
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? createInitialState());

  // useEffect runs after each render; here it saves whenever state changes.
  useEffect(() => saveState(state), [state]);

  const commands = makeCommands(state, dispatch);
  return <StoreContext.Provider value={{ state, commands }}>{children}</StoreContext.Provider>;
}

/** Read the store from any component inside <AppStoreProvider>. */
export function useAppStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return value;
}

/** The athlete you're "signed in" as on the athlete screens (Maya). */
export function useSignedInAthlete(): Athlete {
  const { state } = useAppStore();
  const athlete = state.athletes.find((a) => a.id === SIGNED_IN_ATHLETE_ID);
  if (!athlete) throw new Error('Signed-in athlete missing from data');
  return athlete;
}
