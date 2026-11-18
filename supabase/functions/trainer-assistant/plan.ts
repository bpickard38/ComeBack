/*
  The rules for an assistant plan, as plain functions with no imports.

  This file is shared: the trainer-assistant function (index.ts, runs on
  Supabase) uses it to check what the AI asked for, and the app
  (src/domain/assistant.ts) uses the same types to show the plan. Because
  it has no imports and touches no network, Vitest can test it
  (src/domain/assistant.test.ts).

  The flow: the AI never writes to the database. It hands over a rough
  plan (RawPlan), buildProposal() checks every part against what's really
  in the database, and the trainer sees the result (Proposal) with a
  Confirm button. Only Confirm saves, and the saved plan is checked again
  with sanitizeProposal() because it comes back from the browser.
*/

export type PlanResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ProposedExercise {
  /** The exercises row, or null for one that will be added to the catalog. */
  id: string | null;
  name: string;
  /** One-line how-to. Only used when the exercise is new. */
  description: string | null;
  /** Tutorial video. For a new exercise it's the one found on YouTube. */
  videoUrl: string | null;
  videoTitle: string | null;
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
}

/** An exercise to take off one of the athlete's active injury plans. */
export interface RemovedExercise {
  exerciseId: string;
  name: string;
  injuryId: string;
  injuryName: string;
}

export interface Proposal {
  /** Who gets the plan. null when the trainer is only adding to the catalogs. */
  athlete: { id: string; name: string } | null;
  /** id is null for an injury that will be added to the catalog. */
  injury: { id: string | null; name: string; bodyRegion: string | null } | null;
  exercises: ProposedExercise[];
  /** Exercises to take off the athlete's plans. Missing on older cards: treat as none. */
  removed?: RemovedExercise[];
}

/** What the AI sends in its propose_plan tool call. Nothing in it is trusted. */
export interface RawPlan {
  athlete_id?: unknown;
  remove?: Array<{ exercise_id?: unknown; injury_id?: unknown }> | null;
  injury?: { id?: unknown; name?: unknown; body_region?: unknown } | null;
  exercises?: Array<{
    id?: unknown;
    name?: unknown;
    description?: unknown;
    video_id?: unknown;
    sets?: unknown;
    reps?: unknown;
    hold_seconds?: unknown;
  }>;
}

/** What's really in the database, to check a RawPlan against. */
export interface PlanContext {
  athletes: Array<{ id: string; name: string }>;
  injuries: Array<{ id: string; name: string; body_region: string | null }>;
  exercises: Array<{ id: string; name: string; video_url: string | null }>;
  /** Videos the YouTube search returned during this request, by video id. */
  videos: Map<string, { title: string }>;
  /** Each athlete's active injuries and the exercises on them now, for removals. */
  plans?: Array<{ athleteId: string; injuryId: string; injuryName: string; exercises: Array<{ id: string; name: string }> }>;
}

export const MAX_NAME = 80;
export const MAX_DESCRIPTION = 300;
export const MAX_EXERCISES = 12;
export const MAX_REMOVED = 30;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** "  Calf  Raise " and "calf raise" are the same catalog entry. */
export function sameName(a: string, b: string): boolean {
  const tidy = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return tidy(a) === tidy(b);
}

/** Trimmed, single-spaced text, or '' if it isn't text. */
function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/** A whole number from 1 to 999, otherwise null (not used). */
export function cleanCount(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 999 ? n : null;
}

