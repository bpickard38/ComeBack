import { describe, expect, it } from 'vitest';
import { needsAttention, todaysVisits } from './attention';
import type { Appointment, Athlete, ExerciseLog, Message, Visit } from './types';

// A Wednesday at noon, so "this week" has days behind it.
const now = new Date('2026-11-18T12:00:00');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function athlete(id: string, name: string, options: { injured?: boolean; exercises?: string[] } = {}): Athlete {
  return {
    id,
    name,
    sport: 'Soccer',
    teamIds: ['team'],
    injuries: options.injured ? [{ caseId: `${id}-case`, name: 'Ankle sprain' }] : [],
    assignedExerciseIds: options.exercises ?? [],
    priorBestStreak: 0,
    availability: options.injured ? 'limited' : 'cleared',
    expectedReturn: null,
  } as Athlete;
}

const maya = athlete('a1', 'Maya Torres', { injured: true });
const devon = athlete('a2', 'Devon Clarke', { injured: true });
const jordan = athlete('a3', 'Jordan Reyes', { injured: true, exercises: ['plan-1'] });
const priya = athlete('a4', 'Priya Nair');

const base = { athletes: [maya, devon, jordan, priya], logs: [] as ExerciseLog[], messages: [] as Message[], visits: [] as Visit[] | null, teamId: 'team', trainerId: 't1', now };

describe('needsAttention', () => {
  it('flags recent high pain', () => {
    const logs: ExerciseLog[] = [{ athleteId: 'a1', exerciseId: 'x', loggedAt: daysAgo(1), pain: 7 }];
    const items = needsAttention({ ...base, logs });
    expect(items.find((i) => i.athlete.id === 'a1')?.reasons).toEqual(['Pain 7/10 reported']);
  });

  it('flags an unread message from the athlete and from the coach about them', () => {
    const messages: Message[] = [
      { id: 'm1', thread: 'athlete:a2', from: 'Athlete', senderId: 'a2', text: 'Hi', sentAt: daysAgo(0) },
      { id: 'm2', thread: 'about:team:a2', from: 'Coach', senderId: 'c1', text: 'Is he ok?', sentAt: daysAgo(0) },
    ];
    expect(needsAttention({ ...base, messages }).find((i) => i.athlete.id === 'a2')?.reasons).toEqual(['New message', 'Coach asked about them']);
  });

  it("ignores the trainer's own messages", () => {
    const messages: Message[] = [{ id: 'm1', thread: 'athlete:a2', from: 'Trainer', senderId: 't1', text: 'Hi', sentAt: daysAgo(0) }];
    expect(needsAttention({ ...base, messages }).some((i) => i.athlete.id === 'a2')).toBe(false);
  });

  it('flags an athlete behind on this week, but not one with no plan', () => {
    const items = needsAttention(base);
    expect(items.find((i) => i.athlete.id === 'a3')?.reasons).toContain('Behind on exercises this week');
    expect(items.some((i) => i.athlete.id === 'a1')).toBe(false);
  });

  it('flags a long gap since the last visit, but not "never", and not healthy athletes', () => {
    const visits: Visit[] = [
      { id: 'v1', athleteId: 'a1', visitedAt: daysAgo(9), summary: 'x', pain: null, doneToday: null },
      { id: 'v2', athleteId: 'a4', visitedAt: daysAgo(30), summary: 'x', pain: null, doneToday: null },
    ];
    const items = needsAttention({ ...base, visits });
    expect(items.find((i) => i.athlete.id === 'a1')?.reasons).toEqual(['No visit in 9 days']);
    expect(items.some((i) => i.athlete.id === 'a2')).toBe(false); // never visited
    expect(items.some((i) => i.athlete.id === 'a4')).toBe(false); // healthy
  });

  it('puts the athlete with the most reasons first', () => {
    const logs: ExerciseLog[] = [{ athleteId: 'a3', exerciseId: 'x', loggedAt: daysAgo(1), pain: 8 }];
    const items = needsAttention({ ...base, logs });
    expect(items[0].athlete.id).toBe('a3');
    expect(items[0].reasons.length).toBe(2);
  });
});

describe('todaysVisits', () => {
  const visit = (id: string, athleteId: string, startsAt: string): Appointment => ({
    id,
    athleteId,
    startsAt,
    location: 'Training room',
    title: 'Check-in',
    testIds: [],
    exerciseIds: [],
  });

  it("lists today's appointments in time order and marks recorded visits", () => {
    const appointments = [
      visit('late', 'a2', '2026-11-18T16:00:00'),
      visit('early', 'a1', '2026-11-18T09:00:00'),
      visit('tomorrow', 'a3', '2026-11-19T09:00:00'),
      visit('not-mine', 'someone-else', '2026-11-18T10:00:00'),
    ];
    const visits: Visit[] = [{ id: 'v', athleteId: 'a1', visitedAt: '2026-11-18T09:30:00', summary: 'x', pain: null, doneToday: null }];
    const today = todaysVisits(appointments, [maya, devon, jordan], visits, now);
    expect(today.map((t) => [t.appointment.id, t.recorded])).toEqual([
      ['early', true],
      ['late', false],
    ]);
  });
});
