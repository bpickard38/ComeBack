import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { canRecord, useVoiceRecorder } from '../../components/useVoiceRecorder';
import {
  planNumbers,
  withAnswer,
  type AssistantTurn,
  type PlanStatus,
  type Proposal,
  type ProposedExercise,
  type VideoOption,
  type VisitAvailability,
  type VisitProposal,
} from '../../domain/assistant';
import { addSpokenText } from '../../domain/voice';
import { useAppStore, useTeam } from '../../store/AppStore';

const EXAMPLES = [
  'Maya came in. Ankle feels better, pain about 3. Balance was 25 seconds. Bump her calf raises to 4 sets of 15.',
  'Devon rolled his ankle at practice. Give him the usual ankle sprain set. He’s out until next Friday.',
  'Add Copenhagen planks, 3 sets of 20 seconds, to Jordan’s plan.',
];

/**
 * The conversation, kept while the app stays open so looking something up
 * on another tab doesn't lose a card that's waiting. It's per person, in
 * case someone else signs in on the same device. Reloading the page clears it.
 */
let kept: { userId: string; turns: AssistantTurn[] } | null = null;
let nextId = 1;

/**
 * Record: the trainer's main screen. Tap the mic and say what happened
 * when an athlete came in. The AI drafts a visit card (how they're doing,
 * pain, what they did, test results, status, plan changes) that the
 * trainer fixes and saves. It also handles plain plan requests ("give
 * Devon the ankle set"), with Elijah's plan card and Confirm.
 *
 * Opened from an athlete (/staff/record?athlete=<id>), it knows who the
 * visit is about. The AI runs on the server (supabase/functions/trainer-assistant).
 */
