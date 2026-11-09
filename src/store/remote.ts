/*
  Reading and writing the real tables (see supabase/erd_schema.sql).

  loadAll() asks for everything at once and turns the rows into the shapes
  the screens and src/domain rules already use. It never filters by person:
  row level security in the database only returns what the signed-in user
  may see, so the same code works for athletes, coaches and trainers.
*/
import { dayKey } from '../domain/dates';
import type {
  Appointment,
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
import type { AthleteProgress } from '../domain/progress';
import type { Profile } from './profile';
import type { RemoteData } from './state';
import { supabase } from './supabase';

// Row shapes as Supabase returns them. Nested objects come from joins like
// "injuries(name)" in a select.
interface MemberRow {
  user_id: string;
  role: string;
  availability: Availability | null;
  expected_return: string | null;
  teams: { name: string; sport: string | null } | null;
}
interface CaseRow {
  id: string;
  athlete_id: string;
  status: string;
  start_date: string;
  injuries: { name: string } | null;
}
interface PlanRow {
  id: string;
  athlete_injury_id: string;
  sets: number | null;
  reps: number | null;
  hold_seconds: number | null;
  active: boolean;
  exercises: { name: string; video_url: string | null; description: string | null } | null;
}
interface GoalRow {
  id: string;
  athlete_injury_id: string;
  baseline: number;
  target: number;
  milestone_tests: { name: string; description: string | null; unit: string } | null;
}
interface AppointmentRow {
  id: string;
  athlete_id: string;
  starts_at: string;
  location: string | null;
  title: string;
  appointment_tests: Array<{ case_milestone_id: string; note: string | null }>;
  appointment_exercises: Array<{ plan_exercise_id: string }>;
}

/** Throws if any query failed, so the caller can show one error. */
function rows<T>(response: { data: unknown; error: { message: string } | null }): T[] {
  if (response.error) throw response.error;
  return (response.data ?? []) as T[];
}

/** "3 sets of 10, 5 sec hold", from the plan's numbers. */
export function prescriptionText(sets: number | null, reps: number | null, hold: number | null): string {
  if (!sets && !reps && !hold) return 'As directed by your trainer';
  const parts: string[] = [];
  if (sets && reps) parts.push(`${sets} sets of ${reps}`);
  else if (sets && hold && !reps) parts.push(`${sets} sets of ${hold} sec`);
  else if (sets) parts.push(`${sets} sets`);
  else if (reps) parts.push(`${reps} reps`);
  if (hold && reps) parts.push(`${hold} sec hold`);
  else if (hold && !sets) parts.push(`${hold} sec hold`);
  return parts.join(', ');
}

/** injury_exercises rows (already in order) to injury id -> exercise ids. */
export function groupWorkoutSets(list: Array<{ injury_id: string; exercise_id: string }>): Record<string, string[]> {
  const sets: Record<string, string[]> = {};
  for (const row of list) (sets[row.injury_id] ??= []).push(row.exercise_id);
  return sets;
}

const SENDER_LABEL = { athlete: 'Athlete', trainer: 'Trainer', coach: 'Coach' } as const;

export async function loadAll(profile: Profile): Promise<RemoteData> {
  const isTrainer = profile.role === 'trainer';
  const isCoach = profile.role === 'coach';
  const none = Promise.resolve({ data: [], error: null });

  const [members, users, cases, plans, logs, goals, results, appointments, conversations, messages, injuries, exerciseCatalog, injurySets, summary] =
    await Promise.all([
      supabase.from('team_members').select('user_id, role, availability, expected_return, teams(name, sport)'),
      supabase.from('users').select('id, name, role'),
      supabase.from('athlete_injuries').select('id, athlete_id, status, start_date, injuries(name)'),
      supabase.from('plan_exercises').select('id, athlete_injury_id, sets, reps, hold_seconds, active, exercises(name, video_url, description)'),
      supabase.from('exercise_logs').select('athlete_id, plan_exercise_id, logged_at, pain'),
      supabase.from('case_milestones').select('id, athlete_injury_id, baseline, target, milestone_tests(name, description, unit)'),
      supabase.from('test_results').select('case_milestone_id, value, recorded_at, source'),
      supabase
        .from('appointments')
        .select('id, athlete_id, starts_at, location, title, appointment_tests(case_milestone_id, note), appointment_exercises(plan_exercise_id)')
        .neq('status', 'cancelled'),
      supabase.from('conversations').select('id, kind, athlete_id'),
      supabase.from('messages').select('id, conversation_id, sender_id, body, sent_at, read_at').order('sent_at'),
      isTrainer ? supabase.from('injuries').select('id, name').order('name') : none,
      isTrainer ? supabase.from('exercises').select('id, name').order('name') : none,
      isTrainer ? supabase.from('injury_exercises').select('injury_id, exercise_id').order('position') : none,
      // Coaches can't read logs or goals; this function returns only counts.
      isCoach ? supabase.rpc('coach_weekly_summary', { p_today: dayKey(new Date()) }) : none,
    ]);

  const userRows = rows<{ id: string; name: string; role: keyof typeof SENDER_LABEL }>(users);
  const userById = new Map(userRows.map((u) => [u.id, u]));

  // Each athlete's current cases: every active one, oldest first. An athlete
  // can have several injuries at once (athlete_injuries is many-to-many).
  const caseRows = rows<CaseRow>(cases);
  const activeCases = new Map<string, CaseRow[]>();
  for (const c of [...caseRows].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    if (c.status !== 'active') continue;
    activeCases.set(c.athlete_id, [...(activeCases.get(c.athlete_id) ?? []), c]);
  }
  const activeCaseIds = new Set(caseRows.filter((c) => c.status === 'active').map((c) => c.id));
  const caseAthlete = new Map(caseRows.map((c) => [c.id, c.athlete_id]));

  const planRows = rows<PlanRow>(plans);
  const exercises: Exercise[] = planRows.map((p) => ({
    id: p.id,
    name: p.exercises?.name ?? 'Exercise',
    prescription: prescriptionText(p.sets, p.reps, p.hold_seconds),
    videoUrl: p.exercises?.video_url ?? null,
    description: p.exercises?.description ?? null,
  }));

  const athletes: Athlete[] = [];
  for (const m of rows<MemberRow>(members)) {
    if (m.role !== 'athlete' || athletes.some((a) => a.id === m.user_id)) continue;
    const current = activeCases.get(m.user_id) ?? [];
    athletes.push({
      id: m.user_id,
      name: userById.get(m.user_id)?.name ?? 'Athlete',
      sport: m.teams?.sport ?? m.teams?.name ?? '',
      injuries: current.map((c) => ({ caseId: c.id, name: c.injuries?.name ?? 'Injury' })),
      assignedExerciseIds: planRows
        .filter((p) => p.active && current.some((c) => c.id === p.athlete_injury_id))
        .map((p) => p.id),
      priorBestStreak: 0,
      availability: m.availability ?? 'cleared',
      expectedReturn: m.expected_return,
    });
  }
  athletes.sort((a, b) => a.name.localeCompare(b.name));

  // Goals only for current cases; results only for those goals.
  const tests: MilestoneTest[] = [];
  for (const g of rows<GoalRow>(goals)) {
    const athleteId = caseAthlete.get(g.athlete_injury_id);
    if (!athleteId || !activeCaseIds.has(g.athlete_injury_id)) continue;
    tests.push({
      id: g.id,
      athleteId,
      name: g.milestone_tests?.name ?? 'Test',
      description: g.milestone_tests?.description ?? '',
      unit: g.milestone_tests?.unit ?? '',
      baseline: Number(g.baseline),
      target: Number(g.target),
    });
  }
  const testAthlete = new Map(tests.map((t) => [t.id, t.athleteId]));
  const resultList: TestResult[] = rows<{ case_milestone_id: string; value: number; recorded_at: string; source: 'athlete' | 'trainer' }>(results)
    .filter((r) => testAthlete.has(r.case_milestone_id))
    .map((r) => ({
      athleteId: testAthlete.get(r.case_milestone_id)!,
      testId: r.case_milestone_id,
      value: Number(r.value),
      recordedAt: r.recorded_at,
      source: r.source,
    }));

  const logList: ExerciseLog[] = rows<{ athlete_id: string; plan_exercise_id: string; logged_at: string; pain: number | null }>(logs).map(
    (l) => ({ athleteId: l.athlete_id, exerciseId: l.plan_exercise_id, loggedAt: l.logged_at, pain: l.pain ?? undefined }),
  );

  const appointmentList: Appointment[] = rows<AppointmentRow>(appointments).map((a) => ({
    id: a.id,
    athleteId: a.athlete_id,
    startsAt: a.starts_at,
    location: a.location ?? '',
    title: a.title,
    testIds: a.appointment_tests.map((t) => t.case_milestone_id).filter((id) => testAthlete.has(id)),
    testNotes: Object.fromEntries(a.appointment_tests.filter((t) => t.note).map((t) => [t.case_milestone_id, t.note!])),
    exerciseIds: a.appointment_exercises.map((e) => e.plan_exercise_id),
  }));

  // Database conversations become the app's threads: "athlete:<id>" or "coach-trainer".
  const threadOf = new Map<string, MessageThread>();
  const conversationList: RemoteData['conversations'] = [];
  for (const c of rows<{ id: string; kind: string; athlete_id: string | null }>(conversations)) {
    const thread: MessageThread = c.kind === 'coach_trainer' ? 'coach-trainer' : `athlete:${c.athlete_id}`;
    threadOf.set(c.id, thread);
    conversationList.push({ thread, id: c.id });
  }
  const messageList: Message[] = rows<{ id: string; conversation_id: string; sender_id: string | null; body: string; sent_at: string; read_at: string | null }>(messages)
    .filter((m) => threadOf.has(m.conversation_id))
    .map((m) => {
      const sender = m.sender_id ? userById.get(m.sender_id) : undefined;
      return {
        id: m.id,
        thread: threadOf.get(m.conversation_id)!,
        from: SENDER_LABEL[sender?.role ?? 'trainer'],
        senderId: m.sender_id ?? undefined,
        senderName: sender?.name,
        text: m.body,
        sentAt: m.sent_at,
        readAt: m.read_at ?? undefined,
      };
    });

  // Before supabase/weekly_summary.sql is run the function doesn't exist;
  // the coach screen then says so instead of showing numbers.
  const progress: AthleteProgress[] | null =
    !isCoach || summary.error
      ? null
      : rows<{ athlete_id: string; assigned: number; done_by_day: Record<string, number> | null; goals_total: number; goals_reached: number; goals_improved: number }>(summary).map((r) => ({
          athleteId: r.athlete_id,
          assigned: Number(r.assigned),
          doneByDay: r.done_by_day ?? {},
          goalsTotal: Number(r.goals_total),
          goalsReached: Number(r.goals_reached),
          goalsImproved: Number(r.goals_improved),
        }));

  return {
    athletes,
    exercises,
    tests,
    logs: logList,
    results: resultList,
    appointments: appointmentList,
    messages: messageList,
    conversations: conversationList,
    progress,
    catalog: {
      injuries: rows<{ id: string; name: string }>(injuries),
      exercises: rows<{ id: string; name: string }>(exerciseCatalog),
      // Before supabase/workout_sets.sql is run the table doesn't exist; the
      // form still works, it just doesn't pre-tick a set.
      workoutSets: injurySets.error
        ? {}
        : groupWorkoutSets(rows<{ injury_id: string; exercise_id: string }>(injurySets)),
    },
  };
}

// ---------- Writes ----------
// Each returns a Result so a screen can show the problem in a toast.

/** Postgres error code for "that would break a UNIQUE rule". */
const DUPLICATE = '23505';

export async function insertLog(log: ExerciseLog): Promise<Result> {
  const { error } = await supabase.from('exercise_logs').insert({
    plan_exercise_id: log.exerciseId,
    athlete_id: log.athleteId,
    log_date: dayKey(new Date(log.loggedAt)), // the athlete's own calendar day
    logged_at: log.loggedAt,
    pain: log.pain,
    source: 'app',
  });
  if (error?.code === DUPLICATE) return { ok: false, error: 'It is already logged today.' };
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: undefined };
}

