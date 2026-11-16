/*
  The trainer's AI assistant (README.md > AI assistant).

  The browser can't call OpenAI itself: that would put the secret API key
  where anyone could copy it. So the app calls this function, and this
  function calls OpenAI and YouTube with keys stored as Supabase secrets.

  Two actions:

  - "chat":  the trainer's message goes to OpenAI together with a list of
             tools. OpenAI can't touch the database; it asks for a tool
             ("search the athletes for Maya") and this function runs it and
             sends the answer back, round after round, until OpenAI either
             replies in words or hands over a plan (propose_plan). The plan
             is checked against the database (plan.ts) and returned to the
             trainer to look at. Nothing is saved.
  - "apply": the trainer pressed Confirm. The plan is checked again and
             saved: new injury, new exercises with their videos, then the
             assignment. OpenAI is not involved in this step at all.

  - "apply_visit": the trainer pressed Save on a visit card (propose_visit
             in the chat). Writes the visit (supabase/visits.sql), then
             its test results, status change and plan changes.
  - "find_videos": up to 3 tutorial videos for a new exercise, for the
             card to offer. Kept out of the chat because a web search
             takes 20 to 40 seconds; the card shows first.

  And voice: a recording sent as a multipart form (field "audio") goes to
  OpenAI speech-to-text and comes back as { text }, which the app puts in
  the message box for the trainer to check before sending.

  Every database call here is made AS THE TRAINER (their sign-in token is
  passed along), so the row level security rules in erd_schema.sql still
  decide what can be read and written. This function has no extra powers.

  Secrets (npx supabase secrets set NAME=value):
    OPENAI_API_KEY   required
    YOUTUBE_API_KEY  optional; without it, videos are found with OpenAI web
                     search on youtube.com instead (see findVideosWithOpenAI)
    OPENAI_MODEL     optional; which OpenAI model to use (default below)
    OPENAI_REASONING_EFFORT  optional; passed to OpenAI as reasoning_effort
    OPENAI_TRANSCRIBE_MODEL  optional; speech-to-text model (default gpt-transcribe)
    OPENAI_SEARCH_MODEL      optional; model for the video web search (default gpt-5.5)

  Deploy: npx supabase functions deploy trainer-assistant --no-verify-jwt --use-api
*/
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  buildProposal,
  buildVisit,
  sameName,
  sanitizeProposal,
  sanitizeVisit,
  savedSummary,
  visitSavedSummary,
  youtubeIdFromUrl,
  type PlanContext,
  type Proposal,
  type RawPlan,
  type RawVisit,
  type VisitGoal,
  type VisitProposal,
} from './plan.ts';

/**
 * An OpenAI model that supports tool calls on Chat Completions. gpt-5.5
 * worked on this project's OpenAI account on Nov 16, 2026; gpt-5.6-terra
 * was refused there (400), so set OPENAI_MODEL to try another.
 */
const DEFAULT_MODEL = 'gpt-5.5';
/** How many times OpenAI may ask for tools before we stop waiting for an answer. */
const MAX_ROUNDS = 8;
const MAX_HISTORY = 24;
const MAX_MESSAGE_CHARS = 4000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// ---------- What the trainer can see, loaded once per request ----------

interface AthleteRow {
  id: string;
  name: string;
  teams: string[];
  active_injuries: string[];
  /** What the coach sees: out, limited or cleared. */
  availability: string | null;
  /** Each active injury's plan right now, for "bump her calf raises to 4 sets". */
  plans: Array<{ injury: string; exercises: Array<{ name: string; sets: number | null; reps: number | null; hold_seconds: number | null }> }>;
}
interface InjuryRow {
  id: string;
  name: string;
  body_region: string | null;
}
interface ExerciseRow {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
}
interface SetRow {
  injury_id: string;
  exercise_id: string;
  sets: number | null;
  reps: number | null;
  hold_seconds: number | null;
}
interface Catalog {
  athletes: AthleteRow[];
  injuries: InjuryRow[];
  exercises: ExerciseRow[];
  workoutSets: SetRow[];
  /** Every goal (milestone test) on an active injury, for recording results at a visit. */
  goals: VisitGoal[];
}

