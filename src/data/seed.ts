/*
  Sample data copied from reference/prototype.dc.html, now used only by the
  tests in src/domain (the app loads real data from Supabase; the demo
  version of this lives in supabase/demo_data.sql). All names and numbers
  are made up. Dates are built relative to "now" so the demo always looks
  current; the prototype's Mon/Tue/Wed become two days ago, yesterday and today.
*/
import { addDays, dayKey } from '../domain/dates';
import type {
  Appointment,
  Athlete,
  Exercise,
  ExerciseLog,
  Message,
  MilestoneTest,
  TestResult,
} from '../domain/types';

/** The athlete the sample results belong to (Maya). */
export const SIGNED_IN_ATHLETE_ID = 'a1';

export const INJURIES = [
  'Ankle sprain',
  'ACL reconstruction',
  'Hamstring strain',
  'Shoulder impingement',
  'Patellar tendinopathy',
];

const ex = (id: string, name: string, prescription: string): Exercise => ({
  id,
  name,
  prescription,
  videoUrl: null,
});

export const EXERCISES: Exercise[] = [
  ex('ankle-alphabet', 'Ankle alphabet', '2 rounds, A to Z'),
  ex('calf-raise', 'Double-leg calf raise', '3 sets of 15'),
  ex('band-eversion', 'Banded ankle eversion', '3 sets of 12'),
  ex('single-leg-balance', 'Single-leg balance', '3 sets of 30 sec'),
  ex('heel-slides', 'Heel slides', '3 sets of 15'),
  ex('quad-sets', 'Quad sets', '3 sets of 10, 5 sec hold'),
  ex('straight-leg-raise', 'Straight leg raise', '3 sets of 12'),
  ex('mini-squat', 'Mini squat', '3 sets of 10'),
  ex('band-external-rotation', 'Band external rotation', '3 sets of 12'),
  ex('scap-squeeze', 'Scapular squeeze', '3 sets of 15'),
  ex('wall-slide', 'Wall slide', '3 sets of 10'),
  ex('glute-bridge', 'Glute bridge', '3 sets of 12'),
  ex('hamstring-curl-slide', 'Slider hamstring curl', '3 sets of 8'),
  ex('bird-dog', 'Bird dog', '3 sets of 10 per side'),
];

export const TESTS: MilestoneTest[] = [
  { id: 'balance', athleteId: SIGNED_IN_ATHLETE_ID, name: 'One-leg balance', description: 'How long you can stand on your injured leg.', unit: 'seconds', baseline: 8, target: 30 },
  { id: 'calf', athleteId: SIGNED_IN_ATHLETE_ID, name: 'One-leg heel raises', description: 'How many heel raises you can do on your injured leg.', unit: 'reps', baseline: 5, target: 25 },
  { id: 'lunge', athleteId: SIGNED_IN_ATHLETE_ID, name: 'Ankle flexibility', description: 'How far your knee reaches toward a wall with your heel down.', unit: 'cm', baseline: 6, target: 12 },
  { id: 'hop', athleteId: SIGNED_IN_ATHLETE_ID, name: 'Hop distance', description: 'How far you hop, compared with your healthy leg.', unit: '% of healthy leg', baseline: 55, target: 90 },
];

export function exerciseById(id: string): Exercise {
  const found = EXERCISES.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown exercise: ${id}`);
  return found;
}

export function testById(id: string): MilestoneTest {
  const found = TESTS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown test: ${id}`);
  return found;
}

export interface SeedData {
  athletes: Athlete[];
  logs: ExerciseLog[];
  results: TestResult[];
  appointments: Appointment[];
  messages: Message[];
}

