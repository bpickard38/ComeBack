/*
  The Today page: who's coming in today, and who needs the
  trainer's attention. Plain functions over data the app already has, so
  they're tested (attention.test.ts) and the page just draws the result.
*/
import { dayKey } from './dates';
import { athleteThread, unreadIn } from './messages';
import { highestRecentPain, isHighPain } from './pain';
import { aboutThread } from './teams';
import type { Appointment, Athlete, ExerciseLog, Message, Visit } from './types';
import { weekCompletion, weekStatus } from './week';

/** No visit for this many days, while injured, is worth a nudge. */
export const VISIT_GAP_DAYS = 7;

export interface AttentionItem {
  athlete: Athlete;
  /** Why, in words, most urgent first. */
  reasons: string[];
}

export interface AttentionInput {
  athletes: Athlete[];
  logs: ExerciseLog[];
  messages: Message[];
  /** null when visit records aren't set up; then visit gaps aren't checked. */
  visits: Visit[] | null;
  /** The trainer's teams, so a coach asking about the athlete on any of them counts. */
  teamIds: string[];
  /** The signed-in trainer, so their own messages don't count as unread. */
  trainerId: string;
  now: Date;
}

/**
 * Athletes with something to look at: high pain lately, a message waiting,
 * a coach asking about them, behind on this week's exercises, or no visit
 * in a week while injured. The most reasons first; nobody with none.
 */
export function needsAttention({ athletes, logs, messages, visits, teamIds, trainerId, now }: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const athlete of athletes) {
    const reasons: string[] = [];
    const pain = highestRecentPain(logs, athlete.id, now);
    if (isHighPain(pain ?? undefined)) reasons.push(`Pain ${pain}/10 reported`);
    if (unreadIn(messages, athleteThread(athlete.id), trainerId) > 0) reasons.push('New message');
    if (teamIds.some((teamId) => unreadIn(messages, aboutThread(teamId, athlete.id), trainerId) > 0)) reasons.push('Coach asked about them');
    if (athlete.assignedExerciseIds.length > 0 && weekStatus(weekCompletion(athlete, logs, now)) === 'Behind') {
      reasons.push('Behind on exercises this week');
    }
    if (visits && athlete.injuries.length > 0) {
      const last = visits.find((v) => v.athleteId === athlete.id); // newest first
      const days = last ? Math.floor((now.getTime() - new Date(last.visitedAt).getTime()) / 86_400_000) : null;
      // Never visited isn't flagged: before visits were recorded, that's everyone.
      if (days !== null && days >= VISIT_GAP_DAYS) reasons.push(`No visit in ${days} days`);
    }
    if (reasons.length) items.push({ athlete, reasons });
  }
  return items.sort((a, b) => b.reasons.length - a.reasons.length || a.athlete.name.localeCompare(b.athlete.name));
}

export interface TodayVisit {
  appointment: Appointment;
  athlete: Athlete;
  /** A visit was already recorded for them today. */
  recorded: boolean;
}

/** Today's appointments for these athletes, earliest first, and whether each visit is recorded yet. */
export function todaysVisits(appointments: Appointment[], athletes: Athlete[], visits: Visit[] | null, now: Date): TodayVisit[] {
  const today = dayKey(now);
  const byId = new Map(athletes.map((a) => [a.id, a]));
  return appointments
    .filter((a) => byId.has(a.athleteId) && dayKey(new Date(a.startsAt)) === today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((appointment) => ({
      appointment,
      athlete: byId.get(appointment.athleteId)!,
      recorded: !!visits?.some((v) => v.athleteId === appointment.athleteId && dayKey(new Date(v.visitedAt)) === today),
    }));
}
