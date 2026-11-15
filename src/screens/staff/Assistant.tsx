import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { planNumbers, withAnswer, type AssistantTurn, type PlanStatus, type Proposal } from '../../domain/assistant';
import { useAppStore, useTeam } from '../../store/AppStore';

const EXAMPLES = [
  'Maya rolled her ankle. Give her the usual ankle sprain set.',
  'Add Copenhagen planks, 3 sets of 20 seconds, to Devon’s plan.',
  'Add turf toe as an injury with towel curls and toe yoga.',
];

/**
 * The conversation, kept while the app stays open so looking something up
 * on the Roster tab doesn't lose a plan that's waiting. It's per person, in
 * case someone else signs in on the same device. Reloading the page clears it.
 */
let kept: { userId: string; turns: AssistantTurn[] } | null = null;
let nextId = 1;

/**
 * Trainer-only tab: say who, which injury and which exercises, and the AI
 * turns it into a plan card. Nothing is saved until Confirm. If the injury
 * or an exercise isn't in the catalog, the plan adds it (new exercises get
 * a tutorial video found on YouTube).
 *
 * The AI itself runs on the server (supabase/functions/ai-assistant); this
 * screen only shows the conversation.
 */
export function Assistant() {
  const { commands, profile } = useAppStore();
  const { team } = useTeam();
  const { notify } = useToast();
  const [turns, setTurns] = useState<AssistantTurn[]>(() => (kept?.userId === profile.id ? kept.turns : []));
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  /** The turn whose plan is being saved right now. */
  const [savingId, setSavingId] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    kept = { userId: profile.id, turns };
    // Keep the newest message in view.
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, thinking, profile.id]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (thinking || text === '') return;
    const asked: AssistantTurn[] = [...turns, { id: nextId++, from: 'trainer', text }];
    setTurns(asked);
    setDraft('');
    setThinking(true);
    const result = await commands.askAssistant(asked, team?.name ?? null);
    setThinking(false);
    if (!result.ok) {
      notify(result.error, 'error');
      // Put the message back in the box so it isn't lost.
      setTurns(turns);
      setDraft(text);
      return;
    }
    // `current` rather than `asked`: the trainer may have confirmed or cancelled a plan while waiting.
    setTurns((current) => withAnswer(current, result.value, nextId++));
  }

  // Enter sends, Shift+Enter starts a new line (same as Messages).
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function setStatus(id: number, status: PlanStatus) {
    setTurns((current) => current.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  async function confirm(turn: AssistantTurn) {
    if (!turn.proposal || savingId !== null) return;
    setSavingId(turn.id);
    const result = await commands.applyAssistantPlan(turn.proposal);
    setSavingId(null);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    setStatus(turn.id, 'saved');
    notify(result.value.summary);
  }

  return (
    <section className="chat assistant" aria-labelledby="assistant-title">
      <header className="chat__head">
        <div className="stack-xs chat__who">
          <h2 id="assistant-title" className="chat__name">Assistant</h2>
          <span className="small muted">
            Say who, which injury and which exercises. Nothing is saved until you press Confirm.
          </span>
        </div>
        {turns.length > 0 && (
          <Button className="btn--small" onClick={() => setTurns([])} disabled={thinking || savingId !== null}>
            Start over
          </Button>
        )}
      </header>

      {/* role="log" tells screen readers new messages are added at the end. */}
      <div ref={logRef} className="chat__log" role="log">
        {turns.length === 0 ? (
          <div className="chat__empty">
            <span className="strong">Try one of these</span>
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="chip assistant__example" onClick={() => setDraft(example)}>
                {example}
              </button>
            ))}
            <span className="small muted">
              If an injury or exercise isn’t in the catalog, the assistant adds it and finds a tutorial video.
            </span>
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
                  onConfirm={() => confirm(turn)}
                  onCancel={() => setStatus(turn.id, 'cancelled')}
                />
              )}
            </div>
          ))
        )}
        {thinking && (
          <div className="msg msg--first msg--theirs" role="status">
            <div className="msg__bubble muted">Working on it…</div>
          </div>
        )}
      </div>

      <form className="chat__compose" onSubmit={send}>
        <label htmlFor="assistant-input" className="visually-hidden">
          Tell the assistant what to assign
        </label>
        <textarea
          id="assistant-input"
          className="chat__input"
          rows={1}
          placeholder="Who, which injury, which exercises…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {draft.trim() !== '' && (
          <button type="submit" className="chat__send" disabled={thinking}>
            {thinking ? 'Working…' : 'Send'}
          </button>
        )}
      </form>
    </section>
  );
}

interface PlanCardProps {
  proposal: Proposal;
  status: PlanStatus;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATUS_TEXT: Record<Exclude<PlanStatus, 'pending'>, string> = {
  saved: 'Saved.',
  cancelled: 'Cancelled. Nothing was saved.',
  replaced: 'Replaced by the newer plan below. Nothing was saved.',
};

/** The plan the assistant worked out, for the trainer to check before it's saved. */
function PlanCard({ proposal, status, saving, onConfirm, onCancel }: PlanCardProps) {
  const { state } = useAppStore();
  const { athlete, injury, exercises } = proposal;
  // Same injury already active: the exercises join that plan rather than starting a second one.
  const alreadyHas = !!athlete && !!injury && !!state.athletes.find((a) => a.id === athlete.id)?.injuries.some((i) => i.name === injury.name);
  const title = athlete ? `Assign to ${athlete.name}` : 'Add to the catalog';

  return (
    <section className="card card--strong assistant__plan" aria-label={title}>
      <h3>{title}</h3>

      {injury && (
        <p>
          <span className="strong">Injury:</span> {injury.name}
          {injury.bodyRegion && <span className="muted"> ({injury.bodyRegion})</span>}{' '}
          {injury.id === null && <Badge tone="warn">New injury</Badge>}
          {alreadyHas && status === 'pending' && <span className="muted"> Already active, so these are added to that plan.</span>}
        </p>
      )}

      {exercises.length > 0 && (
        <ul className="assistant__exercises">
          {exercises.map((ex) => (
            <li key={ex.id ?? ex.name}>
              <span className="strong">{ex.name}</span>{' '}
              {ex.id === null && <Badge tone="warn">New exercise</Badge>}
              <span className="small muted assistant__detail">
                {planNumbers(ex.sets, ex.reps, ex.holdSeconds) || (athlete ? 'Usual sets and reps' : 'No sets or reps given')}
                {' · '}
                {ex.videoUrl ? (
                  <a href={ex.videoUrl} target="_blank" rel="noreferrer">
                    Watch the video<span className="visually-hidden"> for {ex.name} (opens in a new tab)</span>
                  </a>
                ) : (
                  'No video'
                )}
              </span>
              {ex.id === null && ex.description && <span className="small assistant__detail">{ex.description}</span>}
              {ex.id === null && ex.videoTitle && <span className="small muted assistant__detail">Video: “{ex.videoTitle}”</span>}
            </li>
          ))}
        </ul>
      )}

      {!athlete && injury && exercises.length > 0 && status === 'pending' && (
        <p className="small muted">These exercises become the workout set for {injury.name}.</p>
      )}

      {status === 'pending' ? (
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
