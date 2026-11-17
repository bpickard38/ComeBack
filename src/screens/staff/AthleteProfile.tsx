import { useState, type FormEvent } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ChatThread } from '../../components/Chat';
import { ProfilePhoto } from '../../components/ProfilePhoto';
import { RecoveryBar } from '../../components/RecoveryBar';
import { useToast } from '../../components/Toast';
import { upcomingAppointments } from '../../domain/appointments';
import { injuryDays, injuryHistory, NOTE_MAX_LENGTH, PAIN_HISTORY_DAYS, painHistory, profileTimeline } from '../../domain/history';
import { doneOnDay } from '../../domain/logs';
import { athleteThread, unreadIn } from '../../domain/messages';
import { PAIN_ALERT_LEVEL } from '../../domain/pain';
import { recoveryPace } from '../../domain/recovery';
import { isInjured } from '../../domain/roster';
import { bestStreak, currentStreak } from '../../domain/streak';
import { aboutThread, coachChatLabel } from '../../domain/teams';
import type { Athlete, InjuryRecord, Team } from '../../domain/types';
import { weekCompletion, weekStatus } from '../../domain/week';
import { formatCalendarDay, formatDay, formatNumber, formatSentAt, formatTime, injuryLabel, plural } from '../../format';
import { useAppStore, useTeam } from '../../store/AppStore';
import { PhotoButtons } from '../PhotoButtons';
import { AboutChat } from './AboutChat';
import { AvailabilityEditor } from './AvailabilityEditor';
import { PlanEditor } from './PlanEditor';

/** The four parts of the profile below the progress card; one shows at a time. */
const SECTIONS = ['plan', 'history', 'notes', 'messages'] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABELS: Record<Section, string> = { plan: 'Plan', history: 'History', notes: 'Notes', messages: 'Messages' };

/**
 * Everything the trainer has on one athlete, without a long scroll: who
 * they are, one progress card (recovery bar, this week, pain, next visit,
 * what the coach sees), then Plan, History, Notes or Messages, one at a
 * time. Trainer only: the route, and the database rules behind the data,
 * keep coaches out.
 */
export function AthleteProfile() {
  const { athleteId } = useParams();
  const { team, athletes } = useTeam();
  const { state, profile } = useAppStore();
  const [params, setParams] = useSearchParams();
  const athlete = athletes.find((a) => a.id === athleteId);

  // Not on the team being looked at (a stale link, or the team was switched
  // while this was open): back to that team's roster.
  if (!team || !athlete) return <Navigate to="/staff/team" replace />;

  const asked = params.get('view');
  const section: Section = SECTIONS.includes(asked as Section) ? (asked as Section) : 'plan';
  const unread =
    unreadIn(state.messages, athleteThread(athlete.id), profile.id) + unreadIn(state.messages, aboutThread(team.id, athlete.id), profile.id);

  return (
    <>
      <div className="page-head">
        <div className="profile-head">
          {/* Their own photo once they add one; an empty outline until then. */}
          <ProfilePhoto url={athlete.photoUrl} size="xl" />
          <div className="stack-xs">
            <h1>{athlete.name}</h1>
            <span className="muted">
              {[athlete.sport, isInjured(athlete) ? injuryLabel(athlete) : 'Healthy', team.name].filter(Boolean).join(' · ')}
            </span>
            <span className="small row">
              {athlete.email && (
                <a href={`mailto:${athlete.email}`} className="link-button">
                  {athlete.email}
                </a>
              )}
              {athlete.phone && (
                <a href={`tel:${athlete.phone}`} className="link-button">
                  {athlete.phone}
                </a>
              )}
            </span>
            {/* The athlete can set this themselves; the trainer can too. */}
            <PhotoButtons athleteId={athlete.id} name={athlete.name} hasPhoto={Boolean(athlete.photoUrl)} small />
          </div>
        </div>
        <div className="page-head__actions">
          <Link to={`/staff/record?athlete=${athlete.id}`} className="btn btn--primary">
            Record a visit
          </Link>
          <Link to="/staff/team" className="btn btn--secondary">
            Back to team
          </Link>
        </div>
      </div>

      {/* Status and return date first: what changes most, and what the coach sees. */}
      <AvailabilityEditor athlete={athlete} />

      <Progress athlete={athlete} />

      <div className="profile-sections" role="group" aria-label="Show">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            aria-pressed={s === section}
            onClick={() => setParams(s === 'plan' ? {} : { view: s }, { replace: true })}
          >
            {SECTION_LABELS[s]}
            {s === 'messages' && unread > 0 && <span className="warn-text"> ({unread})</span>}
          </button>
        ))}
      </div>

      {section === 'plan' && <PlanEditor athlete={athlete} />}
      {section === 'history' && <History athlete={athlete} />}
      {/* key: a different athlete starts from their own saved note, not the last draft */}
      {section === 'notes' && <Notes key={athlete.id} athlete={athlete} />}
      {section === 'messages' && <ProfileChat key={athlete.id} athlete={athlete} team={team} />}
    </>
  );
}