export function Record() {
  const { state, commands, profile } = useAppStore();
  const { team } = useTeam();
  const { notify } = useToast();
  const [params, setParams] = useSearchParams();
  const focus = state.athletes.find((a) => a.id === params.get('athlete'));
  const [turns, setTurns] = useState<AssistantTurn[]>(() => (kept?.userId === profile.id ? kept.turns : []));
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  /** The turn whose card is being saved right now. */
  const [savingId, setSavingId] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voice = canRecord();

  // Tap the mic, talk, tap stop: the words land in the box to check, then Send.
  const recorder = useVoiceRecorder({
    onRecorded: async (audio, fileName) => {
      setTranscribing(true);
      const heard = await commands.transcribeSpeech(audio, fileName);
      setTranscribing(false);
      if (!heard.ok) return notify(heard.error, 'error');
      if (!heard.value) return notify('I didn’t catch any words. Tap the mic and try again.', 'error');
      setDraft((d) => addSpokenText(d, heard.value));
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    },
    onProblem: (message) => notify(message, 'error'),
  });
  const listening = recorder.status !== 'idle';
  const busy = thinking || transcribing;

  useEffect(() => {
    kept = { userId: profile.id, turns };
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, thinking, transcribing, profile.id]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (busy || text === '') return;
    const asked: AssistantTurn[] = [...turns, { id: nextId++, from: 'trainer', text }];
    setTurns(asked);
    setDraft('');
    setThinking(true);
    const result = await commands.askAssistant(asked, team?.name ?? null, focus?.id ?? null);
    setThinking(false);
    if (!result.ok) {
      notify(result.error, 'error');
      // Put the message back in the box so it isn't lost.
      setTurns(turns);
      setDraft(text);
      return;
    }
    // `current` rather than `asked`: the trainer may have saved or cancelled a card while waiting.
    setTurns((current) => withAnswer(current, result.value, nextId++));
  }

  // Enter sends, Shift+Enter starts a new line (same as Messages).
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function updateTurn(id: number, change: Partial<AssistantTurn>) {
    setTurns((current) => current.map((t) => (t.id === id ? { ...t, ...change } : t)));
  }

  async function confirmPlan(turn: AssistantTurn) {
    if (!turn.proposal || savingId !== null) return;
    setSavingId(turn.id);
    const result = await commands.applyAssistantPlan(turn.proposal);
    setSavingId(null);
    if (!result.ok) return notify(result.error, 'error');
    updateTurn(turn.id, { status: 'saved' });
    notify(result.value.summary);
  }

  async function saveVisit(turn: AssistantTurn, visit: VisitProposal) {
    if (savingId !== null) return;
    setSavingId(turn.id);
    const result = await commands.applyVisit(visit);
    setSavingId(null);
    if (!result.ok) return notify(result.error, 'error');
    // Keep what was actually saved, so the AI's history matches it.
    updateTurn(turn.id, { visit, status: 'saved' });
    notify(result.value.summary);
  }

  const micButton = voice && (
    <button
      type="button"
      className="assistant__mic"
      data-listening={listening || undefined}
      // The ring around the mic grows with your voice.
      style={{ '--mic-level': recorder.level } as CSSProperties}
      onClick={listening ? recorder.stop : recorder.start}
      disabled={busy}
      aria-pressed={listening}
      aria-label={listening ? 'Stop recording' : 'Talk to the assistant'}
    >
      {listening ? <StopIcon /> : <MicIcon />}
    </button>
  );

  return (
    <section className="chat assistant record" aria-labelledby="record-title">
      <header className="chat__head">
        <div className="stack-xs chat__who">
          <h1 id="record-title" className="chat__name">
            {focus ? `Visit with ${focus.name}` : 'Record'}
          </h1>
          <span className="small muted">
            {focus ? (
              <>
                Say how they’re doing, pain, what you did and any plan changes.{' '}
                <button type="button" className="link-button" onClick={() => setParams({})}>
                  Someone else
                </button>
              </>
            ) : (
              'Say who came in and what happened, or ask for a plan. Nothing is saved until you press Save.'
            )}
          </span>
        </div>
        {turns.length > 0 && (
          <Button className="btn--small" onClick={() => setTurns([])} disabled={busy || savingId !== null}>
            Start over
          </Button>
        )}
      </header>

      {/* role="log" tells screen readers new messages are added at the end. */}
      <div ref={logRef} className="chat__log" role="log">
        {turns.length === 0 ? (
          <div className="chat__empty record__start">
            {voice && (
              <button
                type="button"
                className="record__big-mic"
                data-listening={listening || undefined}
                style={{ '--mic-level': recorder.level } as CSSProperties}
                onClick={listening ? recorder.stop : recorder.start}
                disabled={busy}
                aria-pressed={listening}
              >
                {listening ? <StopIcon /> : <MicIcon />}
                <span>{listening ? 'Tap when you’re done' : transcribing ? 'Turning it into text…' : 'Tap to talk'}</span>
              </button>
            )}
            <span className="strong">{voice ? 'Or try one of these' : 'Try one of these'}</span>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="chip assistant__example" onClick={() => setDraft(example)}>
                {example}
              </button>
            ))}
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="chat__item">
              <div className={`msg msg--first ${turn.from === 'trainer' ? 'msg--mine' : 'msg--theirs'}`}>
                <div className="msg__bubble">
                  <span className="visually-hidden">{turn.from === 'trainer' ? 'You' : 'Assistant'}: </span>
                  {turn.text}
                </div>
              </div>
              {turn.proposal && (
                <PlanCard
                  proposal={turn.proposal}
                  status={turn.status ?? 'pending'}
                  saving={savingId === turn.id}
                  onChange={(proposal) => updateTurn(turn.id, { proposal })}
                  onConfirm={() => confirmPlan(turn)}
                  onCancel={() => updateTurn(turn.id, { status: 'cancelled' })}
                />
              )}
              {turn.visit && (
                <VisitCard
                  // A new key when the AI replaces the card, so the form starts fresh.
                  key={`${turn.id}-${turn.status}`}
                  visit={turn.visit}
                  status={turn.status ?? 'pending'}
                  saving={savingId === turn.id}
                  onSave={(visit) => saveVisit(turn, visit)}
                  onCancel={() => updateTurn(turn.id, { status: 'cancelled' })}
                />
              )}
            </div>
          ))
        )}
        {(thinking || (transcribing && turns.length > 0)) && (
          <div className="msg msg--first msg--theirs" role="status">
            <div className="msg__bubble muted">{transcribing ? 'Turning your voice into text…' : 'Working on it…'}</div>
          </div>
        )}
      </div>

      <form className="chat__compose" onSubmit={send}>
        <label htmlFor="assistant-input" className="visually-hidden">
          Tell the assistant what happened
        </label>
        <textarea
          ref={inputRef}
          id="assistant-input"
          className="chat__input"
          rows={1}
          placeholder={listening ? 'Listening… tap stop when you’re done' : focus ? `What happened with ${focus.name.split(' ')[0]}?` : 'Who came in, and how are they doing?'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={listening}
        />
        {micButton}
        {draft.trim() !== '' && !listening && (
          <button type="submit" className="chat__send" disabled={busy}>
            {thinking ? 'Working…' : 'Send'}
          </button>
        )}
      </form>
    </section>
  );
}