/** Returns null if the caller isn't a trainer on any team. */
async function loadCatalog(db: SupabaseClient, callerId: string): Promise<Catalog | null> {
  const [members, cases, injuries, exercises, sets, plans, goals] = await Promise.all([
    db.from('team_members').select('team_id, user_id, role, availability, teams(name)'),
    db.from('athlete_injuries').select('id, athlete_id, injuries(name)').eq('status', 'active'),
    db.from('injuries').select('id, name, body_region').order('name'),
    db.from('exercises').select('id, name, description, video_url').order('name'),
    db.from('injury_exercises').select('injury_id, exercise_id, sets, reps, hold_seconds').order('position'),
    db.from('plan_exercises').select('athlete_injury_id, sets, reps, hold_seconds, exercises(name)').eq('active', true),
    db.from('case_milestones').select('id, athlete_injury_id, target, milestone_tests(name, unit)'),
  ]);
  for (const r of [members, cases, injuries, exercises]) if (r.error) throw new Error(r.error.message);

  type Member = { team_id: string; user_id: string; role: string; availability: string | null; teams: { name: string } | null };
  const memberRows = (members.data ?? []) as unknown as Member[];
  const myTeams = new Set(memberRows.filter((m) => m.user_id === callerId && m.role === 'trainer').map((m) => m.team_id));
  if (myTeams.size === 0) return null;

  const athleteRows = memberRows.filter((m) => m.role === 'athlete' && myTeams.has(m.team_id));
  const ids = [...new Set(athleteRows.map((m) => m.user_id))];
  const users = ids.length ? await db.from('users').select('id, name').in('id', ids) : { data: [], error: null };
  if (users.error) throw new Error(users.error.message);
  const nameOf = new Map(((users.data ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));

  type Case = { id: string; athlete_id: string; injuries: { name: string } | null };
  type Plan = { athlete_injury_id: string; sets: number | null; reps: number | null; hold_seconds: number | null; exercises: { name: string } | null };
  type Goal = { id: string; athlete_injury_id: string; target: number; milestone_tests: { name: string; unit: string } | null };
  const caseRows = (cases.data ?? []) as unknown as Case[];
  const planRows = (plans.error ? [] : plans.data ?? []) as unknown as Plan[];
  const goalRows = (goals.error ? [] : goals.data ?? []) as unknown as Goal[];
  const caseById = new Map(caseRows.map((c) => [c.id, c]));

  const athletes = ids.map((id) => {
    const myCases = caseRows.filter((c) => c.athlete_id === id);
    return {
      id,
      name: nameOf.get(id) ?? 'Unknown',
      teams: athleteRows.filter((m) => m.user_id === id).map((m) => m.teams?.name ?? ''),
      active_injuries: myCases.map((c) => c.injuries?.name ?? ''),
      availability: athleteRows.find((m) => m.user_id === id)?.availability ?? null,
      plans: myCases.map((c) => ({
        injury: c.injuries?.name ?? '',
        exercises: planRows
          .filter((p) => p.athlete_injury_id === c.id)
          .map((p) => ({ name: p.exercises?.name ?? '', sets: p.sets, reps: p.reps, hold_seconds: p.hold_seconds })),
      })),
    };
  });

  return {
    athletes,
    injuries: (injuries.data ?? []) as InjuryRow[],
    exercises: (exercises.data ?? []) as ExerciseRow[],
    // Missing before supabase/workout_sets.sql is run; then there are just no sets.
    workoutSets: sets.error ? [] : ((sets.data ?? []) as SetRow[]),
    // Goals on active injuries only (cleared injuries aren't in caseById).
    goals: goalRows
      .filter((g) => caseById.has(g.athlete_injury_id) && g.milestone_tests)
      .map((g) => ({
        id: g.id,
        athleteId: caseById.get(g.athlete_injury_id)!.athlete_id,
        name: g.milestone_tests!.name,
        unit: g.milestone_tests!.unit,
        target: Number(g.target),
      })),
  };
}

/**
 * Everything the AI needs, written out once at the start, so it can usually
 * answer in one step instead of searching round after round (each round is
 * a full AI call, about 5 to 10 seconds). The search tools stay available
 * for anything this leaves out.
 */
function catalogText(c: Catalog): string {
  const numbers = (x: { sets: number | null; reps: number | null; hold_seconds: number | null }) =>
    [x.sets && `${x.sets} sets`, x.reps && `${x.reps} reps`, x.hold_seconds && `${x.hold_seconds}s hold`].filter(Boolean).join(' ') || 'usual';
  const exerciseName = new Map(c.exercises.map((e) => [e.id, e.name]));

  const athletes = c.athletes.slice(0, 150).map((a) => {
    const plans = a.plans.length
      ? a.plans.map((p) => `\n    injury "${p.injury}": ${p.exercises.map((e) => `${e.name} (${numbers(e)})`).join('; ') || 'no exercises'}`).join('')
      : '\n    no active injuries';
    const goals = c.goals.filter((g) => g.athleteId === a.id);
    const goalText = goals.length ? `\n    goals: ${goals.map((g) => `goal_id ${g.id} = ${g.name} (${g.unit}, target ${g.target})`).join('; ')}` : '';
    return `  ${a.id} | ${a.name} | ${a.teams.join(', ')} | status ${a.availability ?? 'unknown'}${plans}${goalText}`;
  });
  const injuries = c.injuries.slice(0, 200).map((i) => {
    const set = c.workoutSets.filter((s) => s.injury_id === i.id).map((s) => `${exerciseName.get(s.exercise_id)} [${s.exercise_id}] (${numbers(s)})`);
    return `  ${i.id} | ${i.name}${set.length ? ` | usual set: ${set.join('; ')}` : ''}`;
  });
  const exercises = c.exercises.slice(0, 300).map((e) => `  ${e.id} | ${e.name}${e.video_url ? '' : ' (no video)'}`);

  return [
    "ATHLETES on the trainer's teams (id | name | teams | status, then active injuries with their current plan, then goals):",
    ...(athletes.length ? athletes : ['  none']),
    'INJURIES catalog (id | name | usual workout set with exercise ids):',
    ...(injuries.length ? injuries : ['  none']),
    'EXERCISES catalog (id | name):',
    ...(exercises.length ? exercises : ['  none']),
  ].join('\n');
}

// ---------- Searching ----------

/** Words worth matching on: lower case, no plural s, at least 3 letters. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => w.replace(/s$/, ''))
    .filter((w) => w.length >= 3);
}

/** Items whose name shares a word with the query, best match first. An empty query returns everything. */
function matchByName<T extends { name: string }>(items: T[], query: string): T[] {
  const wanted = words(query);
  if (wanted.length === 0) return items;
  return items
    .map((item) => {
      const name = item.name.toLowerCase();
      return { item, score: wanted.filter((w) => name.includes(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

const decodeEntities = (text: string) =>
  text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

interface Video {
  video_id: string;
  title: string;
  channel: string;
}

/**
 * Short YouTube videos that are allowed to play inside another site
 * (videoEmbeddable), since the athlete watches them inside the app.
 * Uses the YouTube Data API when YOUTUBE_API_KEY is set, otherwise OpenAI
 * web search. Returns null when neither can search.
 */
async function searchYouTube(exerciseName: string): Promise<Video[] | null> {
  const key = Deno.env.get('YOUTUBE_API_KEY');
  if (!key) return await findVideosWithOpenAI(exerciseName);
  const find = async (duration: 'short' | 'any') => {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      relevanceLanguage: 'en',
      maxResults: '5',
      videoDuration: duration,
      q: `${exerciseName} exercise how to physical therapy`,
      key,
    });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!response.ok) {
      console.error('YouTube search failed', response.status, await response.text());
      return null;
    }
    const body = await response.json();
    type Item = { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } };
    return ((body.items ?? []) as Item[])
      .filter((i) => i.id?.videoId)
      .map((i) => ({
        video_id: i.id!.videoId!,
        title: decodeEntities(i.snippet?.title ?? ''),
        channel: decodeEntities(i.snippet?.channelTitle ?? ''),
      }));
  };
  // Under 4 minutes first, like the videos already in the catalog; anything if none.
  const short = await find('short');
  if (short === null) return null;
  return short.length ? short : await find('any');
}

/**
 * Video search without a YouTube key: OpenAI's web search, limited to
 * youtube.com, lists candidates, then each one is checked with YouTube's
 * free oEmbed service (checkVideo). A search answer can name a video that
 * doesn't exist or can't play in other sites; those never get through.
 */
async function findVideosWithOpenAI(exerciseName: string): Promise<Video[] | null> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return null;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // gpt-5.5 was tested with web search on Nov 16, 2026.
      model: Deno.env.get('OPENAI_SEARCH_MODEL') || 'gpt-5.5',
      tools: [{ type: 'web_search', filters: { allowed_domains: ['youtube.com'] } }],
      reasoning: { effort: 'low' },
      store: false,
      input:
        `Find 6 different YouTube videos that demonstrate the rehab exercise "${exerciseName}". ` +
        'Prefer short clips (under 3 minutes) from physical therapists, athletic trainers, clinics or hospitals, ' +
        'showing the movement clearly. Avoid long workouts and compilations. List each full youtube.com link on its own line.',
    }),
  });
  if (!response.ok) {
    console.error('Video web search failed', response.status, await response.text());
    return null;
  }

  // Links can be in the answer's text and in its citations.
  type Part = { text?: string; annotations?: Array<{ url?: string }> };
  const body = (await response.json()) as { output?: Array<{ type: string; content?: Part[] }> };
  const parts = (body.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
  const links = [
    ...parts.flatMap((p) => p.annotations ?? []).map((a) => a.url ?? ''),
    ...parts.flatMap((p) => p.text?.match(/https?:\/\/[^\s)\]"'<>]+/g) ?? []),
  ];
  const ids = [...new Set(links.map((l) => youtubeIdFromUrl(l.replace(/[.,;]+$/, ''))).filter((id): id is string => !!id))].slice(0, 6);

  const checked = await Promise.all(ids.map(checkVideo));
  return checked.filter((v): v is Video => v !== null).slice(0, 5);
}

/**
 * YouTube's oEmbed service answers only for videos that exist, are public
 * and allow playing inside other sites, with the title and channel. Free,
 * no key needed.
 */
async function checkVideo(videoId: string): Promise<Video | null> {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const info = (await response.json()) as { title?: string; author_name?: string };
    return { video_id: videoId, title: info.title ?? 'YouTube video', channel: info.author_name ?? 'YouTube' };
  } catch {
    return null;
  }
}