/** The plain watch link for a YouTube video id, or null if the id is malformed. */
export function youtubeWatchUrl(videoId: unknown): string | null {
  return typeof videoId === 'string' && YOUTUBE_ID.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

/** The video id from a YouTube link, or null. Mirrors src/domain/video.ts. */
export function youtubeIdFromUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = parsed.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
    else id = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/**
 * Checks the AI's rough plan against the database and turns it into the
 * plan the trainer confirms. The error text goes back to the AI so it can
 * fix its request, so it says what to do next.
 */
export function buildProposal(raw: RawPlan, ctx: PlanContext): PlanResult<Proposal> {
  // ----- Athlete -----
  let athlete: Proposal['athlete'] = null;
  if (raw.athlete_id != null && raw.athlete_id !== '') {
    const found = ctx.athletes.find((a) => a.id === raw.athlete_id);
    if (!found) return { ok: false, error: 'athlete_id is not one of this trainer\'s athletes. Use an id from search_athletes.' };
    athlete = { id: found.id, name: found.name };
  }

  // ----- Injury -----
  let injury: Proposal['injury'] = null;
  if (raw.injury) {
    const byId = raw.injury.id ? ctx.injuries.find((i) => i.id === raw.injury!.id) : undefined;
    if (raw.injury.id && !byId) return { ok: false, error: 'injury.id is not in the injuries catalog. Use an id from search_injuries, or leave id out and give a name to add a new injury.' };
    const name = cleanText(raw.injury.name);
    // A "new" injury with the name of an existing one is the existing one.
    const existing = byId ?? ctx.injuries.find((i) => sameName(i.name, name));
    if (existing) injury = { id: existing.id, name: existing.name, bodyRegion: existing.body_region };
    else if (!name) return { ok: false, error: 'injury needs an id or a name.' };
    else if (name.length > MAX_NAME) return { ok: false, error: `Injury name must be ${MAX_NAME} characters or fewer.` };
    else injury = { id: null, name, bodyRegion: cleanText(raw.injury.body_region).slice(0, MAX_NAME) || null };
  }

  // ----- Exercises -----
  const list = Array.isArray(raw.exercises) ? raw.exercises : [];
  if (list.length > MAX_EXERCISES) return { ok: false, error: `A plan can have at most ${MAX_EXERCISES} exercises.` };
  const exercises: ProposedExercise[] = [];
  for (const item of list) {
    const byId = item.id ? ctx.exercises.find((e) => e.id === item.id) : undefined;
    if (item.id && !byId) return { ok: false, error: `Exercise id ${String(item.id)} is not in the exercise catalog. Use an id from search_exercises, or leave id out and give a name and description to add a new exercise.` };
    const name = cleanText(item.name);
    const existing = byId ?? ctx.exercises.find((e) => sameName(e.name, name));
    const numbers = { sets: cleanCount(item.sets), reps: cleanCount(item.reps), holdSeconds: cleanCount(item.hold_seconds) };

    let next: ProposedExercise;
    if (existing) {
      next = { id: existing.id, name: existing.name, description: null, videoUrl: existing.video_url, videoTitle: null, ...numbers };
    } else {
      if (!name) return { ok: false, error: 'Each exercise needs an id or a name.' };
      if (name.length > MAX_NAME) return { ok: false, error: `Exercise name must be ${MAX_NAME} characters or fewer.` };
      const description = cleanText(item.description);
      if (!description) return { ok: false, error: `New exercise "${name}" needs a one-sentence description of how to do it.` };
      // Only a video the search really returned is kept, so a made-up link can't get in.
      const video = typeof item.video_id === 'string' ? ctx.videos.get(item.video_id) : undefined;
      next = {
        id: null,
        name,
        description: description.slice(0, MAX_DESCRIPTION),
        videoUrl: video ? youtubeWatchUrl(item.video_id) : null,
        videoTitle: video?.title ?? null,
        ...numbers,
      };
    }
    // Listed twice: keep the first.
    if (!exercises.some((e) => (e.id && e.id === next.id) || sameName(e.name, next.name))) exercises.push(next);
  }

  // ----- Removals -----
  const removeList = Array.isArray(raw.remove) ? raw.remove : [];
  if (removeList.length > MAX_REMOVED) return { ok: false, error: `A plan can remove at most ${MAX_REMOVED} exercises at once.` };
  if (removeList.length && !athlete) return { ok: false, error: 'Removing exercises needs athlete_id.' };
  const removed: RemovedExercise[] = [];
  for (const item of removeList) {
    const theirPlans = (ctx.plans ?? []).filter((p) => p.athleteId === athlete!.id);
    const onPlans = theirPlans.filter(
      (p) => p.exercises.some((e) => e.id === item?.exercise_id) && (item?.injury_id == null || item.injury_id === '' || p.injuryId === item.injury_id),
    );
    if (onPlans.length === 0) {
      return { ok: false, error: `Exercise ${String(item?.exercise_id)} is not on ${athlete!.name}'s current plan${item?.injury_id ? ' for that injury' : ''}. Only remove exercises listed under that athlete's injuries, by exercise id.` };
    }
    // No injury given and it's on more than one plan: it comes off all of them.
    for (const p of onPlans) {
      const ex = p.exercises.find((e) => e.id === item.exercise_id)!;
      if (!removed.some((r) => r.exerciseId === ex.id && r.injuryId === p.injuryId)) {
        removed.push({ exerciseId: ex.id, name: ex.name, injuryId: p.injuryId, injuryName: p.injuryName });
      }
    }
  }
  if (removed.some((r) => injury?.id === r.injuryId && exercises.some((e) => e.id === r.exerciseId))) {
    return { ok: false, error: 'The same exercise is both added and removed on one injury. Keep it in one list only.' };
  }

  // ----- Does it add up to something that can be saved? -----
  if (athlete) {
    if (exercises.length > 0 && !injury) return { ok: false, error: 'Assigning to an athlete needs an injury.' };
    if (exercises.length === 0 && removed.length === 0) return { ok: false, error: 'Assigning to an athlete needs at least one exercise to add or remove.' };
    if (exercises.length === 0) injury = null;
  } else {
    const addsSomething = injury?.id === null || exercises.some((e) => e.id === null);
    if (!addsSomething) return { ok: false, error: 'Nothing to save: no athlete was given and every injury and exercise is already in the catalog. Ask the trainer which athlete this is for.' };
  }
  return { ok: true, value: { athlete, injury, exercises, ...(removed.length ? { removed } : {}) } };
}

/**
 * Re-checks a plan that came back from the browser when the trainer pressed
 * Confirm. Shapes, lengths and the video link are checked here; whether the
 * ids exist and whether this trainer may assign to this athlete is checked
 * by the database when saving.
 */
export function sanitizeProposal(input: unknown): PlanResult<Proposal> {
  const bad: PlanResult<Proposal> = { ok: false, error: 'That plan can\'t be read. Ask the assistant again.' };
  if (!input || typeof input !== 'object') return bad;
  const p = input as { athlete?: unknown; injury?: unknown; exercises?: unknown; removed?: unknown };
  const idOrNull = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

  let athlete: Proposal['athlete'] = null;
  if (p.athlete) {
    const a = p.athlete as { id?: unknown; name?: unknown };
    const id = idOrNull(a.id);
    if (!id) return bad;
    athlete = { id, name: cleanText(a.name).slice(0, MAX_NAME) };
  }

  let injury: Proposal['injury'] = null;
  if (p.injury) {
    const i = p.injury as { id?: unknown; name?: unknown; bodyRegion?: unknown };
    const name = cleanText(i.name);
    if (!name || name.length > MAX_NAME) return bad;
    injury = { id: idOrNull(i.id), name, bodyRegion: cleanText(i.bodyRegion).slice(0, MAX_NAME) || null };
  }

  if (!Array.isArray(p.exercises) || p.exercises.length > MAX_EXERCISES) return bad;
  const exercises: ProposedExercise[] = [];
  for (const item of p.exercises as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') return bad;
    const name = cleanText(item.name);
    if (!name || name.length > MAX_NAME) return bad;
    const videoId = youtubeIdFromUrl(item.videoUrl);
    exercises.push({
      id: idOrNull(item.id),
      name,
      description: cleanText(item.description).slice(0, MAX_DESCRIPTION) || null,
      // Rebuilt from the id, so only a real YouTube link is ever saved.
      videoUrl: youtubeWatchUrl(videoId),
      videoTitle: cleanText(item.videoTitle).slice(0, 200) || null,
      sets: cleanCount(item.sets),
      reps: cleanCount(item.reps),
      holdSeconds: cleanCount(item.holdSeconds),
    });
  }

  const rawRemoved = p.removed ?? [];
  if (!Array.isArray(rawRemoved) || rawRemoved.length > MAX_REMOVED) return bad;
  const removed: RemovedExercise[] = [];
  for (const item of rawRemoved as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object') return bad;
    const exerciseId = idOrNull(item.exerciseId);
    const injuryId = idOrNull(item.injuryId);
    if (!exerciseId || !injuryId) return bad;
    removed.push({
      exerciseId,
      injuryId,
      name: cleanText(item.name).slice(0, MAX_NAME),
      injuryName: cleanText(item.injuryName).slice(0, MAX_NAME),
    });
  }

  if (removed.length && !athlete) return bad;
  if (athlete && exercises.length > 0 && !injury) return bad;
  if (athlete && exercises.length === 0 && removed.length === 0) return bad;
  if (!athlete && injury?.id !== null && !exercises.some((e) => e.id === null)) return bad;
  return { ok: true, value: { athlete, injury, exercises, ...(removed.length ? { removed } : {}) } };
}

/** The new catalog entries a plan would add, for the card and the toast. */
export function newItems(proposal: Proposal): { injury: string | null; exercises: string[] } {
  return {
    injury: proposal.injury && proposal.injury.id === null ? proposal.injury.name : null,
    exercises: proposal.exercises.filter((e) => e.id === null).map((e) => e.name),
  };
}

/** True when a plan (or a visit's plan changes) would change anything. */
export function planHasChanges(plan: Proposal | null | undefined): boolean {
  return !!plan && (plan.exercises.length > 0 || (plan.removed?.length ?? 0) > 0);
}

/** One line for the confirmation toast, e.g. "Assigned 4 exercises to Maya Torres for Ankle sprain." */
export function savedSummary(proposal: Proposal): string {
  const fresh = newItems(proposal);
  const count = proposal.exercises.length;
  const added: string[] = [];
  if (fresh.injury) added.push(`the injury ${fresh.injury}`);
  if (fresh.exercises.length) added.push(fresh.exercises.join(', '));
  const addedText = added.length ? ` Added to the catalog: ${added.join(' and ')}.` : '';
  const removed = proposal.removed ?? [];
  const removedText = removed.length ? ` Removed ${removed.map((r) => r.name).join(', ')}.` : '';
  if (proposal.athlete && proposal.injury && count > 0) {
    return `Assigned ${count} ${count === 1 ? 'exercise' : 'exercises'} to ${proposal.athlete.name} for ${proposal.injury.name}.${removedText}${addedText}`;
  }
  if (proposal.athlete && removed.length) return `Updated ${proposal.athlete.name}'s plan.${removedText}`;
  return addedText.trim() || 'Saved.';
}

// =====================================================================
// Visits
//
// A visit card: what happened when an athlete came in. The AI drafts it
// from what the trainer said (RawVisit), buildVisit() checks it against
// the database the same way as a plan, and the trainer edits and saves it.
// Plan changes inside a visit are an ordinary Proposal, checked by
// buildProposal() above, so the same rules apply to both.
// =====================================================================

export type VisitAvailability = 'out' | 'limited' | 'cleared';

export const MAX_SUMMARY = 2000;
export const MAX_DONE_TODAY = 1000;
export const MAX_RESULT = 100000;

/** A goal (milestone test) the athlete has, to record a result against. */
export interface VisitGoal {
  /** The case_milestones row. */
  id: string;
  athleteId: string;
  name: string;
  unit: string;
  target: number;
}

export interface VisitContext extends PlanContext {
  goals: VisitGoal[];
}

export interface VisitResult {
  goalId: string;
  name: string;
  unit: string;
  target: number;
  value: number;
}

export interface VisitProposal {
  athlete: { id: string; name: string };
  /** How they're doing, in a few plain sentences. */
  summary: string;
  /** Pain they reported, 0 to 10, or null if it didn't come up. */
  pain: number | null;
  /** What they did in the training room, or null. */
  doneToday: string | null;
  /** Goal tests measured at the visit. */
  results: VisitResult[];
  /** A change to what the coach sees, or null for no change. */
  availability: { status: VisitAvailability; expectedReturn: string | null } | null;
  /** Exercises to add or re-number on one injury's plan, or null. */
  plan: Proposal | null;
}

/** What the AI sends in its propose_visit tool call. Nothing in it is trusted. */
export interface RawVisit {
  athlete_id?: unknown;
  summary?: unknown;
  pain?: unknown;
  done_today?: unknown;
  test_results?: Array<{ goal_id?: unknown; value?: unknown }> | null;
  availability?: { status?: unknown; expected_return?: unknown } | null;
  plan_changes?: { injury?: RawPlan['injury']; exercises?: RawPlan['exercises']; remove?: RawPlan['remove'] } | null;
}

/** Keeps line breaks (a summary can have paragraphs) but trims each line. */
function cleanLines(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Pain 0 to 10 as a whole number, otherwise null. */
export function cleanPain(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
}

/** A measured value (seconds, degrees, reps...): 0 up to 100000, decimals allowed. */
export function cleanMeasure(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_RESULT ? Math.round(n * 100) / 100 : null;
}

/** "2026-12-01" if it's a real calendar day, otherwise null. */
export function cleanDay(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function cleanAvailability(
  raw: { status?: unknown; expected_return?: unknown; expectedReturn?: unknown } | null | undefined,
): VisitProposal['availability'] {
  if (!raw || typeof raw !== 'object') return null;
  const status = raw.status;
  if (status !== 'out' && status !== 'limited' && status !== 'cleared') return null;
  // Cleared means back to full: no return date to wait for.
  const day = status === 'cleared' ? null : cleanDay(raw.expected_return ?? raw.expectedReturn);
  return { status, expectedReturn: day };
}

/**
 * Checks the AI's draft visit against the database and turns it into the
 * card the trainer edits. Like buildProposal, errors go back to the AI.
 */
export function buildVisit(raw: RawVisit, ctx: VisitContext): PlanResult<VisitProposal> {
  const found = ctx.athletes.find((a) => a.id === raw.athlete_id);
  if (!found) return { ok: false, error: "athlete_id is not one of this trainer's athletes. Use an id from the ATHLETES list." };
  const athlete = { id: found.id, name: found.name };

  const summary = cleanLines(raw.summary, MAX_SUMMARY);
  if (!summary) return { ok: false, error: 'A visit needs a summary: how the athlete is doing, in a sentence or two.' };

  const results: VisitResult[] = [];
  for (const item of Array.isArray(raw.test_results) ? raw.test_results : []) {
    const goal = ctx.goals.find((g) => g.id === item?.goal_id && g.athleteId === athlete.id);
    if (!goal) {
      return { ok: false, error: `goal_id ${String(item?.goal_id)} is not one of ${athlete.name}'s goals. Use a goal id listed under that athlete, or leave the result out.` };
    }
    const value = cleanMeasure(item.value);
    if (value === null) return { ok: false, error: `The result for ${goal.name} must be a number in ${goal.unit}.` };
    if (!results.some((r) => r.goalId === goal.id)) results.push({ goalId: goal.id, name: goal.name, unit: goal.unit, target: goal.target, value });
  }

  let plan: Proposal | null = null;
  const changes = raw.plan_changes;
  const adds = changes && Array.isArray(changes.exercises) ? changes.exercises : [];
  const removes = changes && Array.isArray(changes.remove) ? changes.remove : [];
  if (adds.length > 0 || removes.length > 0) {
    const built = buildProposal({ athlete_id: athlete.id, injury: adds.length ? changes!.injury ?? null : null, exercises: adds, remove: removes }, ctx);
    if (!built.ok) return { ok: false, error: `plan_changes: ${built.error}` };
    plan = built.value;
  }

  return {
    ok: true,
    value: {
      athlete,
      summary,
      pain: cleanPain(raw.pain),
      doneToday: cleanLines(raw.done_today, MAX_DONE_TODAY) || null,
      results,
      availability: cleanAvailability(raw.availability),
      plan,
    },
  };
}

/**
 * Re-checks a visit that came back from the browser when the trainer
 * pressed Save (they may have edited it). Shapes and ranges are checked
 * here; whether this trainer may write for this athlete and goal is
 * checked by the database's row level security when saving.
 */
export function sanitizeVisit(input: unknown): PlanResult<VisitProposal> {
  const bad: PlanResult<VisitProposal> = { ok: false, error: "That visit can't be read. Record it again." };
  if (!input || typeof input !== 'object') return bad;
  const v = input as Record<string, unknown>;
  const a = v.athlete as { id?: unknown; name?: unknown } | undefined;
  if (!a || typeof a.id !== 'string' || !a.id) return bad;
  const athlete = { id: a.id, name: cleanText(a.name).slice(0, MAX_NAME) };

  const summary = cleanLines(v.summary, MAX_SUMMARY);
  if (!summary) return { ok: false, error: "Write how they're doing before saving." };

  const rawResults = v.results ?? [];
  if (!Array.isArray(rawResults)) return bad;
  const results: VisitResult[] = [];
  for (const r of rawResults as Array<Record<string, unknown>>) {
    if (!r || typeof r.goalId !== 'string') return bad;
    const value = cleanMeasure(r.value);
    if (value === null) return { ok: false, error: `Enter a number for ${cleanText(r.name) || 'each test'}, or remove it.` };
    results.push({
      goalId: r.goalId,
      name: cleanText(r.name).slice(0, MAX_NAME),
      unit: cleanText(r.unit).slice(0, 20),
      target: typeof r.target === 'number' ? r.target : 0,
      value,
    });
  }

  let plan: Proposal | null = null;
  if (v.plan) {
    const checked = sanitizeProposal(v.plan);
    if (!checked.ok) return checked;
    // The plan can only be for the athlete the visit is about.
    if (checked.value.athlete?.id !== athlete.id) return bad;
    plan = checked.value;
  }

  return {
    ok: true,
    value: {
      athlete,
      summary,
      pain: cleanPain(v.pain),
      doneToday: cleanLines(v.doneToday, MAX_DONE_TODAY) || null,
      results,
      availability: cleanAvailability(v.availability as { status?: unknown; expectedReturn?: unknown } | null),
      plan,
    },
  };
}

/** One line for the confirmation toast, e.g. "Saved Maya Torres's visit: 1 test result, plan updated." */
export function visitSavedSummary(visit: VisitProposal): string {
  const extras: string[] = [];
  if (visit.results.length) extras.push(`${visit.results.length} test ${visit.results.length === 1 ? 'result' : 'results'}`);
  if (visit.availability) extras.push(`status ${visit.availability.status}`);
  if (visit.plan) extras.push('plan updated');
  return `Saved ${visit.athlete.name}'s visit${extras.length ? `: ${extras.join(', ')}` : ''}.`;
}
