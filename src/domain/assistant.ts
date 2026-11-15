/*
  The trainer's AI assistant, app side.

  The plan types and rules live with the server function
  (supabase/functions/ai-assistant/plan.ts) because the server enforces
  them; they're re-exported here so screens import from src/domain as usual.
  What's added here is the conversation as the screen keeps it.
*/
import type { Proposal } from '../../supabase/functions/ai-assistant/plan';

export type { Proposal, ProposedExercise } from '../../supabase/functions/ai-assistant/plan';
export { newItems, savedSummary } from '../../supabase/functions/ai-assistant/plan';

/** What happened to a plan card. 'replaced' means a newer plan was shown instead. */
export type PlanStatus = 'pending' | 'saved' | 'cancelled' | 'replaced';

/** One bubble in the assistant conversation. */
export interface AssistantTurn {
  id: number;
  from: 'trainer' | 'assistant';
  text: string;
  /** A plan the assistant showed with this message, and what became of it. */
  proposal?: Proposal;
  status?: PlanStatus;
}

/** What the assistant sends back for one message. */
export interface AssistantAnswer {
  reply: string;
  proposal: Proposal | null;
}

const STATUS_WORDS: Record<PlanStatus, string> = {
  pending: 'still waiting for the trainer to confirm or cancel',
  saved: 'the trainer confirmed it and it is saved',
  cancelled: 'the trainer cancelled it; nothing was saved',
  replaced: 'replaced by a newer plan; nothing was saved',
};

/**
 * The conversation in the shape the server sends to the AI. The AI only
 * reads text, so each plan card is written out after its message, with
 * what the trainer did about it. That's how "also add bird dogs" or
 * "make it 12 reps" can refer back to a plan.
 */
export function toHistory(turns: AssistantTurn[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return turns.map((turn) => {
    if (turn.from === 'trainer') return { role: 'user', content: turn.text };
    if (!turn.proposal) return { role: 'assistant', content: turn.text };
    const plan = {
      athlete: turn.proposal.athlete,
      injury: turn.proposal.injury && { id: turn.proposal.injury.id, name: turn.proposal.injury.name, body_region: turn.proposal.injury.bodyRegion },
      exercises: turn.proposal.exercises.map((e) => ({
        id: e.id,
        name: e.name,
        ...(e.id === null ? { description: e.description } : {}),
        sets: e.sets,
        reps: e.reps,
        hold_seconds: e.holdSeconds,
      })),
    };
    const record = `[Plan shown to trainer (${STATUS_WORDS[turn.status ?? 'pending']}): ${JSON.stringify(plan)}]`;
    return { role: 'assistant', content: `${turn.text}\n${record}` };
  });
}

/** Adds the assistant's answer. A plan still waiting is marked replaced when a new plan arrives. */
export function withAnswer(turns: AssistantTurn[], answer: AssistantAnswer, id: number): AssistantTurn[] {
  const earlier = answer.proposal
    ? turns.map((t) => (t.status === 'pending' ? { ...t, status: 'replaced' as const } : t))
    : turns;
  const turn: AssistantTurn = { id, from: 'assistant', text: answer.reply };
  if (answer.proposal) {
    turn.proposal = answer.proposal;
    turn.status = 'pending';
  }
  return [...earlier, turn];
}

/** "3 sets of 12", "3 sets of 30 sec", "3 sets of 10, 5 sec hold", or '' when no numbers were given. */
export function planNumbers(sets: number | null, reps: number | null, hold: number | null): string {
  const parts: string[] = [];
  if (sets && reps) parts.push(`${sets} sets of ${reps}`);
  else if (sets && hold) parts.push(`${sets} sets of ${hold} sec`);
  else if (sets) parts.push(`${sets} sets`);
  else if (reps) parts.push(`${reps} reps`);
  if (hold && (reps || !sets)) parts.push(`${hold} sec hold`);
  return parts.join(', ');
}