/**
 * How they're doing: the recovery bar the coach also sees, how this week is
 * going, recent pain and the next visit. (Status is changed in the card above.)
 */
function Progress({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const now = new Date();
  const cleared = athlete.availability === 'cleared';
  const pace = recoveryPace(state.recovery?.[athlete.id], cleared, now);
  const assigned = athlete.assignedExerciseIds.length;
  const week = weekCompletion(athlete, state.logs, now);
  const pain = painHistory(state.logs, athlete.id, now);
  const next = upcomingAppointments(state.appointments, athlete.id, now)[0];

  return (
    <Card aria-labelledby="profile-progress">
      <h2 id="profile-progress" className="visually-hidden">
        Progress
      </h2>
      {pace ? (
        <RecoveryBar pace={pace} cleared={cleared} />
      ) : (
        // No milestone tests to measure recovery by, so the bar shows this week's exercises instead.
        <div className="recovery-bar">
          <div className="recovery-bar__head">
            <span className="strong">{assigned === 0 ? 'No plan yet' : `${week}% of this week's exercises`}</span>
            <span className="small muted">Add milestone tests under Plan (press Edit on an injury) to track recovery</span>
          </div>
          <div className="recovery-bar__track" aria-hidden="true">
            <div className="recovery-bar__fill" style={{ width: `${assigned === 0 ? 0 : week}%` }} />
          </div>
        </div>
      )}
      <dl className="profile-stats">
        <div>
          <dt>Today</dt>
          <dd>{assigned === 0 ? 'No plan' : `${doneOnDay(athlete, state.logs, now)} of ${assigned} done`}</dd>
        </div>
        <div>
          <dt>This week</dt>
          <dd className={assigned > 0 && weekStatus(week) === 'Behind' ? 'warn-text' : undefined}>
            {assigned === 0 ? 'No plan' : `${week}%, ${weekStatus(week)}`}
          </dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>
            {plural(currentStreak(athlete, state.logs, now), 'day')} (best {bestStreak(athlete, state.logs, now)})
          </dd>
        </div>
        <div>
          <dt>Pain, last {PAIN_HISTORY_DAYS} days</dt>
          <dd className={pain.highest !== null && pain.highest >= PAIN_ALERT_LEVEL ? 'warn-text' : undefined}>
            {pain.highest === null ? 'None reported' : `Highest ${pain.highest}/10`}
          </dd>
        </div>
        <div>
          <dt>Next visit</dt>
          <dd>{next ? `${formatDay(next.startsAt)}, ${formatTime(next.startsAt)}` : 'None booked'}</dd>
        </div>
      </dl>
    </Card>
  );
}

/** How many History lines show before "Show all". */
const HISTORY_SHOWN = 6;

/**
 * What's happened, newest first, in one list (recorded visits, past
 * appointments, high pain), then every injury they've had here.
 */
function History({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const [showAll, setShowAll] = useState(false);
  const exerciseName = (id: string) => state.exercises.find((e) => e.id === id)?.name ?? 'an exercise';
  const items = profileTimeline(state.visits ?? [], state.appointments, state.logs, exerciseName, athlete.id, new Date());
  const shown = showAll ? items : items.slice(0, HISTORY_SHOWN);
  const injuries = injuryHistory(state.injuryHistory, athlete.id);
  const kindLabel = { visit: 'Visit', appointment: 'Appointment', pain: 'Pain report' };

  return (
    <Card aria-labelledby="profile-history">
      <h2 id="profile-history">History</h2>
      {items.length === 0 ? (
        <p className="muted">Nothing yet. Visits you record, past appointments and high pain ratings show up here.</p>
      ) : (
        <>
          <ol className="visit-list">
            {shown.map((item) => (
              <li key={`${item.kind}-${item.at}`} className="visit-list__item">
                <span className="small muted">
                  <span className="strong">{kindLabel[item.kind]}</span> &middot; {formatSentAt(item.at)}
                  {item.pain !== null && (
                    <>
                      {' '}
                      &middot; <span className={item.pain >= PAIN_ALERT_LEVEL ? 'strong warn-text' : undefined}>Pain {item.pain}/10</span>
                    </>
                  )}
                </span>
                <span className="visit-card__summary">{item.text}</span>
                {item.detail && <span className="small muted">{item.detail}</span>}
              </li>
            ))}
          </ol>
          {items.length > HISTORY_SHOWN && (
            <Button className="btn--small" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `Show all ${items.length}`}
            </Button>
          )}
        </>
      )}

      {injuries.length > 0 && (
        <div className="stack-sm">
          <h3 className="strong">Injuries</h3>
          {injuries.map((r) => (
            <InjuryPanel key={r.caseId} record={r} />
          ))}
        </div>
      )}
    </Card>
  );
}

function InjuryPanel({ record }: { record: InjuryRecord }) {
  const days = injuryDays(record, new Date());
  const headingId = `injury-${record.caseId}`;

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="spread">
        <div className="stack-xs">
          <h3 id={headingId} className="strong">
            {record.name}
          </h3>
          <p className="small muted">
            {record.bodyRegion && <>{record.bodyRegion} &middot; </>}
            Started {formatCalendarDay(record.startDate)}
            {record.clearedAt
              ? `, cleared ${formatDay(record.clearedAt)} after ${plural(days, 'day')}`
              : `, ${plural(days, 'day')} so far`}
          </p>
        </div>
        <Badge tone={record.clearedAt ? 'outline' : 'warn'}>{record.clearedAt ? 'Cleared' : 'Active'}</Badge>
      </div>

      {record.goals.length > 0 && (
        <div className="stack-xs">
          <div className="small strong">Milestone tests</div>
          <ul className="plain-list small">
            {record.goals.map((g) => (
              <li key={g.name}>
                {g.name}: started at {formatNumber(g.baseline)} {g.unit},{' '}
                {g.latest === null ? 'no result yet' : `latest ${formatNumber(g.latest)} ${g.unit}`}, goal {formatNumber(g.target)} {g.unit}
                {g.latest !== null && g.latest >= g.target && <span className="strong"> (reached)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {record.exercises.length > 0 && (
        <div className="stack-xs">
          <div className="small strong">Exercises prescribed</div>
          <ul className="plain-list small">
            {record.exercises.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Free-text context the app doesn't track anywhere else. Only trainers can read it. */
function Notes({ athlete }: { athlete: Athlete }) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const saved = state.notes?.[athlete.id];
  const [draft, setDraft] = useState(saved?.text ?? '');
  const [busy, setBusy] = useState(false);
  const changed = draft.trim() !== (saved?.text ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await commands.saveNote(athlete.id, draft);
    setBusy(false);
    if (!result.ok) notify(result.error, 'error');
    else notify(`Notes saved for ${athlete.name}.`);
  }

  return (
    <Card aria-labelledby="profile-notes">
      <div className="stack-xs">
        <h2 id="profile-notes">Trainer notes</h2>
        <p className="muted">
          Medical history and anything else worth knowing before you treat them. Only trainers on this team see it, never the
          athlete or coaches.
        </p>
      </div>
      {state.notes === null ? (
        <p className="muted">Notes aren't available yet. Ask whoever set up the database to run the athlete notes script.</p>
      ) : (
        <form className="stack-sm" onSubmit={save}>
          <label htmlFor="profile-notes-text" className="visually-hidden">
            Notes about {athlete.name}
          </label>
          <textarea
            id="profile-notes-text"
            className="field field--area"
            rows={6}
            maxLength={NOTE_MAX_LENGTH}
            placeholder="Past surgeries, allergies, what they told you in the training room…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row">
            <Button type="submit" variant="primary" disabled={busy || !changed}>
              {busy ? 'Saving…' : 'Save notes'}
            </Button>
            {saved && (
              <span className="small muted">
                Last saved {formatSentAt(saved.updatedAt)}
                {saved.updatedBy && <> by {saved.updatedBy}</>}
              </span>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}

/** The two private conversations about this athlete: with them, or with their team's coaches. */
function ProfileChat({ athlete, team }: { athlete: Athlete; team: Team }) {
  const { state, profile } = useAppStore();
  const [withCoach, setWithCoach] = useState(false);
  const threads = { athlete: athleteThread(athlete.id), coach: aboutThread(team.id, athlete.id) };
  const unread = (thread: typeof threads.athlete) => unreadIn(state.messages, thread, profile.id);
  const firstName = athlete.name.split(' ')[0];
  // "Coach Mike - Devon": the team's coach, talking about this athlete.
  const coachLabel = coachChatLabel(team.coachNames, athlete.name);

  return (
    <div className="stack-sm">
      <div className="row" role="group" aria-label="Who to message">
        <button type="button" className="chip" aria-pressed={!withCoach} onClick={() => setWithCoach(false)}>
          {firstName}
          {unread(threads.athlete) > 0 && <span className="warn-text"> &middot; {unread(threads.athlete)} new</span>}
        </button>
        <button type="button" className="chip" aria-pressed={withCoach} onClick={() => setWithCoach(true)}>
          {coachLabel}
          {unread(threads.coach) > 0 && <span className="warn-text"> &middot; {unread(threads.coach)} new</span>}
        </button>
      </div>
      {withCoach ? (
        <AboutChat athlete={athlete} team={team} name={coachLabel} />
      ) : (
        <ChatThread thread={threads.athlete} name={athlete.name} />
      )}
    </div>
  );
}
