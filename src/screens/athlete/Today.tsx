import { useRef, useState, type FormEvent } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { MessageBox } from '../../components/MessageBox';
import { ProgressBar } from '../../components/ProgressBar';
import { useToast } from '../../components/Toast';
import { useReturnFocus } from '../../components/useReturnFocus';
import { exerciseById } from '../../data/seed';
import { availabilityLabel } from '../../domain/availability';
import { findLog } from '../../domain/logs';
import { athleteThread } from '../../domain/messages';
import { isHighPain, PAIN_SCALE } from '../../domain/pain';
import { REMINDER_HOUR, shouldShowReminder } from '../../domain/reminder';
import type { Exercise, ExerciseLog } from '../../domain/types';
import { formatCalendarDay, formatDay, formatTime } from '../../format';
import { useAppStore, useSignedInAthlete } from '../../store/AppStore';

export function Today() {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const me = useSignedInAthlete();
  // Which tutorial is open. Only one at a time, like the prototype.
  const [openId, setOpenId] = useState<string | null>(null);

  const now = new Date();
  const items = me.assignedExerciseIds.map((id) => ({
    exercise: exerciseById(id),
    log: findLog(state.logs, me.id, id, now),
  }));
  const total = items.length;
  const done = items.filter((i) => i.log).length;
  const left = total - done;
  const percent = total ? Math.round((100 * done) / total) : 0;
  const showReminder = left > 0 && (state.reminderSimulated || shouldShowReminder(now, left));

  /** Returns true when the log saved, so the card can move keyboard focus. */
  function markDone(exercise: Exercise, pain: number | undefined): boolean {
    const result = commands.logExercise(me.id, exercise.id, pain);
    if (!result.ok) {
      notify(result.error, 'error');
      return false;
    }
    const { log, rankUp } = result.value;
    let text = `Logged: ${exercise.name} at ${formatTime(log.loggedAt)}, pain ${log.pain}. Your trainer can see it.`;
    if (isHighPain(log.pain)) text += ' They\u2019ll follow up about the pain.';
    if (rankUp) text += ` Rank up: ${rankUp.name}!`;
    notify(text);
    return true;
  }

  return (
    <>
      <Card>
        <div className="eyebrow">{formatDay(now)}</div>
        <h1>Today&rsquo;s rehab</h1>
        <p className="muted">
          {me.name} &middot; {me.sport} &middot; {me.injury}
        </p>
        <p className="strong">
          Status: {availabilityLabel(me.availability)}
          {me.expectedReturn && <> &middot; expected back {formatCalendarDay(me.expectedReturn)}</>}
        </p>
        <div className="stack-sm">
          <div className="spread strong">
            <span>
              {done} of {total} done
            </span>
            <span>{percent}%</span>
          </div>
          <ProgressBar percent={percent} />
        </div>
      </Card>

      {showReminder && (
        <section className="notice">
          <div className="notice__title">Reminder &middot; {REMINDER_HOUR - 12}:00 PM</div>
          <div>
            {left} {left === 1 ? 'exercise is' : 'exercises are'} still not logged for today.
          </div>
        </section>
      )}

      <Card aria-labelledby="trainer-msgs">
        <h2 id="trainer-msgs" className="title">
          Your trainer
        </h2>
        <p className="small muted">Questions, pain or anything that felt off. Your coach can&rsquo;t see these.</p>
        <MessageBox thread={athleteThread(me.id)} recipient="your trainer" title="Conversation" />
      </Card>

      {total === 0 && (
        <Card>
          <p className="muted">Your trainer hasn&rsquo;t assigned any exercises yet. Check back after your next visit.</p>
        </Card>
      )}

      {items.map(({ exercise, log }) => (
        <ExerciseCard
          key={exercise.id}
          exercise={exercise}
          log={log}
          open={openId === exercise.id}
          onToggle={() => setOpenId(openId === exercise.id ? null : exercise.id)}
          onMarkDone={(pain) => markDone(exercise, pain)}
        />
      ))}

      {total > 0 && left === 0 && (
        <Card className="card--mist strong">All exercises logged for today. Your trainer can see your progress.</Card>
      )}

      <Button
        variant="link"
        className="align-center"
        onClick={() => notify('Only your trainer can change your plan, injury or records.', 'error')}
      >
        Edit my plan
      </Button>
    </>
  );
}

interface ExerciseCardProps {
  exercise: Exercise;
  log: ExerciseLog | undefined;
  open: boolean;
  onToggle: () => void;
  onMarkDone: (pain: number | undefined) => boolean;
}

function ExerciseCard({ exercise, log, open, onToggle, onMarkDone }: ExerciseCardProps) {
  // After logging, the buttons disappear; focus the card so keyboard users aren't lost.
  const cardRef = useRef<HTMLElement>(null);
  // "Mark done" first asks for a pain rating before saving.
  const [rating, setRating] = useState(false);
  const [pain, setPain] = useState<number | undefined>(undefined);
  const markDoneRef = useReturnFocus(rating);
  const titleId = `ex-${exercise.id}`;

  function cancel() {
    setRating(false);
    setPain(undefined);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (onMarkDone(pain)) {
      setRating(false);
      cardRef.current?.focus();
    }
  }

  return (
    <Card ref={cardRef} tabIndex={-1} aria-labelledby={titleId}>
      <div className="spread">
        <div className="stack-xs">
          <div id={titleId} className="title">
            {exercise.name}
          </div>
          <div className="muted">{exercise.prescription}</div>
        </div>
        {log ? <Badge tone="solid">Logged {formatTime(log.loggedAt)}</Badge> : <Badge tone="warn">Not done</Badge>}
      </div>

      <div className="row">
        <Button aria-expanded={open} onClick={onToggle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 4l13 8-13 8z" />
          </svg>
          {open ? 'Hide tutorial' : 'Watch tutorial'}
        </Button>
        {!log && !rating && (
          <Button ref={markDoneRef} variant="primary" onClick={() => setRating(true)}>
            Mark done
          </Button>
        )}
      </div>

      {log?.pain !== undefined && <div className="small muted">Pain you reported: {log.pain} of 10</div>}

      {rating && !log && (
        <form className="panel" onSubmit={submit}>
          {/* Radio buttons: arrow keys move between numbers, and screen readers announce "3 of 11". */}
          <fieldset className="chip-group">
            <legend className="strong">How much pain did you feel?</legend>
            <p className="small muted">0 = no pain, 10 = worst pain you can imagine</p>
            <div className="pain-scale">
              {PAIN_SCALE.map((n, i) => (
                <label key={n} className="pain-option">
                  <input
                    type="radio"
                    className="visually-hidden"
                    name={`pain-${exercise.id}`}
                    value={n}
                    checked={pain === n}
                    onChange={() => setPain(n)}
                    autoFocus={i === 0}
                  />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {isHighPain(pain) && (
            <p className="small strong warn-text">That&rsquo;s a lot. Your trainer will be flagged to check in.</p>
          )}
          <div className="row">
            <Button type="submit" variant="primary">
              Log it
            </Button>
            <Button onClick={cancel}>Cancel</Button>
          </div>
        </form>
      )}

      {open &&
        (exercise.videoUrl ? (
          <video className="video" src={exercise.videoUrl} controls />
        ) : (
          <div className="video">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M10 8l6 4-6 4z" fill="currentColor" />
            </svg>
            <div className="strong">Tutorial video: {exercise.name}</div>
            <div className="small">[VIDEO ATTACHED BY TRAINER]</div>
          </div>
        ))}
    </Card>
  );
}
