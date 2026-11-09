import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ProgressBar } from "../../components/ProgressBar";
import { useToast } from "../../components/Toast";
import { useReturnFocus } from "../../components/useReturnFocus";
import { findLog } from "../../domain/logs";
import { isHighPain, PAIN_SCALE } from "../../domain/pain";
import {
  listNames,
  REMINDER_HOUR,
  shouldShowReminder,
} from "../../domain/reminder";
import type { Exercise, ExerciseLog } from "../../domain/types";
import { youtubeEmbedUrl } from "../../domain/video";
import { formatDay, formatTime } from "../../format";
import {
  exerciseById,
  useAppStore,
  useSignedInAthlete,
} from "../../store/AppStore";
import { upcomingAppointments } from "../../domain/appointments";
import { RemindersCard } from "./RemindersCard";

export function Today() {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const me = useSignedInAthlete();
  // Which tutorial is open. Only one at a time, like the prototype.
  const [openId, setOpenId] = useState<string | null>(null);

  const now = new Date();
  const items = me.assignedExerciseIds.map((id) => ({
    exercise: exerciseById(state, id),
    log: findLog(state.logs, me.id, id, now),
  }));
  const total = items.length;
  const done = items.filter((i) => i.log).length;
  const left = total - done;
  const percent = total ? Math.round((100 * done) / total) : 0;
  const showReminder =
    left > 0 && (state.reminderSimulated || shouldShowReminder(now, left));
  const leftNames = items.filter((i) => !i.log).map((i) => i.exercise.name);
  const nextVisit = upcomingAppointments(state.appointments, me.id, now)[0];

  /** Returns true when the log saved, so the card can move keyboard focus. */
  async function markDone(
    exercise: Exercise,
    pain: number | undefined,
  ): Promise<boolean> {
    const result = await commands.logExercise(me.id, exercise.id, pain);
    if (!result.ok) {
      notify(result.error, "error");
      return false;
    }
    const { log } = result.value;
    let text = `Logged: ${exercise.name} at ${formatTime(log.loggedAt)}, pain ${log.pain}. Your trainer can see it.`;
    if (isHighPain(log.pain)) text += " They\u2019ll follow up about the pain.";
    notify(text);
    return true;
  }

  return (
    <>
      <Card className="today-summary">
        <div className="today-summary__heading">
          <div>
            <div className="eyebrow">{formatDay(now)}</div>
            <h1>Today</h1>
          </div>
          <RemindersCard compact />
        </div>
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
          <div className="notice__title">
            Reminder &middot; {REMINDER_HOUR - 12}:00 PM
          </div>
          <div>
            {listNames(leftNames)} {left === 1 ? "is" : "are"} still not logged
            for today.
          </div>
        </section>
      )}

      {total === 0 && (
        <Card>
          <p className="muted">
            Your trainer hasn&rsquo;t assigned any exercises yet. Check back
            after your next visit.
          </p>
        </Card>
      )}

      <div className="today-exercises">
      {items.map(({ exercise, log }) => (
        <ExerciseCard
          key={exercise.id}
          exercise={exercise}
          log={log}
          open={openId === exercise.id}
          onToggle={() =>
            setOpenId(openId === exercise.id ? null : exercise.id)
          }
          onMarkDone={(pain) => markDone(exercise, pain)}
        />
      ))}
      </div>

      {total > 0 && left === 0 && (
        <Card className="card--mist strong">
          All exercises logged for today. Your trainer can see your progress.
        </Card>
      )}

      {nextVisit && (
        <Link to="/athlete/trainer" className="card next-visit">
          <span className="stack-xs">
            <span className="eyebrow">Next appointment</span>
            <span className="strong">
              {formatDay(nextVisit.startsAt)} &middot; {formatTime(nextVisit.startsAt)}
            </span>
            <span className="muted">
              {nextVisit.title} &middot; {nextVisit.location}
            </span>
          </span>
          <span className="next-visit__arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
      )}

    </>
  );
}

interface ExerciseCardProps {
  exercise: Exercise;
  log: ExerciseLog | undefined;
  open: boolean;
  onToggle: () => void;
  onMarkDone: (pain: number | undefined) => Promise<boolean>;
}

function ExerciseCard({
  exercise,
  log,
  open,
  onToggle,
  onMarkDone,
}: ExerciseCardProps) {
  // After logging, the buttons disappear; focus the card so keyboard users aren't lost.
  const cardRef = useRef<HTMLElement>(null);
  // "Mark done" first asks for a pain rating before saving.
  const [rating, setRating] = useState(false);
  const [pain, setPain] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const markDoneRef = useReturnFocus(rating);
  const titleId = `ex-${exercise.id}`;

  function cancel() {
    setRating(false);
    setPain(undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const saved = await onMarkDone(pain);
    setSaving(false);
    if (saved) {
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
        {log ? (
          <Badge tone="solid">Logged {formatTime(log.loggedAt)}</Badge>
        ) : (
          <Badge tone="warn">Not done</Badge>
        )}
      </div>

      {log?.pain !== undefined && (
        <div className="small muted">Pain you reported: {log.pain} of 10</div>
      )}

      {rating && !log && (
        <form className="panel" onSubmit={submit}>
          {/* Radio buttons: arrow keys move between numbers, and screen readers announce "3 of 11". */}
          <fieldset className="chip-group">
            <legend className="strong">How much pain did you feel?</legend>
            <p className="small muted">
              0 = no pain, 10 = worst pain you can imagine
            </p>
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
                  <span>
                    {n}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {isHighPain(pain) && (
            <p className="small strong warn-text">
              That&rsquo;s a lot. Your trainer will be flagged to check in.
            </p>
          )}
          <div className="row">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Log it"}
            </Button>
            <Button onClick={cancel}>Cancel</Button>
          </div>
        </form>
      )}

      {open && exercise.description && <p className="small">{exercise.description}</p>}

      {open &&
        (exercise.videoUrl ? (
          <TutorialVideo url={exercise.videoUrl} name={exercise.name} />
        ) : (
          <div className="video" role="status">
            <div className="strong">Tutorial video unavailable</div>
          </div>
        ))}

      <div className="row exercise-actions">
        <Button aria-expanded={open} onClick={onToggle}>
          <svg
            className="icon icon--sm"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 4l13 8-13 8z" />
          </svg>
          {open ? "Hide tutorial" : "Watch tutorial"}
        </Button>
        {!log && !rating && (
          <Button
            ref={markDoneRef}
            variant="primary"
            onClick={() => setRating(true)}
          >
            Mark done
          </Button>
        )}
      </div>
    </Card>
  );
}

/** YouTube links play in YouTube's player; any other link is a plain video file. */
function TutorialVideo({ url, name }: { url: string; name: string }) {
  const embed = youtubeEmbedUrl(url);
  if (!embed) return <video className="video-frame" src={url} controls aria-label={`Tutorial video: ${name}`} />;
  return (
    <div className="stack-xs">
      <iframe
        className="video-frame"
        src={embed}
        title={`Tutorial video: ${name}`}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <a className="btn btn--secondary align-start" href={url} target="_blank" rel="noreferrer">
        Open on YouTube
      </a>
    </div>
  );
}