// ---------- Speech to text ----------

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // about 10 minutes of speech; OpenAI allows 25 MB

/** A voice recording to text. Names on the trainer's roster and in the catalog help with spelling. */
async function transcribe(request: Request, db: SupabaseClient, callerId: string): Promise<Response> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new UserFacingError('The assistant isn’t set up yet: the OpenAI key is missing on the server.');
  const form = await request.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof File) || audio.size === 0) return json({ error: 'No recording came through. Try again.' }, 400);
  if (audio.size > MAX_AUDIO_BYTES) return json({ error: 'That recording is too long. Keep it under a few minutes.' }, 400);

  const catalog = await loadCatalog(db, callerId);
  if (!catalog) return json({ error: 'Only trainers can use the assistant.' }, 403);
  const names = [...catalog.athletes, ...catalog.injuries, ...catalog.exercises].map((x) => x.name);
  let hint = 'A sports trainer talking about athletes and rehab exercises. Names: ';
  for (const name of names) {
    if (hint.length + name.length > 800) break;
    hint += `${name}, `;
  }

  const body = new FormData();
  body.append('file', audio, audio.name || 'speech.webm');
  body.append('model', Deno.env.get('OPENAI_TRANSCRIBE_MODEL') || 'gpt-transcribe');
  body.append('prompt', hint.replace(/, $/, '.'));
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body,
  });
  if (!response.ok) {
    console.error('Transcription failed', response.status, await response.text());
    if (response.status === 401) throw new UserFacingError('OpenAI rejected the API key. Whoever set up the assistant needs to check OPENAI_API_KEY.');
    if (response.status === 429) throw new UserFacingError('OpenAI is refusing requests right now (rate limit or no credit left on the account). Try again in a minute.');
    throw new UserFacingError('Couldn’t turn the recording into text. Try again, or type instead.');
  }
  const { text } = (await response.json()) as { text?: string };
  return json({ text: (text ?? '').trim() });
}

