import type { Result } from './types';

export interface AssignmentInput {
  athleteId: string;
  injury: string;
  exerciseIds: string[];
}

export function validateAssignment(input: AssignmentInput): Result<AssignmentInput> {
  if (!input.athleteId || !input.injury || input.exerciseIds.length === 0) {
    return { ok: false, error: 'Pick an athlete, an injury and at least one exercise.' };
  }
  return { ok: true, value: input };
}

export function validateMessage(text: string): Result<string> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Write a message first.' };
  return { ok: true, value: trimmed };
}