// ---------- Plan card ----------

interface PlanCardProps {
  proposal: Proposal;
  status: PlanStatus;
  saving: boolean;
  onChange: (proposal: Proposal) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATUS_TEXT: Record<Exclude<PlanStatus, 'pending'>, string> = {
  saved: 'Saved.',
  cancelled: 'Cancelled. Nothing was saved.',
  replaced: 'Replaced by the newer card below. Nothing was saved.',
};

/** The plan the assistant worked out, for the trainer to check before it's saved. */
function PlanCard({ proposal, status, saving, onChange, onConfirm, onCancel }: PlanCardProps) {
  const { state } = useAppStore();
  const { athlete, injury, exercises } = proposal;
  // Same injury already active: the exercises join that plan rather than starting a second one.
  const alreadyHas = !!athlete && !!injury && !!state.athletes.find((a) => a.id === athlete.id)?.injuries.some((i) => i.name === injury.name);
  const title = athlete ? `Assign to ${athlete.name}` : 'Add to the catalog';
  const pending = status === 'pending';

  function setExercise(index: number, change: Partial<ProposedExercise>) {
    onChange({ ...proposal, exercises: exercises.map((e, i) => (i === index ? { ...e, ...change } : e)) });
  }

  return (
    <section className="card card--strong assistant__plan" aria-label={title}>
      <h3>{title}</h3>

      {injury && (
        <p>
          <span className="strong">Injury:</span> {injury.name}
          {injury.bodyRegion && <span className="muted"> ({injury.bodyRegion})</span>}{' '}
          {injury.id === null && <Badge tone="warn">New injury</Badge>}
          {alreadyHas && pending && <span className="muted"> Already active, so these are added to that plan.</span>}
        </p>
      )}

      {exercises.length > 0 && (
        <ExerciseList exercises={exercises} pending={pending} hasAthlete={!!athlete} onChange={setExercise} />
      )}

      {!athlete && injury && exercises.length > 0 && pending && (
        <p className="small muted">These exercises become the workout set for {injury.name}.</p>
      )}

      {pending ? (
        <div className="row">
          <Button variant="primary" onClick={onConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      ) : (
        <p className="strong" role="status">
          {STATUS_TEXT[status]}{' '}
          {status === 'saved' && athlete && <Link to={`/staff/athletes/${athlete.id}`}>Open {athlete.name}’s profile</Link>}
        </p>
      )}
    </section>
  );
}

/** Exercises on a card. New ones get a video picker while the card is waiting. */
function ExerciseList({
  exercises,
  pending,
  hasAthlete,
  onChange,
  onRemove,
}: {
  exercises: ProposedExercise[];
  pending: boolean;
  hasAthlete: boolean;
  onChange: (index: number, change: Partial<ProposedExercise>) => void;
  onRemove?: (index: number) => void;
}) {
  return (
    <ul className="assistant__exercises">
      {exercises.map((ex, i) => (
        <li key={ex.id ?? ex.name}>
          <span className="strong">{ex.name}</span> {ex.id === null && <Badge tone="warn">New exercise</Badge>}
          {pending && onRemove && (
            <button type="button" className="link-button small" onClick={() => onRemove(i)}>
              Remove<span className="visually-hidden"> {ex.name}</span>
            </button>
          )}
          {pending && onRemove ? (
            <NumbersEditor exercise={ex} onChange={(change) => onChange(i, change)} />
          ) : (
            <span className="small muted assistant__detail">
              {planNumbers(ex.sets, ex.reps, ex.holdSeconds) || (hasAthlete ? 'Usual sets and reps' : 'No sets or reps given')}
              {ex.id !== null && (
                <>
                  {' · '}
                  {ex.videoUrl ? (
                    <a href={ex.videoUrl} target="_blank" rel="noreferrer">
                      Watch the video<span className="visually-hidden"> for {ex.name} (opens in a new tab)</span>
                    </a>
                  ) : (
                    'No video'
                  )}
                </>
              )}
            </span>
          )}
          {ex.id === null && ex.description && <span className="small assistant__detail">{ex.description}</span>}
          {ex.id === null &&
            (pending ? (
              <VideoPicker
                exerciseName={ex.name}
                chosen={ex.videoUrl}
                onPick={(video) => onChange(i, { videoUrl: video?.url ?? null, videoTitle: video?.title ?? null })}
              />
            ) : (
              <span className="small muted assistant__detail">{ex.videoTitle ? `Video: “${ex.videoTitle}”` : 'No video'}</span>
            ))}
        </li>
      ))}
    </ul>
  );
}

/** Sets, reps and hold as small number boxes, for fixing what the AI heard. */
function NumbersEditor({ exercise, onChange }: { exercise: ProposedExercise; onChange: (change: Partial<ProposedExercise>) => void }) {
  const field = (key: 'sets' | 'reps' | 'holdSeconds', label: string) => (
    <label className="numbers__field">
      <span className="small muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={999}
        className="field field--slim numbers__input"
        value={exercise[key] ?? ''}
        onChange={(e) => onChange({ [key]: e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))) })}
        aria-label={`${label} for ${exercise.name}`}
      />
    </label>
  );
  return (
    <span className="numbers">
      {field('sets', 'Sets')}
      {field('reps', 'Reps')}
      {field('holdSeconds', 'Hold (sec)')}
    </span>
  );
}

