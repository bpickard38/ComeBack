/*
  The store makes app state available to every screen.

  - React Context lets any component read the store without passing props
    down through every layer.
  - useReducer holds the state and applies actions (see reducer.ts).
  - On startup it loads everything from Supabase (remote.ts), then again
    every 30 seconds and whenever you come back to the tab, so you see what
    other people did.
  - Commands below are what screens call. They check the rules from
    src/domain, save to the database, and only then update the screen. Each
    returns a Result, so a screen can show `result.error` in a toast.
*/
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { isGoalReached, parseResultValue } from '../domain/goals';
import { normalizeAvailability } from '../domain/availability';
import { ALREADY_LOGGED, createLog } from '../domain/logs';
import { athleteThread } from '../domain/messages';
import { pointsFor } from '../domain/points';
import { rankUp, type Rank } from '../domain/rank';
import type {
  Athlete,
  Availability,
  Exercise,
  ExerciseLog,
  Message,
  MessageThread,
  MilestoneTest,
  Result,
  TestResult,
} from '../domain/types';
import { validateAssignment, validateMessage, type AssignmentInput } from '../domain/validation';
import type { Profile } from './profile';
import { reducer, type Action } from './reducer';
import * as remote from './remote';
import { createInitialState, type AppState } from './state';

const OFFLINE_ERROR = 'Nothing was recorded. Check your connection and try again.';

/** How often to fetch what other people changed. */
const REFRESH_MS = 30_000;

/** One athlete's goals. */
export function testsFor(state: AppState, athleteId: string): MilestoneTest[] {
  return state.tests.filter((t) => t.athleteId === athleteId);
}

/** A plan exercise by id. Throws if it's missing, which would be a bug. */
export function exerciseById(state: AppState, id: string): Exercise {
  const found = state.exercises.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown exercise: ${id}`);
  return found;
}

export function testById(state: AppState, id: string): MilestoneTest {
  const found = state.tests.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown test: ${id}`);
  return found;
}

function makeCommands(state: AppState, dispatch: Dispatch<Action>, profile: Profile, reload: () => Promise<void>) {
  /** The new rank if these changes push the athlete over a threshold, else null. */
  function rankUpFrom(athlete: Athlete, logs: ExerciseLog[], results: TestResult[]): Rank | null {
    const tests = testsFor(state, athlete.id);
    const before = pointsFor(athlete, state.logs, tests, state.results).total;
    const after = pointsFor(athlete, logs, tests, results).total;
    return rankUp(before, after);
  }

  return {
    toggleOffline: () => dispatch({ type: 'setOffline', offline: !state.offline }),
    simulateReminder: () => dispatch({ type: 'simulateReminder' }),
    reload,

    async logExercise(
      athleteId: string,
      exerciseId: string,
      pain: number | undefined,
    ): Promise<Result<{ log: ExerciseLog; rankUp: Rank | null }>> {
      const athlete = state.athletes.find((a) => a.id === athleteId);
      const name = state.exercises.find((e) => e.id === exerciseId)?.name ?? 'this exercise';
      if (!athlete) return { ok: false, error: 'Athlete not found.' };
      if (state.offline) return { ok: false, error: `Could not save your log for ${name}. ${OFFLINE_ERROR}` };
      const created = createLog(athlete, state.logs, exerciseId, new Date(), pain);
      if (!created.ok) {
        return { ok: false, error: created.error === ALREADY_LOGGED ? `${name} is already logged today.` : created.error };
      }
      const log = created.value;
      const saved = await remote.insertLog(log);
      if (!saved.ok) return { ok: false, error: `Could not save your log for ${name}. ${saved.error}` };
      dispatch({ type: 'addLog', log });
      return { ok: true, value: { log, rankUp: rankUpFrom(athlete, [...state.logs, log], state.results) } };
    },

    async recordResult(
      athleteId: string,
      testId: string,
      raw: string,
    ): Promise<Result<{ result: TestResult; newlyReached: boolean; rankUp: Rank | null }>> {
      const athlete = state.athletes.find((a) => a.id === athleteId);
      const test = state.tests.find((t) => t.id === testId);
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
      const saved = await remote.insertResult(result, profile.id);
      if (!saved.ok) return { ok: false, error: `Could not save your result. ${saved.error}` };
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

    /** input.injury is an injury id from state.catalog. */
    async assignPlan(input: AssignmentInput): Promise<Result<AssignmentInput>> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can assign injuries and exercises.' };
      const valid = validateAssignment(input);
      if (!valid.ok) return valid;
      if (state.offline) return { ok: false, error: `Could not save the plan. ${OFFLINE_ERROR}` };
      const saved = await remote.assignPlan(input.athleteId, input.injury, input.exerciseIds);
      if (!saved.ok) return saved;
      await reload(); // new plan exercises get ids from the database
      return valid;
    },

    async sendMessage(thread: MessageThread, text: string): Promise<Result<Message>> {
      const valid = validateMessage(text);
      if (!valid.ok) return valid;
      // Who may write where: athletes only in their own thread with the trainer,
      // coaches only to the trainer, the trainer anywhere. The database checks
      // this too (conversation membership).
      if (state.role === 'athlete' && thread !== athleteThread(profile.id)) {
        return { ok: false, error: 'You can only message your trainer.' };
      }
      if (state.role === 'coach' && thread !== 'coach-trainer') {
        return { ok: false, error: 'Coaches can only message the trainer.' };
      }
      if (state.offline) return { ok: false, error: `Could not send your message. ${OFFLINE_ERROR}` };
      const conversation = state.conversations.find((c) => c.thread === thread);
      if (!conversation) return { ok: false, error: 'This conversation isn’t set up yet. Ask your trainer.' };
      const saved = await remote.insertMessage(conversation.id, profile.id, valid.value);
      if (!saved.ok) return { ok: false, error: `Could not send your message. ${saved.error}` };
      const from = ({ trainer: 'Trainer', coach: 'Coach', athlete: 'Athlete' } as const)[state.role];
      const message: Message = {
        id: saved.value.id,
        thread,
        from,
        senderId: profile.id,
        senderName: profile.name,
        text: valid.value,
        sentAt: saved.value.sentAt,
      };
      dispatch({ type: 'addMessage', message });
      return { ok: true, value: message };
    },

    async setAvailability(athleteId: string, availability: Availability, expectedReturn: string | null): Promise<Result> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can change availability.' };
      if (state.offline) return { ok: false, error: `Could not save the change. ${OFFLINE_ERROR}` };
      const next = normalizeAvailability(availability, expectedReturn);
      const saved = await remote.updateAvailability(athleteId, next.availability, next.expectedReturn);
      if (!saved.ok) return saved;
      dispatch({ type: 'setAvailability', athleteId, ...next });
      return { ok: true, value: undefined };
    },
  };
}

