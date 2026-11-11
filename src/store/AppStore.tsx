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
import { validateNote } from '../domain/history';
import { ALREADY_LOGGED, createLog } from '../domain/logs';
import { athleteThread, unreadIn } from '../domain/messages';
import { aboutThread, athletesOnTeam, currentTeam } from '../domain/teams';
import type {
  Athlete,
  Availability,
  Exercise,
  ExerciseLog,
  Message,
  MessageThread,
  MilestoneTest,
  Result,
  Team,
  TestResult,
} from '../domain/types';
import {
  validateAppointment,
  validateAssignment,
  validateMessage,
  validatePrescription,
  validateTeam,
  type AppointmentInput,
  type AssignmentInput,
  type PrescriptionInput,
  type TeamInput,
  type ValidAppointment,
} from '../domain/validation';
import type { Profile } from './profile';
import { reducer, type Action } from './reducer';
import * as remote from './remote';
import { createInitialState, type AppState } from './state';

const OFFLINE_ERROR = 'Nothing was recorded. Check your connection and try again.';

/** How often to fetch what other people changed. */
const REFRESH_MS = 30_000;

// Which team you were last looking at, remembered on this device.
const teamKey = (userId: string) => `comeback.team.${userId}`;

function savedTeamId(userId: string): string | null {
  // Storage can be blocked (private windows, some settings), so never let it crash the app.
  try {
    return localStorage.getItem(teamKey(userId));
  } catch {
    return null;
  }
}