// ---------- The tools OpenAI may ask for ----------

const count = { type: ['integer', 'null'], minimum: 1, maximum: 999 };
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_athletes',
      description: "Find athletes on the trainer's teams by name. Returns their id, teams and active injuries. An empty query lists every athlete.",
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_injuries',
      description: "Search the injuries catalog. Each match comes with its usual workout set (exercise ids with sets, reps and hold). If nothing matches, the whole catalog's names are returned so you can tell whether the injury is really missing.",
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_exercises',
      description: 'Search the exercise catalog by name. If nothing matches, every exercise name is returned so you can spot one listed under a different name.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_visit',
      description:
        "Show the trainer a visit card for an athlete who came in: how they're doing, pain, what they did, test results, status and plan changes. Nothing is saved until they press Save, and they can edit every field first.",
      parameters: {
        type: 'object',
        properties: {
          athlete_id: { type: 'string', description: 'From the ATHLETES list.' },
          summary: { type: 'string', description: "How they're doing, in one to three plain sentences in the trainer's own terms. No pain number or test numbers here." },
          pain: { type: ['integer', 'null'], minimum: 0, maximum: 10, description: 'Pain 0 to 10 if it came up, otherwise null.' },
          done_today: { type: ['string', 'null'], description: 'What they did at the visit, short, e.g. "Balance work, band eversions, soft tissue". null if not said.' },
          test_results: {
            type: 'array',
            description: "Goal tests measured at the visit. Only goals listed under this athlete, by goal_id, value in the goal's unit.",
            items: {
              type: 'object',
              properties: { goal_id: { type: 'string' }, value: { type: 'number' } },
              required: ['goal_id', 'value'],
            },
          },
          availability: {
            type: ['object', 'null'],
            description: 'Only if the trainer said it: out, limited (partial practice) or cleared (full go). expected_return as YYYY-MM-DD only if a day was given.',
            properties: {
              status: { type: 'string', enum: ['out', 'limited', 'cleared'] },
              expected_return: { type: ['string', 'null'] },
            },
          },
          plan_changes: {
            type: ['object', 'null'],
            description:
              "Exercises to add to one of the athlete's injuries, or whose numbers change. List only those, with their new numbers. Same rules as propose_plan. null if the plan doesn't change.",
            properties: {
              injury: {
                type: ['object', 'null'],
                properties: { id: { type: ['string', 'null'] }, name: { type: ['string', 'null'] }, body_region: { type: ['string', 'null'] } },
              },
              exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: ['string', 'null'] },
                    name: { type: ['string', 'null'] },
                    description: { type: ['string', 'null'] },
                    sets: count,
                    reps: count,
                    hold_seconds: count,
                  },
                },
              },
            },
          },
        },
        required: ['athlete_id', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_plan',
      description: 'Show the trainer a plan to confirm. Nothing is saved until they press Confirm. Give athlete_id to assign the plan to an athlete; leave it out to only add a new injury or new exercises to the catalogs.',
      parameters: {
        type: 'object',
        properties: {
          athlete_id: { type: ['string', 'null'], description: 'From search_athletes.' },
          injury: {
            type: ['object', 'null'],
            description: 'Give id for an injury in the catalog. For a new one leave id out and give name and body_region.',
            properties: {
              id: { type: ['string', 'null'] },
              name: { type: ['string', 'null'], description: 'Plain clinical name in sentence case, e.g. "Hip flexor strain".' },
              body_region: { type: ['string', 'null'], description: 'One word or two, e.g. "Hip".' },
            },
          },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              description: 'Give id for an exercise in the catalog. For a new one leave id out and give name and description; the app finds its video.',
              properties: {
                id: { type: ['string', 'null'] },
                name: { type: ['string', 'null'], description: 'Sentence case, e.g. "Copenhagen plank".' },
                description: { type: ['string', 'null'], description: 'New exercises only: one or two short sentences telling the athlete how to do it.' },
                sets: count,
                reps: count,
                hold_seconds: count,
              },
            },
          },
        },
        required: ['exercises'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are the assistant inside Comeback, an injury rehab app. You are talking with an athletic trainer, often by voice, so expect speech-to-text slips in names. Your two jobs:

1. Recording a visit. When the trainer describes an athlete coming in (how they're doing, pain, what they did, a test, a status change, changes to their exercises), call propose_visit. This is the most common request.
2. Plans. When they only want to assign or add exercises, call propose_plan.

Either way the trainer sees a card, can edit it, and nothing is saved until they press Save or Confirm. Do not ask "shall I go ahead?" first; proposing is the asking.

How to work:
- The ATHLETES, INJURIES and EXERCISES lists at the end are complete and current. Use their ids directly; you rarely need the search tools. Never guess an id and never invent one.
- If more than one athlete fits a name, ask which one (give last names). If none fits, say so and list close names.
- Trainers use everyday wording ("rolled ankle", "calf raises"), so match by meaning against the lists before deciding something is missing.
- If the trainer names an injury but no exercises and the injury has a usual set, use that set with its numbers.
- If an injury or exercise truly is not in the catalog, include it as a new one (no id) with a one or two sentence how-to as its description. Don't look for a video: the app finds one and the trainer picks it on the card.

Visits:
- summary: how they're doing, one to three plain sentences, the trainer's meaning in clean words. Don't invent details.
- Only fill pain, done_today, test_results, availability and plan_changes with what the trainer actually said; otherwise leave them null or empty.
- test_results only for goals listed under that athlete, by goal_id, in that goal's unit (e.g. "balance was 25 seconds" for a sec goal).
- plan_changes: only exercises to add or whose numbers change ("bump calf raises to 4 sets of 15"), on one of that athlete's active injuries.
- Give sets, reps and hold_seconds for each exercise: the trainer's numbers if they gave them, otherwise the workout set's numbers, otherwise a common starting prescription for that exercise. Use null for a number that does not apply (a timed hold has no reps).
- When you have everything, call propose_plan. The trainer then sees a card with a Confirm button. Do not ask "shall I go ahead?" first; proposing is the asking.
- If the athlete already has that injury active, the listed exercises are ADDED to their current plan. You cannot remove exercises or clear injuries; tell the trainer to do that on the athlete's profile.
- To change a plan you proposed that is still pending, call propose_plan again with the complete corrected plan.
- With no athlete, propose_plan adds new injuries and exercises to the catalogs. A new injury's exercises become its workout set.

The trainer decides the treatment. If they have not said which exercises to use and there is no workout set, ask them; you may suggest common options but do not choose for them. Do not diagnose.

Earlier assistant messages may end with a line like "[Plan shown to trainer ...]" or "[Visit shown to trainer ...]". That is a record of a card and whether it was saved, cancelled or is still pending. To change a pending card, propose it again in full.

Write short, plain replies. No markdown, no bullet symbols, no ids in your replies to the trainer.`;

// ---------- chat ----------

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

/** A problem the trainer should read as is. */
class UserFacingError extends Error {}

async function callOpenAI(messages: ChatMessage[]): Promise<ChatMessage> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new UserFacingError('The assistant isn’t set up yet: the OpenAI key is missing on the server.');
  const model = Deno.env.get('OPENAI_MODEL') || DEFAULT_MODEL;
  // Optional: how long the model thinks before answering. Left to the
  // model's default unless the secret is set: gpt-5.5 refused "low" together
  // with tools on Chat Completions (400, Nov 16 2026), and allowed values
  // differ by model.
  const effort = Deno.env.get('OPENAI_REASONING_EFFORT');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOLS,
      ...(effort ? { reasoning_effort: effort } : {}),
    }),
  });
  if (!response.ok) {
    console.error('OpenAI request failed', response.status, await response.text());
    if (response.status === 401) throw new UserFacingError('OpenAI rejected the API key. Whoever set up the assistant needs to check OPENAI_API_KEY.');
    if (response.status === 429) throw new UserFacingError('OpenAI is refusing requests right now (rate limit or no credit left on the account). Try again in a minute.');
    if (response.status === 400) throw new UserFacingError(`OpenAI didn’t accept the request for the model "${model}". Whoever set up the assistant should check the function’s log and the OPENAI_MODEL setting.`);
    if (response.status === 404) throw new UserFacingError(`OpenAI doesn’t know the model "${model}". Whoever set up the assistant needs to check OPENAI_MODEL.`);
    throw new UserFacingError('The AI service had a problem. Try again in a moment.');
  }
  const body = await response.json();
  const message = body.choices?.[0]?.message as ChatMessage | undefined;
  if (!message) throw new UserFacingError('The AI service sent back an empty answer. Try again.');
  return message;
}

function cleanHistory(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() !== '')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_CHARS) }));
}

async function chat(db: SupabaseClient, callerId: string, input: { messages?: unknown; teamName?: unknown; athleteId?: unknown }) {
  const history = cleanHistory(input.messages);
  if (history.length === 0 || history[history.length - 1].role !== 'user') return json({ error: 'Write a message first.' }, 400);

  const catalog = await loadCatalog(db, callerId);
  if (!catalog) return json({ error: 'Only trainers can use the assistant.' }, 403);

  // Videos aren't searched during the chat any more (it took 20 to 40
  // seconds). The card shows first; the app then asks for videos
  // (action "find_videos") and the trainer picks one.
  const videos: PlanContext['videos'] = new Map();
  const exerciseName = new Map(catalog.exercises.map((e) => [e.id, e.name]));
  const context = { athletes: catalog.athletes, injuries: catalog.injuries, exercises: catalog.exercises, videos, goals: catalog.goals };

  type ToolAnswer = { result: unknown; proposal?: Proposal; visit?: VisitProposal };
  async function runTool(name: string, args: Record<string, unknown>): Promise<ToolAnswer> {
    const query = typeof args.query === 'string' ? args.query : '';
    if (name === 'search_athletes') {
      const matches = matchByName(catalog!.athletes, query).slice(0, 25);
      return { result: matches.length ? { athletes: matches } : { athletes: [], everyone: catalog!.athletes.map((a) => a.name).slice(0, 100) } };
    }
    if (name === 'search_injuries') {
      const matches = matchByName(catalog!.injuries, query).slice(0, 10).map((i) => ({
        ...i,
        workout_set: catalog!.workoutSets
          .filter((s) => s.injury_id === i.id)
          .map((s) => ({ exercise_id: s.exercise_id, name: exerciseName.get(s.exercise_id), sets: s.sets, reps: s.reps, hold_seconds: s.hold_seconds })),
      }));
      return { result: matches.length ? { injuries: matches } : { injuries: [], whole_catalog: catalog!.injuries.slice(0, 200).map((i) => ({ id: i.id, name: i.name })) } };
    }
    if (name === 'search_exercises') {
      const matches = matchByName(catalog!.exercises, query).slice(0, 15).map((e) => ({ id: e.id, name: e.name, description: e.description, has_video: !!e.video_url }));
      return { result: matches.length ? { exercises: matches } : { exercises: [], whole_catalog: catalog!.exercises.slice(0, 300).map((e) => ({ id: e.id, name: e.name })) } };
    }
    if (name === 'propose_plan') {
      const built = buildProposal(args as RawPlan, context);
      return built.ok ? { result: { shown_to_trainer: true }, proposal: built.value } : { result: { error: built.error } };
    }
    if (name === 'propose_visit') {
      const built = buildVisit(args as RawVisit, context);
      return built.ok ? { result: { shown_to_trainer: true }, visit: built.value } : { result: { error: built.error } };
    }
    return { result: { error: `Unknown tool ${name}.` } };
  }

  const team = typeof input.teamName === 'string' && input.teamName ? ` The trainer is currently looking at the team "${input.teamName.slice(0, 80)}"; prefer athletes on it when a name fits more than one.` : '';
  const focus = catalog.athletes.find((a) => a.id === input.athleteId);
  const about = focus ? ` The trainer opened Record for ${focus.name} (athlete_id ${focus.id}); unless they name someone else, they are talking about ${focus.name}.` : '';
  const today = ` Today is ${new Date().toISOString().slice(0, 10)}.`;
  const messages: ChatMessage[] = [{ role: 'system', content: `${SYSTEM_PROMPT}${team}${about}${today}\n\n${catalogText(catalog)}` }, ...history];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const answer = await callOpenAI(messages);
    if (!answer.tool_calls?.length) {
      return json({ reply: (answer.content ?? '').trim() || 'I didn’t get that. Could you say it another way?', proposal: null, visit: null });
    }
    messages.push({ role: 'assistant', content: answer.content ?? null, tool_calls: answer.tool_calls });
    for (const call of answer.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Arguments were not valid JSON.' }) });
        continue;
      }
      const { result, proposal, visit } = await runTool(call.function.name, args);
      // A valid card ends the turn: the trainer takes it from here.
      if (proposal) return json({ reply: (answer.content ?? '').trim() || replyFor(proposal), proposal, visit: null });
      if (visit) return json({ reply: (answer.content ?? '').trim() || 'Here’s the visit. Fix anything that’s off, then press Save.', proposal: null, visit });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return json({ reply: 'That took more steps than I’m allowed. Try asking for one athlete at a time.', proposal: null, visit: null });
}

function replyFor(proposal: Proposal): string {
  const fresh = proposal.exercises.some((e) => e.id === null);
  return `Here’s the plan. Check it and press Confirm to save it.${fresh ? ' Pick a video for each new exercise on the card.' : ''}`;
}

// ---------- apply ----------

async function apply(db: SupabaseClient, input: { proposal?: unknown }) {
  const checked = sanitizeProposal(input.proposal);
  if (!checked.ok) return json({ error: checked.error }, 400);
  const problem = await savePlan(db, checked.value);
  return problem ? json({ error: problem.error }, problem.status) : json({ ok: true, summary: savedSummary(checked.value) });
}

type SaveProblem = { error: string; status: number };

/** Saves a checked plan. Returns what went wrong, or null when it all saved. Used by plans and by visits. */
async function savePlan(db: SupabaseClient, plan: Proposal): Promise<SaveProblem | null> {
  const fail = (message: string, status = 400): SaveProblem => ({ error: message, status });

  const [injuries, exercises] = await Promise.all([
    db.from('injuries').select('id, name'),
    db.from('exercises').select('id, name'),
  ]);
  if (injuries.error || exercises.error) return fail('Could not read the catalogs. Try again.', 500);
  const injuryRows = injuries.data as Array<{ id: string; name: string }>;
  const exerciseRows = exercises.data as Array<{ id: string; name: string }>;

  // 1. The injury: the catalog's, or a new one.
  let injuryId: string | null = null;
  let injuryIsNew = false;
  if (plan.injury) {
    const existing = plan.injury.id ? injuryRows.find((i) => i.id === plan.injury!.id) : injuryRows.find((i) => sameName(i.name, plan.injury!.name));
    if (plan.injury.id && !existing) return fail('That injury is no longer in the catalog. Ask the assistant again.');
    if (existing) injuryId = existing.id;
    else {
      const added = await db.from('injuries').insert({ name: plan.injury.name, body_region: plan.injury.bodyRegion }).select('id').single();
      if (added.error) return fail(`Could not add the injury ${plan.injury.name}. ${added.error.message}`);
      injuryId = added.data.id;
      injuryIsNew = true;
    }
  }

  // 2. The exercises: the catalog's, or new ones with their how-to and video.
  const exerciseIds: string[] = [];
  for (const ex of plan.exercises) {
    const existing = ex.id ? exerciseRows.find((e) => e.id === ex.id) : exerciseRows.find((e) => sameName(e.name, ex.name));
    if (ex.id && !existing) return fail(`${ex.name} is no longer in the exercise catalog. Ask the assistant again.`);
    if (existing) exerciseIds.push(existing.id);
    else {
      const added = await db.from('exercises').insert({ name: ex.name, description: ex.description, video_url: ex.videoUrl }).select('id').single();
      if (added.error) return fail(`Could not add the exercise ${ex.name}. ${added.error.message}`);
      exerciseIds.push(added.data.id);
    }
  }

  // 3. A new injury's exercises become its workout set, so the Assign form
  //    ticks them next time. Same when the trainer is only adding to the
  //    catalogs for an injury. A plan for one athlete doesn't change the
  //    set of an injury that already existed.
  if (injuryId && (injuryIsNew || !plan.athlete) && exerciseIds.length) {
    const { count: already } = await db.from('injury_exercises').select('exercise_id', { count: 'exact', head: true }).eq('injury_id', injuryId);
    const set = await db.from('injury_exercises').upsert(
      plan.exercises.map((ex, i) => ({
        injury_id: injuryId,
        exercise_id: exerciseIds[i],
        sets: ex.sets,
        reps: ex.reps,
        hold_seconds: ex.holdSeconds,
        position: (already ?? 0) + i + 1,
      })),
      { onConflict: 'injury_id,exercise_id' },
    );
    // Not fatal: the catalog entries are saved, there's just no pre-ticked set.
    if (set.error) console.error('Saving the workout set failed', set.error.message);
  }

  // 4. The assignment.
  if (plan.athlete && injuryId) {
    // assign_plan() switches off exercises that aren't in the list it's
    // given. The assistant only ever adds, so exercises already on this
    // injury's plan are included again.
    const open = await db.from('athlete_injuries').select('id').eq('athlete_id', plan.athlete.id).eq('injury_id', injuryId).eq('status', 'active').maybeSingle();
    let all = exerciseIds;
    if (open.data) {
      const current = await db.from('plan_exercises').select('exercise_id').eq('athlete_injury_id', open.data.id).eq('active', true);
      if (current.error) return fail('Could not read the athlete’s current plan. Try again.', 500);
      all = [...new Set([...(current.data as Array<{ exercise_id: string }>).map((r) => r.exercise_id), ...exerciseIds])];
    }
    const assigned = await db.rpc('assign_plan', { p_athlete: plan.athlete.id, p_injury: injuryId, p_exercises: all });
    if (assigned.error) return fail(`Could not assign the plan. ${assigned.error.message}`);

    // Sets, reps and hold as shown on the card. An exercise with no numbers
    // keeps what assign_plan gave it (the workout set's, if any).
    for (let i = 0; i < plan.exercises.length; i++) {
      const ex = plan.exercises[i];
      if (ex.sets === null && ex.reps === null && ex.holdSeconds === null) continue;
      const updated = await db
        .from('plan_exercises')
        .update({ sets: ex.sets, reps: ex.reps, hold_seconds: ex.holdSeconds })
        .eq('athlete_injury_id', assigned.data)
        .eq('exercise_id', exerciseIds[i]);
      if (updated.error) return fail(`The plan was assigned, but the sets and reps for ${ex.name} could not be saved. Set them on the athlete’s profile.`, 500);
    }
  }

  return null;
}

// ---------- apply_visit ----------

/**
 * The trainer pressed Save on a visit card (maybe after editing it). The
 * visit is written first, since it's the record of what happened; then its
 * test results, status and plan changes. If one of those fails, the rest
 * still save and the trainer is told which part to redo.
 */
async function applyVisit(db: SupabaseClient, trainerId: string, input: { visit?: unknown }) {
  const checked = sanitizeVisit(input.visit);
  if (!checked.ok) return json({ error: checked.error }, 400);
  const visit = checked.value;
  const now = new Date().toISOString();

  const saved = await db.from('visits').insert({
    athlete_id: visit.athlete.id,
    trainer_id: trainerId,
    visited_at: now,
    summary: visit.summary,
    pain: visit.pain,
    done_today: visit.doneToday,
  });
  if (saved.error) {
    console.error('Saving the visit failed', saved.error.message);
    // 42P01: the table isn't there yet.
    if (saved.error.code === '42P01') return json({ error: 'Visits aren’t set up yet: run supabase/visits.sql in Supabase.' }, 500);
    return json({ error: `Could not save the visit. ${saved.error.message}` }, 400);
  }

  const problems: string[] = [];
  if (visit.results.length) {
    const results = await db.from('test_results').insert(
      visit.results.map((r) => ({ case_milestone_id: r.goalId, value: r.value, recorded_by: trainerId, recorded_at: now, source: 'trainer' })),
    );
    if (results.error) problems.push('the test results (record them on the profile)');
  }
  if (visit.availability) {
    const status = await db
      .from('team_members')
      .update({ availability: visit.availability.status, expected_return: visit.availability.expectedReturn })
      .eq('user_id', visit.athlete.id)
      .eq('role', 'athlete')
      .select('user_id');
    if (status.error || !status.data?.length) problems.push('the status change (set it on the profile)');
  }
  if (visit.plan) {
    const problem = await savePlan(db, visit.plan);
    if (problem) problems.push(`the plan change (${problem.error})`);
  }

  const summary = visitSavedSummary(visit);
  return json({ ok: true, summary: problems.length ? `${summary} Not saved: ${problems.join('; ')}.` : summary });
}

// ---------- find_videos ----------

/**
 * Up to 3 tutorial videos for an exercise, each checked to exist and to
 * play inside the app. The card shows them so the trainer can pick one.
 */
async function findVideos(input: { exerciseName?: unknown }) {
  const name = typeof input.exerciseName === 'string' ? input.exerciseName.trim().slice(0, 80) : '';
  if (!name) return json({ error: 'Which exercise?' }, 400);
  const found = (await searchYouTube(name)) ?? [];
  return json({
    videos: found.slice(0, 3).map((v) => ({
      url: `https://www.youtube.com/watch?v=${v.video_id}`,
      title: v.title,
      channel: v.channel,
      thumbnail: `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`,
    })),
  });
}