interface StoreValue {
  state: AppState;
  commands: ReturnType<typeof makeCommands>;
  /** Who is signed in. profile.role is fixed by their account. */
  profile: Profile;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ profile, children }: { profile: Profile; children: ReactNode }) {
  const [loadError, setLoadError] = useState('');
  // null until the first load finishes. After that, fresh data is merged in
  // ('loaded'), keeping on-screen-only settings like the offline toggle.
  const [state, dispatch] = useReducer((current: AppState | null, action: Action) => {
    if (current) return reducer(current, action);
    return action.type === 'loaded' ? createInitialState(profile.role, action.data) : null;
  }, null);

  // Counts saves. A refresh that started before a save finished would bring
  // back data without it, so its answer is ignored.
  const writes = useRef(0);

  const reload = useCallback(async () => {
    const startedAt = writes.current;
    try {
      const data = await remote.loadAll(profile);
      if (startedAt !== writes.current) return;
      setLoadError('');
      dispatch({ type: 'loaded', data });
    } catch (error) {
      console.error('Loading from Supabase failed', error);
      setLoadError('Could not load your data. Check your connection and try again.');
    }
  }, [profile]);

  // First load, then refresh on a timer and when the tab comes back into view.
  useEffect(() => {
    reload();
    const timer = setInterval(reload, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  // Commands dispatch through this, so saves are counted (see `writes`).
  const countingDispatch = useCallback((action: Action) => {
    if (action.type !== 'setOffline' && action.type !== 'simulateReminder') writes.current++;
    dispatch(action);
  }, []);

  if (!state) {
    return loadError ? (
      <div className="gate-status">
        <p>{loadError}</p>
        <Button variant="primary" onClick={reload}>
          Try again
        </Button>
      </div>
    ) : (
      <p className="gate-status">Loading…</p>
    );
  }

  const commands = makeCommands(state, countingDispatch, profile, reload);
  return <StoreContext.Provider value={{ state, commands, profile }}>{children}</StoreContext.Provider>;
}

/** Read the store from any component inside <AppStoreProvider>. */
export function useAppStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return value;
}

/** The signed-in athlete, for the athlete screens. */
export function useSignedInAthlete(): Athlete {
  const { state, profile } = useAppStore();
  const athlete = state.athletes.find((a) => a.id === profile.id);
  if (!athlete) throw new Error('Signed-in athlete missing from data');
  return athlete;
}
