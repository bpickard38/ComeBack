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

  Every database call here is made AS THE TRAINER (their sign-in token is
  passed along), so the row level security rules in erd_schema.sql still
  decide what can be read and written. This function has no extra powers.

  Secrets (npx supabase secrets set NAME=value):
    OPENAI_API_KEY   required
    YOUTUBE_API_KEY  optional; without it new exercises are added with no video
    OPENAI_MODEL     optional; which OpenAI model to use (default below)
    OPENAI_REASONING_EFFORT  optional; passed to OpenAI as reasoning_effort
*/
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  buildProposal,
  sameName,
  sanitizeProposal,
  savedSummary,
  type PlanContext,
  type Proposal,
  type RawPlan,
} from './plan.ts';

/** A current lower-cost OpenAI model that supports tool calls on Chat Completions (checked Nov 2026). */
const DEFAULT_MODEL = 'gpt-5.6-terra';
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
}

/** Returns null if the caller isn't a trainer on any team. */
async function loadCatalog(db: SupabaseClient, callerId: string): Promise<Catalog | null> {
  const [members, cases, injuries, exercises, sets] = await Promise.all([
    db.from('team_members').select('team_id, user_id, role, teams(name)'),
    db.from('athlete_injuries').select('athlete_id, injuries(name)').eq('status', 'active'),
    db.from('injuries').select('id, name, body_region').order('name'),
    db.from('exercises').select('id, name, description, video_url').order('name'),
    db.from('injury_exercises').select('injury_id, exercise_id, sets, reps, hold_seconds').order('position'),
  ]);
  for (const r of [members, cases, injuries, exercises]) if (r.error) throw new Error(r.error.message);

  type Member = { team_id: string; user_id: string; role: string; teams: { name: string } | null };
  const memberRows = (members.data ?? []) as unknown as Member[];
  const myTeams = new Set(memberRows.filter((m) => m.user_id === callerId && m.role === 'trainer').map((m) => m.team_id));
  if (myTeams.size === 0) return null;

  const athleteRows = memberRows.filter((m) => m.role === 'athlete' && myTeams.has(m.team_id));
  const ids = [...new Set(athleteRows.map((m) => m.user_id))];
  const users = ids.length ? await db.from('users').select('id, name').in('id', ids) : { data: [], error: null };
  if (users.error) throw new Error(users.error.message);
  const nameOf = new Map(((users.data ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));

  type Case = { athlete_id: string; injuries: { name: string } | null };
  const caseRows = (cases.data ?? []) as unknown as Case[];
  const athletes = ids.map((id) => ({
    id,
    name: nameOf.get(id) ?? 'Unknown',
    teams: athleteRows.filter((m) => m.user_id === id).map((m) => m.teams?.name ?? ''),
    active_injuries: caseRows.filter((c) => c.athlete_id === id).map((c) => c.injuries?.name ?? ''),
  }));

  return {
    athletes,
    injuries: (injuries.data ?? []) as InjuryRow[],
    exercises: (exercises.data ?? []) as ExerciseRow[],
    // Missing before supabase/workout_sets.sql is run; then there are just no sets.
    workoutSets: sets.error ? [] : ((sets.data ?? []) as SetRow[]),
  };
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
 * Returns null when YOUTUBE_API_KEY isn't set or YouTube refuses.
 */
async function searchYouTube(exerciseName: string): Promise<Video[] | null> {
  const key = Deno.env.get('YOUTUBE_API_KEY');
  if (!key) return null;
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
      name: 'find_tutorial_videos',
      description: 'Search YouTube for short tutorial videos of an exercise that is NOT in the catalog yet. Returns up to 5 candidates; pick the one whose title best matches the exercise and pass its video_id to propose_plan.',
      parameters: { type: 'object', properties: { exercise_name: { type: 'string' } }, required: ['exercise_name'] },
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
              description: 'Give id for an exercise in the catalog. For a new one leave id out and give name, description and video_id.',
              properties: {
                id: { type: ['string', 'null'] },
                name: { type: ['string', 'null'], description: 'Sentence case, e.g. "Copenhagen plank".' },
                description: { type: ['string', 'null'], description: 'New exercises only: one or two short sentences telling the athlete how to do it.' },
                video_id: { type: ['string', 'null'], description: 'New exercises only: a video_id returned by find_tutorial_videos.' },
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

const SYSTEM_PROMPT = `You are the assistant inside Comeback, an injury rehab app. You are talking with an athletic trainer. Your job is to turn what they say into a plan they can confirm with one press: which athlete, which injury, which exercises.

How to work:
- Look things up with the search tools before answering. Never guess an id and never invent one.
- Find the athlete with search_athletes. If more than one athlete fits the name, ask which one. If none fits, say so and list close names.
- Find the injury with search_injuries and the exercises with search_exercises. Trainers use everyday wording ("rolled ankle", "calf raises"), so match by meaning against what the catalog returns before deciding something is missing.
- If the trainer names an injury but no exercises and the injury has a workout set, use that set with its numbers.
- If an injury or exercise truly is not in the catalog, include it in propose_plan as a new one (no id). For every new exercise first call find_tutorial_videos and pick the best matching video, and write a one or two sentence how-to as its description. Do this without asking permission: the trainer confirms everything on the plan card anyway.
- Give sets, reps and hold_seconds for each exercise: the trainer's numbers if they gave them, otherwise the workout set's numbers, otherwise a common starting prescription for that exercise. Use null for a number that does not apply (a timed hold has no reps).
- When you have everything, call propose_plan. The trainer then sees a card with a Confirm button. Do not ask "shall I go ahead?" first; proposing is the asking.
- If the athlete already has that injury active, the listed exercises are ADDED to their current plan. You cannot remove exercises or clear injuries; tell the trainer to do that on the athlete's profile.
- To change a plan you proposed that is still pending, call propose_plan again with the complete corrected plan.
- With no athlete, propose_plan adds new injuries and exercises to the catalogs. A new injury's exercises become its workout set.

The trainer decides the treatment. If they have not said which exercises to use and there is no workout set, ask them; you may suggest common options but do not choose for them. Do not diagnose.

Earlier assistant messages may end with a line like "[Plan shown to trainer ...]". That is a record of a plan card and whether it was saved, cancelled or is still pending.

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
  const effort = Deno.env.get('OPENAI_REASONING_EFFORT');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOLS,
      // Optional: how long the model thinks before answering. Left to the
      // model's default unless the secret is set, since allowed values differ by model.
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

async function chat(db: SupabaseClient, callerId: string, input: { messages?: unknown; teamName?: unknown }) {
  const history = cleanHistory(input.messages);
  if (history.length === 0 || history[history.length - 1].role !== 'user') return json({ error: 'Write a message first.' }, 400);

  const catalog = await loadCatalog(db, callerId);
  if (!catalog) return json({ error: 'Only trainers can use the assistant.' }, 403);

  // Videos the search returned in this request. propose_plan may only use these.
  const videos: PlanContext['videos'] = new Map();
  const exerciseName = new Map(catalog.exercises.map((e) => [e.id, e.name]));

  async function runTool(name: string, args: Record<string, unknown>): Promise<{ result: unknown; proposal?: Proposal }> {
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
    if (name === 'find_tutorial_videos') {
      const found = await searchYouTube(String(args.exercise_name ?? ''));
      if (found === null) return { result: { videos: [], note: 'Video search is not available. Propose the exercise without a video_id and tell the trainer it has no video yet.' } };
      for (const v of found) videos.set(v.video_id, { title: v.title });
      return { result: { videos: found } };
    }
    if (name === 'propose_plan') {
      const raw = args as RawPlan;
      const context: PlanContext = { athletes: catalog!.athletes, injuries: catalog!.injuries, exercises: catalog!.exercises, videos };
      // A new exercise the AI didn't pick a video for still gets the top search result.
      for (const item of raw.exercises ?? []) {
        const isNew = !item.id && typeof item.name === 'string' && !catalog!.exercises.some((e) => sameName(e.name, item.name as string));
        if (isNew && !(typeof item.video_id === 'string' && videos.has(item.video_id))) {
          const found = await searchYouTube(item.name as string);
          if (found?.length) {
            videos.set(found[0].video_id, { title: found[0].title });
            item.video_id = found[0].video_id;
          }
        }
      }
      const built = buildProposal(raw, context);
      return built.ok ? { result: { shown_to_trainer: true }, proposal: built.value } : { result: { error: built.error } };
    }
    return { result: { error: `Unknown tool ${name}.` } };
  }

  const team = typeof input.teamName === 'string' && input.teamName ? ` The trainer is currently looking at the team "${input.teamName.slice(0, 80)}"; prefer athletes on it when a name fits more than one.` : '';
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT + team }, ...history];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const answer = await callOpenAI(messages);
    if (!answer.tool_calls?.length) {
      return json({ reply: (answer.content ?? '').trim() || 'I didn’t get that. Could you say it another way?', proposal: null });
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
      const { result, proposal } = await runTool(call.function.name, args);
      // A valid plan ends the turn: the trainer takes it from here.
      if (proposal) return json({ reply: (answer.content ?? '').trim() || replyFor(proposal), proposal });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return json({ reply: 'That took more steps than I’m allowed. Try asking for one athlete at a time.', proposal: null });
}

function replyFor(proposal: Proposal): string {
  const missingVideo = proposal.exercises.filter((e) => e.id === null && !e.videoUrl).map((e) => e.name);
  const note = missingVideo.length ? ` I couldn’t find a video for ${missingVideo.join(' or ')}, so it would be added without one.` : '';
  return `Here’s the plan. Check it and press Confirm to save it.${note}`;
}

// ---------- apply ----------

async function apply(db: SupabaseClient, input: { proposal?: unknown }) {
  const checked = sanitizeProposal(input.proposal);
  if (!checked.ok) return json({ error: checked.error }, 400);
  const plan = checked.value;
  const fail = (message: string, status = 400) => json({ error: message }, status);

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

  return json({ ok: true, summary: savedSummary(plan) });
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

  let input: { action?: string; messages?: unknown; teamName?: unknown; proposal?: unknown };
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  try {
    if (input.action === 'chat') return await chat(db, user.id, input);
    if (input.action === 'apply') return await apply(db, input);
    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    if (error instanceof UserFacingError) return json({ error: error.message }, 502);
    console.error('ai-assistant failed', error);
    return json({ error: 'Something went wrong on the server. Try again.' }, 500);
  }
});
