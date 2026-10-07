/*
  A reducer takes the current state and an "action" (a description of what
  happened) and returns the next state. It never changes the old state in
  place and never checks rules; the commands in AppStore.tsx do that before
  dispatching. Keeping it this simple makes every change easy to trace.
*/
import type { Availability, ExerciseLog, Message, Role, TestResult } from '../domain/types';
import type { AssignmentInput } from '../domain/validation';
import type { AppState } from './state';

export type Action =
  | { type: 'setRole'; role: Role }
  | { type: 'setOffline'; offline: boolean }
  | { type: 'simulateReminder' }
  | { type: 'reset'; state: AppState }
  | { type: 'addLog'; log: ExerciseLog }
  | { type: 'addResult'; result: TestResult }
  | { type: 'assignPlan'; assignment: AssignmentInput }
  | { type: 'addMessage'; message: Message }
  | { type: 'setAvailability'; athleteId: string; availability: Availability; expectedReturn: string | null };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setRole':
      return { ...state, role: action.role };
    case 'setOffline':
      return { ...state, offline: action.offline };
    case 'simulateReminder':
      return { ...state, reminderSimulated: true, role: 'athlete' };
    case 'reset':
      return action.state;
    case 'addLog':
      return { ...state, logs: [...state.logs, action.log] };
    case 'addResult':
      return { ...state, results: [...state.results, action.result] };
    case 'assignPlan': {
      const { athleteId, injury, exerciseIds } = action.assignment;
      return {
        ...state,
        athletes: state.athletes.map((a) =>
          a.id === athleteId ? { ...a, injury, assignedExerciseIds: [...exerciseIds] } : a,
        ),
      };
    }
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
