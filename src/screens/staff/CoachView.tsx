import { Card } from '../../components/Card';
import { ChatThread } from '../../components/Chat';
import { AVAILABILITY_OPTIONS, availabilityLabel } from '../../domain/availability';
import { messagesIn } from '../../domain/messages';
import { lastWeek, progressStreak, thisWeek, weekStatus, type AthleteProgress } from '../../domain/progress';
import type { Athlete, Availability } from '../../domain/types';
import { ON_TRACK_PERCENT } from '../../domain/week';
import { formatCalendarDay, formatDay, plural } from '../../format';
import { useAppStore } from '../../store/AppStore';

// Show who's out first, then limited, then cleared.
const ORDER: Record<Availability, number> = { out: 0, limited: 1, cleared: 2 };

/**
 * The coach sees whether each athlete can play, when they're expected
 * back, and how the week is going in counts only. Diagnoses, exercises,
 * pain and test numbers stay with the trainer.
 */
export function CoachView() {
  const { state } = useAppStore();
  const athletes = [...state.athletes].sort((a, b) => ORDER[a.availability] - ORDER[b.availability]);
  // Use the trainer's name once they've written; until then, a generic one.
  const trainerName =
    messagesIn(state.messages, 'coach-trainer').find((m) => m.from === 'Trainer')?.senderName ?? 'Athletic trainer';

  return (
    <div className="column column--staff">
      <div className="stack-xs">
        <div className="eyebrow">{formatDay(new Date())}</div>
        <h1>Team availability</h1>
        <p className="muted">Injury details stay with the trainer.</p>
      </div>

      <div className="staff-grid">
        <div className="stack-sm">
          <Card className="card--flush" aria-label="Availability">
            {athletes.length === 0 ? (
              <p className="muted pad">No athletes on the roster yet.</p>
            ) : (
              <div className="table-wrap table-wrap--flush">
                <table className="week">
                  <caption className="visually-hidden">Team availability</caption>
                  <thead>
                    <tr>
                      <th scope="col">Athlete</th>
                      <th scope="col">Status</th>
                      <th scope="col">Expected back</th>
                    </tr>
                  </thead>
                  <tbody>
                    {athletes.map((a) => (
                      <tr key={a.id}>
                        <th scope="row">
                          <div className="strong">{a.name}</div>
                          <div className="muted small">{a.sport}</div>
                        </th>
                        <td className={a.availability === 'out' ? 'strong warn-text' : 'strong'}>
                          {availabilityLabel(a.availability)}
                        </td>
                        <td>
                          {a.availability === 'cleared'
                            ? 'Available now'
                            : a.expectedReturn
                              ? formatCalendarDay(a.expectedReturn)
                              : 'Not set'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <dl className="legend-list small pad">
              {AVAILABILITY_OPTIONS.map((o) => (
                <div key={o.value}>
                  <dt className="strong">{o.label}</dt>
                  <dd className="muted">{o.meaning}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <WeeklyProgress athletes={athletes} progress={state.progress} />
        </div>

        <ChatThread thread="coach-trainer" name={trainerName} detail="Athletic trainer. Only you two see this." />
      </div>
    </div>
  );
}

/**
 * This week's rehab work per athlete, in counts: exercises done, days
 * complete, streak, goals. Everything is in words, not just color.
 */
function WeeklyProgress({ athletes, progress }: { athletes: Athlete[]; progress: AthleteProgress[] | null }) {
  const now = new Date();
  const byAthlete = new Map((progress ?? []).map((p) => [p.athleteId, p]));

  return (
    <Card className="card--flush" aria-label="Weekly progress">
      <div className="stack-xs pad">
        <h2>This week's progress</h2>
        <p className="muted small">
          How much of the rehab plan got done, Monday to today, and whether milestone goals moved. No medical details.
        </p>
      </div>
      {progress === null ? (
        <p className="muted pad">Weekly progress isn't available yet. Ask whoever set up the database to run the weekly summary script.</p>
      ) : athletes.length === 0 ? (
        <p className="muted pad">No athletes on the roster yet.</p>
      ) : (
        <div className="table-wrap table-wrap--flush">
          <table className="week">
            <caption className="visually-hidden">This week's progress</caption>
            <thead>
              <tr>
                <th scope="col">Athlete</th>
                <th scope="col">This week</th>
                <th scope="col">Days complete</th>
                <th scope="col">Streak</th>
                <th scope="col">Goals</th>
                <th scope="col">Last week</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const p = byAthlete.get(a.id);
                if (!p || p.assigned === 0) {
                  return (
                    <tr key={a.id}>
                      <th scope="row" className="strong">{a.name}</th>
                      <td colSpan={5} className="muted">No rehab plan right now</td>
                    </tr>
                  );
                }
                const week = thisWeek(p, now);
                const previous = lastWeek(p, now);
                const status = weekStatus(week.percent);
                const streak = progressStreak(p, now);
                return (
                  <tr key={a.id}>
                    <th scope="row" className="strong">{a.name}</th>
                    <td>
                      <div className="strong">{week.percent}%</div>
                      <div className={status === 'Behind' ? 'small strong warn-text' : 'small strong'}>{status}</div>
                    </td>
                    <td>
                      {week.fullDays} of {week.days}
                    </td>
                    <td>{plural(streak, 'day')}</td>
                    <td>
                      {p.goalsTotal === 0 ? (
                        <span className="muted">None set</span>
                      ) : (
                        <>
                          <div>
                            {p.goalsReached} of {p.goalsTotal} reached
                          </div>
                          <div className="small muted">
                            {p.goalsImproved > 0 ? `${p.goalsImproved} improved this week` : 'No change this week'}
                          </div>
                        </>
                      )}
                    </td>
                    <td>{previous.possible === 0 ? <span className="muted">No plan</span> : `${previous.percent}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small pad">
        On track means {ON_TRACK_PERCENT}% or more of this week's exercises are logged. Days complete counts days where every
        exercise on the plan was logged. Last week is the full Monday to Sunday.
      </p>
    </Card>
  );
}
