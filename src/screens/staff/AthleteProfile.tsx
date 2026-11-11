import { useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ChatThread } from '../../components/Chat';
import { ProfilePhoto } from '../../components/ProfilePhoto';
import { RecoveryBar } from '../../components/RecoveryBar';
import { useToast } from '../../components/Toast';
import { upcomingAppointments } from '../../domain/appointments';
import { availabilityLabel } from '../../domain/availability';
import {
  injuryDays,
  injuryHistory,
  NOTE_MAX_LENGTH,
  PAIN_HISTORY_DAYS,
  painHistory,
  pastAppointments,
} from '../../domain/history';
import { doneOnDay } from '../../domain/logs';
import { athleteThread, unreadIn } from '../../domain/messages';
import { PAIN_ALERT_LEVEL } from '../../domain/pain';
import { PRACTICE_PERCENT, recoveryPace } from '../../domain/recovery';
import { bestStreak, currentStreak } from '../../domain/streak';
import { aboutThread, coachChatLabel } from '../../domain/teams';
import type { Appointment, Athlete, InjuryRecord, Team } from '../../domain/types';
import { weekCompletion, weekStatus } from '../../domain/week';
import { formatCalendarDay, formatDay, formatNumber, formatSentAt, formatTime, plural } from '../../format';
import { useAppStore, useTeam } from '../../store/AppStore';
import { AboutChat } from './AboutChat';
import { AvailabilityEditor } from './AthleteDetail';
import { PlanEditor } from './PlanEditor';

/**
 * Everything the trainer has on one athlete, on one page: status, every
 * injury they've had here, recent pain, visits and private notes, with the
 * chat beside it. Opened from the roster. Trainer only: the route, and the
 * database rules behind the data, keep coaches out.
 */
export function AthleteProfile() {
  const { athleteId } = useParams();
  const { team, athletes } = useTeam();
  const athlete = athletes.find((a) => a.id === athleteId);

  // Not on the team being looked at (a stale link, or the team was switched
  // while this was open): back to that team's roster.
  if (!team || !athlete) return <Navigate to="/staff" replace />;

  return (
    <>
      <div className="page-head">
        <div className="profile-head">
          {/* Their own photo once they add one; an empty outline until then. */}
          <ProfilePhoto url={athlete.photoUrl} size="xl" />
          <div className="stack-xs">
            <div className="eyebrow">Player profile &middot; {team.name}</div>
            <h1>{athlete.name}</h1>
          </div>
        </div>
        <Link to="/staff" className="btn btn--secondary">
          Back to roster
        </Link>
      </div>

      <div className="staff-grid">
        <div className="stack-sm">
          <Recovery athlete={athlete} />
          <PlanEditor athlete={athlete} />
          <Overview athlete={athlete} />
          <InjuryHistory athlete={athlete} />
          <PainReports athlete={athlete} />
          <Visits athlete={athlete} />
          {/* key: a different athlete starts from their own saved note, not the last draft */}
          <Notes key={athlete.id} athlete={athlete} />
        </div>
        <ProfileChat key={athlete.id} athlete={athlete} team={team} />
      </div>
    </>
  );
}

/**
 * How close they are to playing again, exactly as the coach sees it, and the
 * status and return date the trainer sets for the coach.
 */