// ---------- Entry point ----------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return json({ error: 'Server is missing Supabase configuration.' }, 500);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in as a trainer to use the assistant.' }, 401);

  // A client that acts as the signed-in trainer, so row level security applies.
  const db = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return json({ error: 'Your session is not valid. Sign in again.' }, 401);

  const { data: me } = await db.from('users').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'trainer') return json({ error: 'Only trainers can use the assistant.' }, 403);

  // A voice recording comes as a form with a file, not JSON.
  if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    try {
      return await transcribe(request, db, user.id);
    } catch (error) {
      if (error instanceof UserFacingError) return json({ error: error.message }, 502);
      console.error('trainer-assistant transcription failed', error);
      return json({ error: 'Something went wrong on the server. Try again.' }, 500);
    }
  }

  let input: { action?: string; messages?: unknown; teamName?: unknown; athleteId?: unknown; proposal?: unknown; visit?: unknown; exerciseName?: unknown };
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  try {
    if (input.action === 'chat') return await chat(db, user.id, input);
    if (input.action === 'apply') return await apply(db, input);
    if (input.action === 'apply_visit') return await applyVisit(db, user.id, input);
    if (input.action === 'find_videos') return await findVideos(input);
    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    if (error instanceof UserFacingError) return json({ error: error.message }, 502);
    console.error('trainer-assistant failed', error);
    return json({ error: 'Something went wrong on the server. Try again.' }, 500);
  }
});