function saveTeamId(userId: string, teamId: string) {
  try {
    localStorage.setItem(teamKey(userId), teamId);
  } catch {
    // Not remembered, but the choice still holds until the page reloads.
  }
}

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
  return {
    toggleOffline: () => dispatch({ type: 'setOffline', offline: !state.offline }),
    simulateReminder: () => dispatch({ type: 'simulateReminder' }),
    reload,

    /** Trainer or coach picks which of their teams to look at. */
    selectTeam(teamId: string) {
      saveTeamId(profile.id, teamId);
      dispatch({ type: 'selectTeam', teamId });
    },

    /** Trainer starts another team and lands on it, ready to share its join codes. */
    async createTeam(input: TeamInput): Promise<Result<{ id: string }>> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can create a team.' };
      const valid = validateTeam(input);
      if (!valid.ok) return valid;
      if (state.offline) return { ok: false, error: `Could not create the team. ${OFFLINE_ERROR}` };
      const saved = await remote.createTeam(valid.value);
      if (!saved.ok) return { ok: false, error: `Could not create the team. ${saved.error}` };
      saveTeamId(profile.id, saved.value.id);
      dispatch({ type: 'selectTeam', teamId: saved.value.id });
      await reload(); // brings in the new team
      return saved;
    },

    async logExercise(
      athleteId: string,
      exerciseId: string,
      pain: number | undefined,
    ): Promise<Result<{ log: ExerciseLog }>> {
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
      return { ok: true, value: { log } };
    },

    async recordResult(
      athleteId: string,
      testId: string,
      raw: string,
    ): Promise<Result<{ result: TestResult; newlyReached: boolean }>> {
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
        // A trainer can record a result for the athlete, e.g. after a retest.
        source: state.role === 'trainer' ? 'trainer' : 'athlete',
      };
      const wasReached = isGoalReached(test, state.results, athleteId);
      const saved = await remote.insertResult(result, profile.id);
      if (!saved.ok) return { ok: false, error: `Could not save your result. ${saved.error}` };
      dispatch({ type: 'addResult', result });
      return { ok: true, value: { result, newlyReached: !wasReached && parsed.value >= test.target } };
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

    /** Trainer moves the goal for one milestone test. */
    async setGoalTarget(testId: string, raw: string): Promise<Result> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can change a goal.' };
      const test = state.tests.find((t) => t.id === testId);
      if (!test) return { ok: false, error: 'Test not found.' };
      const parsed = parseResultValue(raw, `the ${test.name} goal`);
      if (!parsed.ok) return parsed;
      if (state.offline) return { ok: false, error: `Could not save the goal. ${OFFLINE_ERROR}` };
      const saved = await remote.updateGoalTarget(testId, parsed.value);
      if (!saved.ok) return saved;
      await reload();
      return saved;
    },

    /** Trainer changes one exercise's sets, reps and hold. */
    async setPrescription(planId: string, input: PrescriptionInput): Promise<Result> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can change the plan.' };
      const valid = validatePrescription(input);
      if (!valid.ok) return valid;
      if (state.offline) return { ok: false, error: `Could not save the plan. ${OFFLINE_ERROR}` };
      const saved = await remote.updatePlanExercise(planId, valid.value);
      if (!saved.ok) return saved;
      await reload();
      return saved;
    },

    /** Trainer takes one exercise off the athlete's daily list. Its past logs stay. */
    async removeExercise(planId: string): Promise<Result> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can change the plan.' };
      if (state.offline) return { ok: false, error: `Could not save the plan. ${OFFLINE_ERROR}` };
      const saved = await remote.updatePlanExercise(planId, { active: false });
      if (!saved.ok) return saved;
      await reload();
      return saved;
    },

    /**
     * Sets a profile photo, or removes it with null. Without an athlete id
     * it's the signed-in person's own; a trainer can pass one of their athletes.
     */
    async setPhoto(photo: Blob | null, athleteId?: string): Promise<Result> {
      const ownerId = athleteId ?? profile.id;
      const isOwn = ownerId === profile.id;
      if (!isOwn && state.role !== 'trainer') return { ok: false, error: 'Only the trainer can change an athlete’s photo.' };
      if (state.offline) return { ok: false, error: `Could not save the photo. ${OFFLINE_ERROR}` };
      const saved = await remote.savePhoto(ownerId, photo, isOwn);
      if (!saved.ok) return { ok: false, error: `Could not save the photo. ${saved.error}` };
      await reload();
      return saved;
    },

    /** Trainer books a visit. The athlete sees it on Today and the Trainer tab. */
    async scheduleAppointment(input: AppointmentInput): Promise<Result<ValidAppointment>> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can schedule appointments.' };
      const valid = validateAppointment(input, new Date());
      if (!valid.ok) return valid;
      if (state.offline) return { ok: false, error: `Could not schedule the appointment. ${OFFLINE_ERROR}` };
      const saved = await remote.insertAppointment(valid.value, profile.id);
      if (!saved.ok) return { ok: false, error: `Could not schedule the appointment. ${saved.error}` };
      await reload(); // the new visit gets its id from the database
      return valid;
    },

    async cancelAppointment(appointmentId: string): Promise<Result> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can cancel appointments.' };
      if (state.offline) return { ok: false, error: `Could not cancel the appointment. ${OFFLINE_ERROR}` };
      const saved = await remote.cancelAppointment(appointmentId);
      if (!saved.ok) return saved;
      await reload();
      return saved;
    },

    /** Marks one of the athlete's injuries cleared; its exercises leave their list. */
    async clearInjury(caseId: string): Promise<Result> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can clear an injury.' };
      if (state.offline) return { ok: false, error: `Could not save the change. ${OFFLINE_ERROR}` };
      const saved = await remote.clearInjury(caseId);
      if (!saved.ok) return saved;
      await reload();
      return saved;
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
      if (state.role === 'coach' && !thread.startsWith('coach:') && !thread.startsWith('about:')) {
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

    /**
     * Trainer or coach opens the staff conversation about one athlete. The
     * first time, the database creates it; after that this does nothing.
     */
    async openAboutChat(teamId: string, athleteId: string): Promise<Result> {
      if (state.role === 'athlete') return { ok: false, error: 'Only trainers and coaches can open this conversation.' };
      if (state.conversations.some((c) => c.thread === aboutThread(teamId, athleteId))) return { ok: true, value: undefined };
      if (state.offline) return { ok: false, error: `Could not open the conversation. ${OFFLINE_ERROR}` };
      const opened = await remote.openAboutConversation(teamId, athleteId);
      if (!opened.ok) return opened;
      await reload(); // brings in the new conversation
      return opened;
    },

    /** Trainer's private note on an athlete's profile. Saving an empty note clears it. */
    async saveNote(athleteId: string, text: string): Promise<Result> {
      if (state.role !== 'trainer') return { ok: false, error: 'Only the trainer can keep notes on an athlete.' };
      const valid = validateNote(text);
      if (!valid.ok) return valid;
      if (state.offline) return { ok: false, error: `Could not save your note. ${OFFLINE_ERROR}` };
      const saved = await remote.saveNote(athleteId, valid.value, profile.id);
      if (!saved.ok) return { ok: false, error: `Could not save your note. ${saved.error}` };
      dispatch({ type: 'setNote', athleteId, note: { text: valid.value, updatedAt: saved.value.updatedAt, updatedBy: profile.name } });
      return { ok: true, value: undefined };
    },

    /** Called when a conversation is on screen. Quietly does nothing offline. */
    async markRead(thread: MessageThread): Promise<Result> {
      const unread = unreadIn(state.messages, thread, profile.id);
      const conversation = state.conversations.find((c) => c.thread === thread);
      if (unread === 0 || !conversation || state.offline) return { ok: true, value: undefined };
      const saved = await remote.markRead(conversation.id, profile.id);
      if (!saved.ok) return saved;
      dispatch({ type: 'markRead', thread, readerId: profile.id, readAt: saved.value.readAt });
      return { ok: true, value: undefined };
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
    return action.type === 'loaded' ? createInitialState(profile.role, action.data, savedTeamId(profile.id)) : null;
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
    if (action.type !== 'setOffline' && action.type !== 'simulateReminder' && action.type !== 'selectTeam') writes.current++;
    dispatch(action);
  }, []);

  if (!state) {
    return loadError ? (
      <div className="gate-status" role="alert">
        <p>{loadError}</p>
        <Button variant="primary" onClick={reload}>
          Try again
        </Button>
      </div>
    ) : (
      <p className="gate-status" role="status" aria-live="polite">Loading…</p>
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

/**
 * The team a trainer or coach is looking at, and its athletes. `team` is
 * undefined only if they're on no team, which AuthGate doesn't let through.
 */
export function useTeam(): { team: Team | undefined; athletes: Athlete[] } {
  const { state } = useAppStore();
  const team = currentTeam(state.teams, state.selectedTeamId);
  return { team, athletes: team ? athletesOnTeam(state.athletes, team.id) : [] };
}

/** The signed-in athlete, for the athlete screens. */
export function useSignedInAthlete(): Athlete {
  const { state, profile } = useAppStore();
  const athlete = state.athletes.find((a) => a.id === profile.id);
  if (!athlete) throw new Error('Signed-in athlete missing from data');
  return athlete;
}