export async function insertResult(result: TestResult, recordedBy: string): Promise<Result> {
  const { error } = await supabase.from('test_results').insert({
    case_milestone_id: result.testId,
    value: result.value,
    recorded_by: recordedBy,
    recorded_at: result.recordedAt,
    source: result.source,
  });
  return error ? { ok: false, error: error.message } : { ok: true, value: undefined };
}

export async function insertMessage(conversationId: string, senderId: string, text: string): Promise<Result<{ id: string; sentAt: string }>> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: text })
    .select('id, sent_at')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: { id: data.id, sentAt: data.sent_at } };
}

/** Marks everyone else's unread messages in a conversation as read now. */
export async function markRead(conversationId: string, readerId: string): Promise<Result<{ readAt: string }>> {
  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from('messages')
    .update({ read_at: readAt })
    .eq('conversation_id', conversationId)
    .neq('sender_id', readerId)
    .is('read_at', null);
  return error ? { ok: false, error: error.message } : { ok: true, value: { readAt } };
}

export async function updateAvailability(athleteId: string, availability: Availability, expectedReturn: string | null): Promise<Result> {
  const { data, error } = await supabase
    .from('team_members')
    .update({ availability, expected_return: expectedReturn })
    .eq('user_id', athleteId)
    .eq('role', 'athlete')
    .select('user_id');
  if (error) return { ok: false, error: error.message };
  // Security rules turn a forbidden update into "0 rows changed", not an error.
  if (!data?.length) return { ok: false, error: 'Only this athlete’s trainer can change their status.' };
  return { ok: true, value: undefined };
}

/** Trainer marks one injury (an athlete_injuries row) as cleared. */
export async function clearInjury(caseId: string): Promise<Result> {
  const { error } = await supabase.rpc('clear_injury', { p_case: caseId });
  return error ? { ok: false, error: error.message } : { ok: true, value: undefined };
}

export async function assignPlan(athleteId: string, injuryId: string, exerciseIds: string[]): Promise<Result> {
  const { error } = await supabase.rpc('assign_plan', {
    p_athlete: athleteId,
    p_injury: injuryId,
    p_exercises: exerciseIds,
  });
  return error ? { ok: false, error: error.message } : { ok: true, value: undefined };
}