// Videos found per exercise name while the app is open, so a card that
// re-renders (or comes back) doesn't search again.
const foundVideos = new Map<string, Promise<{ ok: true; value: VideoOption[] } | { ok: false; error: string }>>();

/**
 * Tutorial videos for a new exercise. The search starts when the card
 * shows (it can take 20 to 40 seconds), the first video is picked for
 * you, and you can switch or choose none.
 */
function VideoPicker({ exerciseName, chosen, onPick }: { exerciseName: string; chosen: string | null; onPick: (video: VideoOption | null) => void }) {
  const { commands } = useAppStore();
  const [videos, setVideos] = useState<VideoOption[] | null>(null);
  const [error, setError] = useState('');
  const picked = useRef(false);

  useEffect(() => {
    let live = true;
    const key = exerciseName.toLowerCase();
    if (!foundVideos.has(key)) foundVideos.set(key, commands.findVideos(exerciseName));
    foundVideos.get(key)!.then((result) => {
      if (!live) return;
      if (!result.ok) {
        foundVideos.delete(key); // try again next time
        setError(result.error);
        return;
      }
      setVideos(result.value);
      // Start with the first one so Confirm just works; the trainer can change it.
      if (!picked.current && !chosen && result.value[0]) onPick(result.value[0]);
      picked.current = true;
    });
    return () => {
      live = false;
    };
    // Only when the exercise changes; commands and onPick are new every render.
  }, [exerciseName]);

  if (error) return <span className="small muted assistant__detail">Couldn’t look for videos ({error}). It can be added later.</span>;
  if (videos === null) {
    return (
      <span className="small muted assistant__detail" role="status">
        Finding tutorial videos…
      </span>
    );
  }
  if (videos.length === 0) return <span className="small muted assistant__detail">No playable videos found. It will be added without one.</span>;

  return (
    <div className="video-picks" role="radiogroup" aria-label={`Tutorial video for ${exerciseName}`}>
      {videos.map((v, i) => (
        <label key={v.url} className="video-pick" data-picked={chosen === v.url || undefined}>
          <input type="radio" name={`video-${exerciseName}`} className="visually-hidden" checked={chosen === v.url} onChange={() => onPick(v)} />
          <span className="video-pick__thumb">
            {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" /> : null}
            <span className="video-pick__num" aria-hidden="true">
              {i + 1}
            </span>
          </span>
          <span className="video-pick__title">{v.title}</span>
          <span className="small muted">{v.channel}</span>
          <a href={v.url} target="_blank" rel="noreferrer" className="small" onClick={(e) => e.stopPropagation()}>
            Watch<span className="visually-hidden"> {v.title} on YouTube (new tab)</span>
          </a>
        </label>
      ))}
      <label className="video-pick video-pick--none" data-picked={chosen === null || undefined}>
        <input type="radio" name={`video-${exerciseName}`} className="visually-hidden" checked={chosen === null} onChange={() => onPick(null)} />
        <span className="small">No video</span>
      </label>
    </div>
  );
}

// ---------- Visit card ----------

const AVAILABILITY_WORDS: Record<VisitAvailability, string> = {
  out: 'Out',
  limited: 'Limited',
  cleared: 'Cleared',
};

/**
 * The visit the AI drafted, as a form: the trainer fixes anything that's
 * off, then Save writes it all at once. After saving it shows what was saved.
 */
function VisitCard({
  visit,
  status,
  saving,
  onSave,
  onCancel,
}: {
  visit: VisitProposal;
  status: PlanStatus;
  saving: boolean;
  onSave: (visit: VisitProposal) => void;
  onCancel: () => void;
}) {
  const pending = status === 'pending';
  const first = visit.athlete.name.split(' ')[0];
  const [summary, setSummary] = useState(visit.summary);
  const [pain, setPain] = useState(visit.pain === null ? '' : String(visit.pain));
  const [doneToday, setDoneToday] = useState(visit.doneToday ?? '');
  const [results, setResults] = useState(visit.results.map((r) => ({ ...r, text: String(r.value) })));
  const [availability, setAvailability] = useState<VisitAvailability | ''>(visit.availability?.status ?? '');
  const [returnDay, setReturnDay] = useState(visit.availability?.expectedReturn ?? '');
  const [plan, setPlan] = useState(visit.plan);
  const id = useRef(`visit-${Math.random().toString(36).slice(2)}`).current;

  function save(event: FormEvent) {
    event.preventDefault();
    onSave({
      ...visit,
      summary: summary.trim(),
      pain: pain === '' ? null : Number(pain),
      doneToday: doneToday.trim() || null,
      results: results.map(({ text, ...r }) => ({ ...r, value: Number(text) })),
      availability: availability ? { status: availability, expectedReturn: availability === 'cleared' ? null : returnDay || null } : null,
      plan: plan && plan.exercises.length > 0 ? plan : null,
    });
  }

  if (!pending) {
    return (
      <section className="card card--strong assistant__plan visit-card" aria-label={`Visit with ${visit.athlete.name}`}>
        <h3>Visit with {visit.athlete.name}</h3>
        <p className="visit-card__summary">{visit.summary}</p>
        <p className="small muted">
          {[
            visit.pain !== null && `Pain ${visit.pain}/10`,
            visit.doneToday && `Did: ${visit.doneToday}`,
            ...visit.results.map((r) => `${r.name}: ${r.value} ${r.unit}`),
            visit.availability && `Status: ${AVAILABILITY_WORDS[visit.availability.status]}`,
            visit.plan && `Plan: ${visit.plan.exercises.map((e) => `${e.name} ${planNumbers(e.sets, e.reps, e.holdSeconds)}`.trim()).join(', ')}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="strong" role="status">
          {STATUS_TEXT[status]}{' '}
          {status === 'saved' && <Link to={`/staff/athletes/${visit.athlete.id}`}>Open {visit.athlete.name}’s profile</Link>}
        </p>
      </section>
    );
  }

  return (
    <form className="card card--strong assistant__plan visit-card" aria-label={`Visit with ${visit.athlete.name}`} onSubmit={save}>
      <h3>Visit with {visit.athlete.name}</h3>

      <label className="stack-xs" htmlFor={`${id}-summary`}>
        <span className="strong">How {first} is doing</span>
      </label>
      <textarea id={`${id}-summary`} className="field visit-card__text" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} required />

      <div className="visit-card__row">
        <label className="stack-xs" htmlFor={`${id}-pain`}>
          <span className="strong">Pain</span>
          <select id={`${id}-pain`} className="field field--slim" value={pain} onChange={(e) => setPain(e.target.value)}>
            <option value="">Didn’t come up</option>
            {Array.from({ length: 11 }, (_, n) => (
              <option key={n} value={n}>
                {n} / 10
              </option>
            ))}
          </select>
        </label>
        <label className="stack-xs" htmlFor={`${id}-status`}>
          <span className="strong">Status</span>
          <select id={`${id}-status`} className="field field--slim" value={availability} onChange={(e) => setAvailability(e.target.value as VisitAvailability | '')}>
            <option value="">No change</option>
            <option value="out">Out</option>
            <option value="limited">Limited</option>
            <option value="cleared">Cleared</option>
          </select>
        </label>
        {(availability === 'out' || availability === 'limited') && (
          <label className="stack-xs" htmlFor={`${id}-return`}>
            <span className="strong">Expected back</span>
            <input id={`${id}-return`} type="date" className="field field--slim" value={returnDay} onChange={(e) => setReturnDay(e.target.value)} />
          </label>
        )}
      </div>

      <label className="stack-xs" htmlFor={`${id}-done`}>
        <span className="strong">What they did</span>
      </label>
      <textarea
        id={`${id}-done`}
        className="field visit-card__text"
        rows={2}
        placeholder="Optional"
        value={doneToday}
        onChange={(e) => setDoneToday(e.target.value)}
      />

      {results.length > 0 && (
        <fieldset className="visit-card__group">
          <legend className="strong">Test results</legend>
          {results.map((r, i) => (
            <div key={r.goalId} className="visit-card__result">
              <label htmlFor={`${id}-r${i}`}>{r.name}</label>
              <input
                id={`${id}-r${i}`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                className="field field--slim numbers__input"
                value={r.text}
                onChange={(e) => setResults(results.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                required
              />
              <span className="small muted">
                {r.unit} (goal {r.target})
              </span>
              <button type="button" className="link-button small" onClick={() => setResults(results.filter((_, j) => j !== i))}>
                Remove<span className="visually-hidden"> {r.name}</span>
              </button>
            </div>
          ))}
        </fieldset>
      )}

      {plan && plan.exercises.length > 0 && (
        <fieldset className="visit-card__group">
          <legend className="strong">
            Plan changes{plan.injury ? ` for ${plan.injury.name}` : ''} {plan.injury?.id === null && <Badge tone="warn">New injury</Badge>}
          </legend>
          <ExerciseList
            exercises={plan.exercises}
            pending
            hasAthlete
            onChange={(index, change) => setPlan({ ...plan, exercises: plan.exercises.map((e, i) => (i === index ? { ...e, ...change } : e)) })}
            onRemove={(index) => setPlan({ ...plan, exercises: plan.exercises.filter((_, i) => i !== index) })}
          />
        </fieldset>
      )}

      <div className="row">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save visit'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Small inline icons; aria-hidden because the buttons have their own labels.
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
