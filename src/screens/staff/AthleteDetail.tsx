import { Card } from '../../components/Card';
import { MessageBox, MessageList } from '../../components/MessageBox';
import { useToast } from '../../components/Toast';
import { AVAILABILITY_OPTIONS } from '../../domain/availability';
import { dayKey, daysThisWeek } from '../../domain/dates';
import { findLog } from '../../domain/logs';
import { athleteThread, messagesIn } from '../../domain/messages';
import { isHighPain } from '../../domain/pain';
import type { Athlete, Availability } from '../../domain/types';
import { formatTime, formatWeekday } from '../../format';
import { exerciseById, useAppStore } from '../../store/AppStore';

/** Trainer's view of one athlete: coach-facing status, messages, and this week's log. */
export function AthleteDetail({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const fromCoach = messagesIn(state.messages, 'coach-trainer');

  return (
    <Card aria-labelledby="detail-name">
      <div className="stack-xs">
        <h2 id="detail-name">{athlete.name}</h2>
        <p className="muted">
          {athlete.sport} &middot; {athlete.injury}
        </p>
      </div>
      <AvailabilityEditor athlete={athlete} />
      {/* key resets the message draft when a different athlete is selected */}
      <MessageBox
        key={athlete.id}
        thread={athleteThread(athlete.id)}
        recipient={athlete.name}
        title="Conversation"
      />
      <MessageList title="From coach" messages={fromCoach} />
      <WeekGrid athlete={athlete} />
    </Card>
  );
}

/** What the coach sees about this athlete. Only the trainer can change it. */
function AvailabilityEditor({ athlete }: { athlete: Athlete }) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const dateId = `return-${athlete.id}`;

  async function save(availability: Availability, expectedReturn: string | null, announce: boolean) {
    const result = await commands.setAvailability(athlete.id, availability, expectedReturn);
    if (!result.ok) notify(result.error, 'error');
    else if (announce) {
      const label = AVAILABILITY_OPTIONS.find((o) => o.value === availability)?.label;
      notify(`The coach now sees ${athlete.name} as ${label}.`);
    }
  }

  return (
    <fieldset className="chip-group panel">
      <legend className="strong">Status shown to the coach</legend>
      <p className="small muted">The coach sees only this and the return date, not the injury or exercises.</p>
      <div className="row">
        {AVAILABILITY_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={athlete.availability === o.value}
            onClick={() => save(o.value, athlete.expectedReturn, true)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {athlete.availability !== 'cleared' && (
        <div className="stack-xs">
          <label htmlFor={dateId} className="small strong">
            Expected back
          </label>
          <input
            id={dateId}
            type="date"
            className="field field--date"
            value={athlete.expectedReturn ?? ''}
            onChange={(e) => save(athlete.availability, e.target.value || null, false)}
          />
        </div>
      )}
    </fieldset>
  );
}

/** Monday-to-today table: Done (with time and pain), Missed, or Pending. */
function WeekGrid({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const now = new Date();
  const today = dayKey(now);
  const days = daysThisWeek(now);

  if (athlete.assignedExerciseIds.length === 0) {
    return <p className="muted">No exercises assigned yet.</p>;
  }

  return (
    // The wrapper scrolls sideways on narrow phones late in the week.
    <div className="table-wrap">
      <table className="week">
        <caption className="visually-hidden">This week&rsquo;s exercise log for {athlete.name}</caption>
        <thead>
          <tr>
            <th scope="col">Exercise</th>
            {days.map((d) => (
              <th key={dayKey(d)} scope="col">
                {formatWeekday(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {athlete.assignedExerciseIds.map((id) => {
            const ex = exerciseById(state, id);
            return (
              <tr key={id}>
                <th scope="row">
                  <div className="strong">{ex.name}</div>
                  <div className="muted small">{ex.prescription}</div>
                </th>
                {days.map((d) => {
                  const log = findLog(state.logs, athlete.id, id, d);
                  if (log) {
                    return (
                      <td key={dayKey(d)}>
                        <div className="strong">Done {formatTime(log.loggedAt)}</div>
                        {log.pain !== undefined && (
                          <div className={isHighPain(log.pain) ? 'strong warn-text' : 'muted'}>Pain {log.pain}</div>
                        )}
                      </td>
                    );
                  }
                  return dayKey(d) === today ? (
                    <td key={dayKey(d)} className="muted">
                      Pending
                    </td>
                  ) : (
                    <td key={dayKey(d)} className="strong warn-text">
                      Missed
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
