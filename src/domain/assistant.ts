/*
  The trainer's AI assistant, app side.

  The plan types and rules live with the server function
  (supabase/functions/trainer-assistant/plan.ts) because the server enforces
  them; they're re-exported here so screens import from src/domain as usual.
  What's added here is the conversation as the screen keeps it.
*/
import type { Proposal, VisitProposal } from '../../supabase/functions/trainer-assistant/plan';

export type { Proposal, ProposedExercise, VisitAvailability, VisitProposal, VisitResult } from '../../supabase/functions/trainer-assistant/plan';
export { newItems, savedSummary } from '../../supabase/functions/trainer-assistant/plan';

/** What happened to a card. 'replaced' means a newer card was shown instead. */
export type PlanStatus = 'pending' | 'saved' | 'cancelled' | 'replaced';

/** One bubble in the assistant conversation. */
export interface AssistantTurn {
  id: number;
  from: 'trainer' | 'assistant';
  text: string;
  /** A plan the assistant showed with this message, and what became of it. */
  proposal?: Proposal;
  /** Or a visit card (Record a visit). A turn has at most one card. */
  visit?: VisitProposal;
  status?: PlanStatus;
}

/** What the assistant sends back for one message. */
export interface AssistantAnswer {
  reply: string;
  proposal: Proposal | null;
  /** Older servers don't send this; treat missing as null. */
  visit?: VisitProposal | null;
}

/** A tutorial video the trainer can pick for a new exercise (checked to exist and play in the app). */
export interface VideoOption {
  url: string;
  title: string;
  channel: string;
  thumbnail: string | null;
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
    const status = STATUS_WORDS[turn.status ?? 'pending'];
    if (turn.visit) {
      const v = turn.visit;
      const visit = {
        athlete: v.athlete,
        summary: v.summary,
        pain: v.pain,
        done_today: v.doneToday,
        test_results: v.results.map((r) => ({ goal_id: r.goalId, name: r.name, value: r.value })),
        availability: v.availability,
        plan_changes: v.plan && planRecord(v.plan),
      };
      return { role: 'assistant', content: `${turn.text}\n[Visit shown to trainer (${status}): ${JSON.stringify(visit)}]` };
    }
    if (!turn.proposal) return { role: 'assistant', content: turn.text };
    const record = `[Plan shown to trainer (${status}): ${JSON.stringify(planRecord(turn.proposal))}]`;
    return { role: 'assistant', content: `${turn.text}\n${record}` };
  });
}

/** A plan card written out for the AI, in the same field names it proposes with. */
function planRecord(proposal: Proposal) {
  return {
    athlete: proposal.athlete,
    injury: proposal.injury && { id: proposal.injury.id, name: proposal.injury.name, body_region: proposal.injury.bodyRegion },
    exercises: proposal.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      ...(e.id === null ? { description: e.description } : {}),
      sets: e.sets,
      reps: e.reps,
      hold_seconds: e.holdSeconds,
    })),
  };
}

/** Adds the assistant's answer. A card still waiting is marked replaced when a new card arrives. */
export function withAnswer(turns: AssistantTurn[], answer: AssistantAnswer, id: number): AssistantTurn[] {
  const card = answer.proposal ?? answer.visit ?? null;
  const earlier = card ? turns.map((t) => (t.status === 'pending' ? { ...t, status: 'replaced' as const } : t)) : turns;
  const turn: AssistantTurn = { id, from: 'assistant', text: answer.reply };
  if (answer.proposal) {
    turn.proposal = answer.proposal;
    turn.status = 'pending';
  } else if (answer.visit) {
    turn.visit = answer.visit;
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
