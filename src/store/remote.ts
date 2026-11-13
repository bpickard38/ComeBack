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
  AthleteNote,
  Availability,
  Exercise,
  ExerciseLog,
  InjuryRecord,
  Message,
  MessageThread,
  MilestoneTest,
  Result,
  Team,
  TestResult,
} from '../domain/types';
import { overallGoalPercent } from '../domain/goals';
import type { AthleteProgress } from '../domain/progress';
import type { RecoveryStatus } from '../domain/recovery';
import { aboutThread, coachThread } from '../domain/teams';
import type { ValidAppointment, ValidPrescription, ValidTeam } from '../domain/validation';
import type { Profile } from './profile';
import type { RemoteData } from './state';
import { supabase } from './supabase';

// Row shapes as Supabase returns them. Nested objects come from joins like
// "injuries(name)" in a select.
interface MemberRow {
  team_id: string;
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
  cleared_at: string | null;
  injuries: { name: string; body_region: string | null } | null;
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

/** Storage bucket for profile photos (see supabase/profile_photos.sql). */
const PHOTO_BUCKET = 'avatars';

const SENDER_LABEL = { athlete: 'Athlete', trainer: 'Trainer', coach: 'Coach' } as const;

export async function loadAll(profile: Profile): Promise<RemoteData> {
  if (profile.role === 'admin') return {
    teams: [], athletes: [], exercises: [], tests: [], logs: [], results: [], appointments: [], messages: [],
    conversations: [], injuryHistory: [], notes: null, recovery: null, progress: null,
    catalog: { injuries: [], exercises: [], workoutSets: {} },
  };
  const isTrainer = profile.role === 'trainer';
  const isCoach = profile.role === 'coach';
  const none = Promise.resolve({ data: [], error: null });

  const [teams, members, users, cases, plans, logs, goals, results, appointments, conversations, messages, injuries, exerciseCatalog, injurySets, summary, notes, coachRecovery, photos] =
    await Promise.all([
      // Only the teams you're on come back (row level security).
      supabase.from('teams').select('id, name, sport').order('name'),
      supabase.from('team_members').select('team_id, user_id, role, availability, expected_return, teams(name, sport)'),
      // Contact details are only shown on the trainer's player profiles.
      supabase.from('users').select(isTrainer ? 'id, name, role, email, phone' : 'id, name, role'),
      supabase.from('athlete_injuries').select('id, athlete_id, status, start_date, cleared_at, injuries(name, body_region)'),
      supabase.from('plan_exercises').select('id, athlete_injury_id, sets, reps, hold_seconds, active, exercises(name, video_url, description)'),
      supabase.from('exercise_logs').select('athlete_id, plan_exercise_id, logged_at, pain'),
      supabase.from('case_milestones').select('id, athlete_injury_id, baseline, target, milestone_tests(name, description, unit)'),
      supabase.from('test_results').select('case_milestone_id, value, recorded_at, source'),
      supabase
        .from('appointments')
        .select('id, athlete_id, starts_at, location, title, appointment_tests(case_milestone_id, note), appointment_exercises(plan_exercise_id)')
        .neq('status', 'cancelled'),
      supabase.from('conversations').select('id, kind, athlete_id, team_id'),
      supabase.from('messages').select('id, conversation_id, sender_id, body, sent_at, read_at').order('sent_at'),
      isTrainer ? supabase.from('injuries').select('id, name').order('name') : none,
      isTrainer ? supabase.from('exercises').select('id, name').order('name') : none,
      isTrainer ? supabase.from('injury_exercises').select('injury_id, exercise_id').order('position') : none,
      // Coaches can't read logs or goals; this function returns only counts.
      isCoach ? supabase.rpc('coach_weekly_summary', { p_today: dayKey(new Date()) }) : none,
      // Private trainer notes; nobody else can read the table.
      isTrainer ? supabase.from('athlete_notes').select('athlete_id, body, updated_by, updated_at') : none,
      // Coaches can't read milestones; this function returns one percentage per athlete.
      isCoach ? supabase.rpc('coach_recovery') : none,
      // Asked for on its own: before supabase/profile_photos.sql is run the
      // column doesn't exist, and that mustn't stop everything else loading.
      supabase.from('users').select('id, avatar_path'),
    ]);

  const userRows = rows<{ id: string; name: string; role: keyof typeof SENDER_LABEL; email?: string; phone?: string | null }>(users);
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
    caseId: p.athlete_injury_id,
    sets: p.sets,
    reps: p.reps,
    holdSeconds: p.hold_seconds,
    active: p.active,
  }));

  const memberRows = rows<MemberRow>(members);
  const teamList: Team[] = rows<{ id: string; name: string; sport: string | null }>(teams).map((t) => ({
    ...t,
    coachNames: memberRows
      .filter((m) => m.team_id === t.id && m.role === 'coach')
      .map((m) => userById.get(m.user_id)?.name ?? '')
      .filter(Boolean),
  }));

  // Profile photos: a path in the "avatars" storage bucket, turned into a web address.
  const photoUrl = new Map<string, string>();
  if (!photos.error) {
    for (const row of rows<{ id: string; avatar_path: string | null }>(photos)) {
      if (row.avatar_path) photoUrl.set(row.id, supabase.storage.from(PHOTO_BUCKET).getPublicUrl(row.avatar_path).data.publicUrl);
    }
  }

  // One entry per athlete, even if they're on two of your teams.
  const athletes: Athlete[] = [];
  for (const m of memberRows) {
    if (m.role !== 'athlete') continue;
    const already = athletes.find((a) => a.id === m.user_id);
    if (already) {
      already.teamIds.push(m.team_id);
      continue;
    }
    const current = activeCases.get(m.user_id) ?? [];
    athletes.push({
      id: m.user_id,
      name: userById.get(m.user_id)?.name ?? 'Athlete',
      sport: m.teams?.sport ?? m.teams?.name ?? '',
      teamIds: [m.team_id],
      photoUrl: photoUrl.get(m.user_id) ?? null,
      email: userById.get(m.user_id)?.email,
      phone: userById.get(m.user_id)?.phone,
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
  const goalRows = rows<GoalRow>(goals);
  for (const g of goalRows) {
    const athleteId = caseAthlete.get(g.athlete_injury_id);
    if (!athleteId || !activeCaseIds.has(g.athlete_injury_id)) continue;
    tests.push({
      id: g.id,
      athleteId,
      caseId: g.athlete_injury_id,
      name: g.milestone_tests?.name ?? 'Test',
      description: g.milestone_tests?.description ?? '',
      unit: g.milestone_tests?.unit ?? '',
      baseline: Number(g.baseline),
      target: Number(g.target),
    });
  }
  const testAthlete = new Map(tests.map((t) => [t.id, t.athleteId]));
  const resultRows = rows<{ case_milestone_id: string; value: number; recorded_at: string; source: 'athlete' | 'trainer' }>(results);

  // Injury history for the trainer's player profiles: every case, cleared
  // ones too, with its plan and where each milestone test ended up.
  const latestValue = new Map<string, { value: number; at: string }>();
  for (const r of resultRows) {
    const seen = latestValue.get(r.case_milestone_id);
    if (!seen || r.recorded_at >= seen.at) latestValue.set(r.case_milestone_id, { value: Number(r.value), at: r.recorded_at });
  }
  const injuryHistory: InjuryRecord[] = isTrainer
    ? caseRows.map((c) => ({
        caseId: c.id,
        athleteId: c.athlete_id,
        name: c.injuries?.name ?? 'Injury',
        bodyRegion: c.injuries?.body_region ?? null,
        startDate: c.start_date,
        clearedAt: c.cleared_at,
        exercises: planRows
          .filter((p) => p.athlete_injury_id === c.id)
          .map((p) => `${p.exercises?.name ?? 'Exercise'}: ${prescriptionText(p.sets, p.reps, p.hold_seconds)}`),
        goals: goalRows
          .filter((g) => g.athlete_injury_id === c.id)
          .map((g) => ({
            name: g.milestone_tests?.name ?? 'Test',
            unit: g.milestone_tests?.unit ?? '',
            baseline: Number(g.baseline),
            target: Number(g.target),
            latest: latestValue.get(g.id)?.value ?? null,
          })),
      }))
    : [];

  const resultList: TestResult[] = resultRows
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

  // Database conversations become the app's threads: "athlete:<athlete id>",
  // "coach:<team id>" since every team has its own coach conversation, or
  // "about:<team id>:<athlete id>" for staff talking about one athlete.
  const threadOf = new Map<string, MessageThread>();
  const conversationList: RemoteData['conversations'] = [];
  const conversationRows = rows<{ id: string; kind: string; athlete_id: string | null; team_id: string | null }>(conversations);
  // A coach conversation from before conversations had a team (live_data.sql)
  // counts as the first team's, unless that team already has its own.
  conversationRows.sort((a, b) => Number(a.team_id === null) - Number(b.team_id === null));
  for (const c of conversationRows) {
    const thread: MessageThread =
      c.kind === 'coach_trainer'
        ? coachThread(c.team_id ?? teamList[0]?.id ?? '')
        : c.kind === 'coach_athlete'
          ? aboutThread(c.team_id ?? '', c.athlete_id ?? '')
          : `athlete:${c.athlete_id}`;
    if (c.kind === 'coach_trainer' && c.team_id === null && conversationList.some((x) => x.thread === thread)) continue;
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

  // Recovery progress. Trainers and athletes can read the milestones, so
  // it's worked out here; a coach gets the same percentage from the database.
  // Before supabase/recovery_pace.sql is run the coach's bar says so.
  const recovery: Record<string, RecoveryStatus> | null = isCoach
    ? coachRecovery.error
      ? null
      : Object.fromEntries(
          // cleared_on is missing until the latest recovery_pace.sql is run.
          rows<{ athlete_id: string; started: string | null; percent: number | null; cleared_on?: string | null }>(coachRecovery).map((r) => [
            r.athlete_id,
            { percent: r.percent === null ? null : Number(r.percent), started: r.started, clearedOn: r.cleared_on ?? null },
          ]),
        )
    : Object.fromEntries(
        athletes.map((a) => {
          const mine = tests.filter((t) => t.athleteId === a.id);
          return [
            a.id,
            {
              percent: mine.length ? overallGoalPercent(mine, resultList, a.id) : null,
              // Cases are sorted oldest first.
              started: activeCases.get(a.id)?.[0]?.start_date ?? null,
            },
          ];
        }),
      );

  // Before supabase/athlete_notes.sql is run the table doesn't exist; the
  // profile then says so instead of offering a box that can't save.
  const noteMap: Record<string, AthleteNote> | null =
    !isTrainer || notes.error
      ? null
      : Object.fromEntries(
          rows<{ athlete_id: string; body: string; updated_by: string | null; updated_at: string }>(notes).map((n) => [
            n.athlete_id,
            { text: n.body, updatedAt: n.updated_at, updatedBy: n.updated_by ? userById.get(n.updated_by)?.name : undefined },
          ]),
        );

  return {
    teams: teamList,
    athletes,
    exercises,
    tests,
    logs: logList,
    results: resultList,
    appointments: appointmentList,
    messages: messageList,
    conversations: conversationList,
    injuryHistory,
    notes: noteMap,
    recovery,
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

/** A trainer starts another team. The database makes its join codes and coach conversation. */
export async function createTeam(team: ValidTeam): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase.rpc('create_team', { p_name: team.name, p_sport: team.sport, p_school: team.school });
  return error ? { ok: false, error: error.message } : { ok: true, value: { id: data as string } };
}

/**
 * Finds or starts the staff conversation about one athlete and makes sure the
 * team's trainers and coaches are in it (see supabase/coach_athlete_chat.sql).
 */
export async function openAboutConversation(teamId: string, athleteId: string): Promise<Result> {
  const { error } = await supabase.rpc('coach_athlete_conversation', { p_team: teamId, p_athlete: athleteId });
  return error ? { ok: false, error: error.message } : { ok: true, value: undefined };
}

/** Saves the trainer's note on an athlete, replacing the last one. */
export async function saveNote(athleteId: string, text: string, trainerId: string): Promise<Result<{ updatedAt: string }>> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('athlete_notes')
    .upsert({ athlete_id: athleteId, body: text, updated_by: trainerId, updated_at: updatedAt }, { onConflict: 'athlete_id' });
  return error ? { ok: false, error: error.message } : { ok: true, value: { updatedAt } };
}

/** Trainer changes where a milestone test needs to get to. */
export async function updateGoalTarget(testId: string, target: number): Promise<Result> {
  const { data, error } = await supabase.from('case_milestones').update({ target }).eq('id', testId).select('id');
  if (error) return { ok: false, error: error.message };
  // Security rules turn a forbidden update into "0 rows changed", not an error.
  if (!data?.length) return { ok: false, error: 'Only this athlete’s trainer can change their goals.' };
  return { ok: true, value: undefined };
}

/** Trainer changes one exercise's sets, reps and hold, or takes it off the plan (active: false). */
export async function updatePlanExercise(planId: string, change: Partial<ValidPrescription> & { active?: boolean }): Promise<Result> {
  const { data, error } = await supabase
    .from('plan_exercises')
    .update({
      ...(change.sets !== undefined && { sets: change.sets }),
      ...(change.reps !== undefined && { reps: change.reps }),
      ...(change.holdSeconds !== undefined && { hold_seconds: change.holdSeconds }),
      ...(change.active !== undefined && { active: change.active }),
    })
    .eq('id', planId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'Only this athlete’s trainer can change their plan.' };
  return { ok: true, value: undefined };
}

/**
 * Saves someone's profile photo: your own, or (as their trainer) an
 * athlete's. Each upload gets a new file name so browsers don't keep showing
 * the old picture; the last one is removed. Pass null to take the photo down.
 */
export async function savePhoto(ownerId: string, photo: Blob | null, isOwn: boolean): Promise<Result> {
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  const previous = await supabase.from('users').select('avatar_path').eq('id', ownerId).maybeSingle();
  if (previous.error) return { ok: false, error: PHOTOS_NOT_SET_UP };

  let path: string | null = null;
  if (photo) {
    path = `${ownerId}/${Date.now()}.jpg`;
    const uploaded = await bucket.upload(path, photo, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (uploaded.error) return { ok: false, error: uploaded.error.message };
  }

  // You may edit your own row; a trainer goes through a database function
  // that checks they're this athlete's trainer.
  const { error } = isOwn
    ? await supabase.from('users').update({ avatar_path: path }).eq('id', ownerId)
    : await supabase.rpc('set_athlete_photo', { p_athlete: ownerId, p_path: path });
  if (error) {
    if (path) await bucket.remove([path]);
    return { ok: false, error: isOwn ? error.message : `${error.message} If this keeps happening, the profile photos script needs running again.` };
  }
  if (previous.data?.avatar_path) await bucket.remove([previous.data.avatar_path]);
  return { ok: true, value: undefined };
}

const PHOTOS_NOT_SET_UP = 'Profile photos aren’t set up yet. Ask whoever set up the database to run the profile photos script.';

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

/**
 * Books a visit, then attaches the milestones and exercises to focus on.
 * If attaching fails, the visit is removed again so nothing is half-saved.
 */
export async function insertAppointment(visit: ValidAppointment, trainerId: string): Promise<Result> {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      athlete_id: visit.athleteId,
      trainer_id: trainerId,
      title: visit.title,
      starts_at: visit.startsAt,
      location: visit.location || null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  const [tests, exercises] = await Promise.all([
    visit.testIds.length
      ? supabase.from('appointment_tests').insert(visit.testIds.map((id) => ({ appointment_id: data.id, case_milestone_id: id })))
      : Promise.resolve({ error: null }),
    visit.exerciseIds.length
      ? supabase
          .from('appointment_exercises')
          .insert(visit.exerciseIds.map((id) => ({ appointment_id: data.id, plan_exercise_id: id })))
      : Promise.resolve({ error: null }),
  ]);
  const attachError = tests.error ?? exercises.error;
  if (attachError) {
    await supabase.from('appointments').delete().eq('id', data.id);
    return { ok: false, error: attachError.message };
  }
  return { ok: true, value: undefined };
}

/** Cancels rather than deletes, so the visit stays in the record. */
export async function cancelAppointment(appointmentId: string): Promise<Result> {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  // Security rules turn a forbidden update into "0 rows changed", not an error.
  if (!data?.length) return { ok: false, error: 'Only this athlete’s trainer can cancel the appointment.' };
  return { ok: true, value: undefined };
}