function Recovery({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const cleared = athlete.availability === 'cleared';
  const pace = recoveryPace(state.recovery?.[athlete.id], cleared, new Date());

  return (
    <Card aria-labelledby="profile-recovery">
      <div className="stack-xs">
        <h2 id="profile-recovery">Recovery</h2>
        <p className="muted">
          The coach sees this bar and these dates. It fills as milestone tests improve; {PRACTICE_PERCENT}% is back to practice
          and 100% is back to play. The dates are where {athlete.name.split(' ')[0]} is on pace to get there, so they move with
          every new result.
        </p>
      </div>
      {pace ? (
        <RecoveryBar pace={pace} cleared={cleared} />
      ) : (
        <p>No milestone tests are set, so there's no recovery bar yet.</p>
      )}
      <AvailabilityEditor athlete={athlete} />
    </Card>
  );
}

/** Where they stand today, and how to reach them. */
function Overview({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const now = new Date();
  const assigned = athlete.assignedExerciseIds.length;
  const week = weekCompletion(athlete, state.logs, now);

  return (
    <Card aria-labelledby="profile-overview">
      <h2 id="profile-overview">At a glance</h2>
      <dl className="facts">
        <div>
          <dt>Status shown to the coach</dt>
          <dd>
            {availabilityLabel(athlete.availability)}
            {athlete.expectedReturn && <>, expected back {formatCalendarDay(athlete.expectedReturn)}</>}
          </dd>
        </div>
        <div>
          <dt>Sport</dt>
          <dd>{athlete.sport || 'Not set'}</dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd>{assigned === 0 ? 'No exercises assigned' : `${doneOnDay(athlete, state.logs, now)} of ${assigned} done`}</dd>
        </div>
        <div>
          <dt>This week</dt>
          <dd>{assigned === 0 ? 'No plan' : `${week}% logged, ${weekStatus(week)}`}</dd>
        </div>
        <div>
          <dt>Streak of full days</dt>
          <dd>
            {plural(currentStreak(athlete, state.logs, now), 'day')} (best {bestStreak(athlete, state.logs, now)})
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{athlete.email ? <a href={`mailto:${athlete.email}`}>{athlete.email}</a> : 'Not on file'}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{athlete.phone ? <a href={`tel:${athlete.phone}`}>{athlete.phone}</a> : 'Not on file'}</dd>
        </div>
      </dl>
    </Card>
  );
}

/** Every injury on file, active first, each with its plan and milestone tests. */
function InjuryHistory({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const records = injuryHistory(state.injuryHistory, athlete.id);
  const cleared = records.filter((r) => r.clearedAt).length;

  return (
    <Card aria-labelledby="profile-injuries">
      <div className="stack-xs">
        <h2 id="profile-injuries">Injury history</h2>
        <p className="muted">
          {records.length === 0
            ? 'No injuries on file.'
            : `${records.length - cleared} active, ${cleared} cleared. Coaches can't see any of this.`}
        </p>
      </div>
      {records.map((r) => (
        <InjuryPanel key={r.caseId} record={r} />
      ))}
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

/** High pain ratings from the last two weeks, with the exercise that caused each. */
function PainReports({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const history = painHistory(state.logs, athlete.id, new Date());
  const exerciseName = (id: string) => state.exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  return (
    <Card aria-labelledby="profile-pain">
      <div className="stack-xs">
        <h2 id="profile-pain">Pain reported</h2>
        <p className="muted">
          {history.highest === null
            ? `No pain ratings in the last ${PAIN_HISTORY_DAYS} days.`
            : `Last ${PAIN_HISTORY_DAYS} days: ${plural(history.rated, 'rating')}, highest ${history.highest} out of 10.`}
        </p>
      </div>
      {history.highest !== null &&
        (history.high.length === 0 ? (
          <p>Nothing at {PAIN_ALERT_LEVEL} or above.</p>
        ) : (
          <ul className="plain-list">
            {history.high.map((l) => (
              <li key={`${l.exerciseId}-${l.loggedAt}`}>
                <span className="strong warn-text">Pain {l.pain}</span> on {exerciseName(l.exerciseId)}{' '}
                <span className="small muted">{formatSentAt(l.loggedAt)}</span>
              </li>
            ))}
          </ul>
        ))}
    </Card>
  );
}

/** Upcoming and past visits. Booking is under Plan and progress. */
function Visits({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const now = new Date();
  const upcoming = upcomingAppointments(state.appointments, athlete.id, now);
  const past = pastAppointments(state.appointments, athlete.id, now);

  return (
    <Card aria-labelledby="profile-visits">
      <h2 id="profile-visits">Appointments</h2>
      {upcoming.length === 0 && past.length === 0 && <p className="muted">No appointments yet. Schedule one under Plan and progress.</p>}
      <VisitList title="Upcoming" visits={upcoming} />
      <VisitList title="Past" visits={past} />
    </Card>
  );
}

function VisitList({ title, visits }: { title: string; visits: Appointment[] }) {
  if (visits.length === 0) return null;
  return (
    <div className="stack-xs">
      <div className="small strong">{title}</div>
      <ul className="plain-list">
        {visits.map((v) => (
          <li key={v.id}>
            {v.title}{' '}
            <span className="small muted">
              {formatDay(v.startsAt)}, {formatTime(v.startsAt)}
              {v.location && <> &middot; {v.location}</>}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