/** A Date for `daysFromNow` days away at a given local time. */
function at(now: Date, daysFromNow: number, hours: number, minutes: number): Date {
  const d = addDays(now, daysFromNow);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function createSeed(now: Date = new Date()): SeedData {
  const plans: Record<string, string[]> = {
    a1: ['ankle-alphabet', 'calf-raise', 'band-eversion', 'single-leg-balance'],
    a2: ['heel-slides', 'quad-sets', 'straight-leg-raise', 'mini-squat'],
    a3: ['band-external-rotation', 'scap-squeeze', 'wall-slide'],
    a4: ['glute-bridge', 'hamstring-curl-slide', 'bird-dog'],
  };

  const returnIn = (days: number) => dayKey(addDays(now, days));
  const athletes: Athlete[] = [
    { id: 'a1', name: 'Maya Torres', sport: 'Soccer', injury: 'Ankle sprain', assignedExerciseIds: plans.a1, priorExerciseCount: 48, priorBestStreak: 6, availability: 'limited', expectedReturn: returnIn(14) },
    { id: 'a2', name: 'Jordan Reyes', sport: 'Basketball', injury: 'ACL reconstruction', assignedExerciseIds: plans.a2, priorExerciseCount: 30, priorBestStreak: 4, availability: 'out', expectedReturn: returnIn(75) },
    { id: 'a3', name: 'Devon Clarke', sport: 'Volleyball', injury: 'Shoulder impingement', assignedExerciseIds: plans.a3, priorExerciseCount: 12, priorBestStreak: 2, availability: 'limited', expectedReturn: returnIn(10) },
    { id: 'a4', name: 'Priya Nair', sport: 'Track', injury: 'Hamstring strain', assignedExerciseIds: plans.a4, priorExerciseCount: 70, priorBestStreak: 9, availability: 'cleared', expectedReturn: null },
  ];

  // How many exercises each athlete finished [two days ago, yesterday, today].
  const perDay: Record<string, number[]> = {
    a1: [4, 4, 1],
    a2: [4, 4, 2],
    a3: [3, 1, 0],
    a4: [3, 3, 3],
  };
  // Pain each athlete reported on those days (0 to 10). Devon's 6 yesterday gets flagged.
  const painPerDay: Record<string, number[]> = {
    a1: [2, 1, 1],
    a2: [3, 3, 2],
    a3: [4, 6, 0],
    a4: [0, 1, 0],
  };
  const logTimes: Array<[number, number]> = [[18, 10], [17, 55], [8, 20]];

  const logs: ExerciseLog[] = [];
  for (const a of athletes) {
    perDay[a.id].forEach((count, i) => {
      const [h, m] = logTimes[i];
      let when = at(now, i - 2, h, m);
      if (when > now) when = now; // never seed a log in the future
      for (const exerciseId of a.assignedExerciseIds.slice(0, count)) {
        logs.push({ athleteId: a.id, exerciseId, loggedAt: when.toISOString(), pain: painPerDay[a.id][i] });
      }
    });
  }

  // Maya's weekly retests: five weeks of history ending this week.
  const history: Record<string, number[]> = {
    balance: [8, 11, 15, 19, 22],
    calf: [5, 7, 10, 12, 14],
    lunge: [6, 7, 8, 9, 9],
    hop: [55, 60, 66, 70, 72],
  };
  const results: TestResult[] = [];
  for (const [testId, values] of Object.entries(history)) {
    values.forEach((value, week) => {
      let recordedAt = at(now, (week - (values.length - 1)) * 7, 15, 30);
      // A future timestamp would outrank results the athlete enters today.
      if (recordedAt > now) recordedAt = now;
      results.push({ athleteId: SIGNED_IN_ATHLETE_ID, testId, value, recordedAt: recordedAt.toISOString(), source: 'athlete' });
    });
  }

  const appointments: Appointment[] = [
    { id: 'ap1', athleteId: 'a1', startsAt: at(now, 2, 15, 30).toISOString(), location: 'Athletic training room', title: 'Weekly check-in', testIds: ['balance'], testNotes: { balance: 'Retest: aim for 25 sec' }, exerciseIds: ['single-leg-balance', 'band-eversion'] },
    { id: 'ap2', athleteId: 'a1', startsAt: at(now, 7, 15, 30).toISOString(), location: 'Athletic training room', title: 'Strength and hop retest', testIds: ['calf', 'hop'], testNotes: { calf: 'Retest: aim for 18 reps', hop: 'Retest: aim for 78%' }, exerciseIds: ['calf-raise', 'band-eversion'] },
    { id: 'ap3', athleteId: 'a1', startsAt: at(now, 14, 15, 30).toISOString(), location: 'Athletic training room', title: 'Return-to-play review', testIds: ['balance', 'calf', 'lunge', 'hop'], testNotes: { balance: 'Target 30 sec', calf: 'Target 25 reps', lunge: 'Target 12 cm', hop: 'Target 90%' }, exerciseIds: ['ankle-alphabet', 'calf-raise', 'band-eversion', 'single-leg-balance'] },
  ];

  // Devon wrote to the trainer after yesterday's session; the roster flags it.
  let devonWrote = at(now, -1, 18, 30);
  if (devonWrote > now) devonWrote = now;
  const messages: Message[] = [
    { id: 'm1', thread: 'athlete:a3', from: 'Athlete', text: 'My shoulder ached after wall slides yesterday. Should I keep doing them?', sentAt: devonWrote.toISOString() },
  ];

  return { athletes, logs, results, appointments, messages };
}
