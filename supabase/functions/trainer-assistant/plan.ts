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

export interface Proposal {
  /** Who gets the plan. null when the trainer is only adding to the catalogs. */
  athlete: { id: string; name: string } | null;
  /** id is null for an injury that will be added to the catalog. */
  injury: { id: string | null; name: string; bodyRegion: string | null } | null;
  exercises: ProposedExercise[];
}

/** What the AI sends in its propose_plan tool call. Nothing in it is trusted. */
export interface RawPlan {
  athlete_id?: unknown;
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
}

export const MAX_NAME = 80;
export const MAX_DESCRIPTION = 300;
export const MAX_EXERCISES = 12;

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

  // ----- Does it add up to something that can be saved? -----
  if (athlete) {
    if (!injury) return { ok: false, error: 'Assigning to an athlete needs an injury.' };
    if (exercises.length === 0) return { ok: false, error: 'Assigning to an athlete needs at least one exercise.' };
  } else {
    const addsSomething = injury?.id === null || exercises.some((e) => e.id === null);
    if (!addsSomething) return { ok: false, error: 'Nothing to save: no athlete was given and every injury and exercise is already in the catalog. Ask the trainer which athlete this is for.' };
  }
  return { ok: true, value: { athlete, injury, exercises } };
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
  const p = input as { athlete?: unknown; injury?: unknown; exercises?: unknown };
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

  if (athlete && (!injury || exercises.length === 0)) return bad;
  if (!athlete && injury?.id !== null && !exercises.some((e) => e.id === null)) return bad;
  return { ok: true, value: { athlete, injury, exercises } };
}

/** The new catalog entries a plan would add, for the card and the toast. */
export function newItems(proposal: Proposal): { injury: string | null; exercises: string[] } {
  return {
    injury: proposal.injury && proposal.injury.id === null ? proposal.injury.name : null,
    exercises: proposal.exercises.filter((e) => e.id === null).map((e) => e.name),
  };
}

/** One line for the confirmation toast, e.g. "Assigned 4 exercises to Maya Torres for Ankle sprain." */
export function savedSummary(proposal: Proposal): string {
  const fresh = newItems(proposal);
  const count = proposal.exercises.length;
  const added: string[] = [];
  if (fresh.injury) added.push(`the injury ${fresh.injury}`);
  if (fresh.exercises.length) added.push(fresh.exercises.join(', '));
  const addedText = added.length ? ` Added to the catalog: ${added.join(' and ')}.` : '';
  if (proposal.athlete && proposal.injury) {
    return `Assigned ${count} ${count === 1 ? 'exercise' : 'exercises'} to ${proposal.athlete.name} for ${proposal.injury.name}.${addedText}`;
  }
  return addedText.trim() || 'Saved.';
}
