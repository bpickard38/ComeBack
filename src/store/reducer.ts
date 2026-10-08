/*
  A reducer takes the current state and an "action" (a description of what
  happened) and returns the next state. It never changes the old state in
  place and never checks rules; the commands in AppStore.tsx do that, and
  save to the database, before dispatching. Keeping it this simple makes
  every change easy to trace.
*/
import type { Availability, ExerciseLog, Message, TestResult } from '../domain/types';
import type { AppState, RemoteData } from './state';

export type Action =
  | { type: 'loaded'; data: RemoteData }
  | { type: 'setOffline'; offline: boolean }
  | { type: 'simulateReminder' }
  | { type: 'addLog'; log: ExerciseLog }
  | { type: 'addResult'; result: TestResult }
  | { type: 'addMessage'; message: Message }
  | { type: 'setAvailability'; athleteId: string; availability: Availability; expectedReturn: string | null };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loaded':
      // Fresh data from the database; the on-screen-only settings stay.
      return { ...state, ...action.data };
    case 'setOffline':
      return { ...state, offline: action.offline };
    case 'simulateReminder':
      return { ...state, reminderSimulated: true };
    case 'addLog':
      return { ...state, logs: [...state.logs, action.log] };
    case 'addResult':
      return { ...state, results: [...state.results, action.result] };
    case 'addMessage':
      return { ...state, messages: [...state.messages, action.message] };
    case 'setAvailability':
      return {
        ...state,
        athletes: state.athletes.map((a) =>
          a.id === action.athleteId
            ? { ...a, availability: action.availability, expectedReturn: action.expectedReturn }
            : a,
        ),
      };
  }
}
