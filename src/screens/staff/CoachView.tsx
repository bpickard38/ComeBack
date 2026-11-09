import type { ReactNode } from 'react';
import { Card } from '../../components/Card';
import { ChatThread } from '../../components/Chat';
import { AVAILABILITY_OPTIONS, availabilityLabel } from '../../domain/availability';
import { messagesIn } from '../../domain/messages';
import { lastWeek, thisWeek, weekStatus, type AthleteProgress } from '../../domain/progress';
import type { Athlete, Availability } from '../../domain/types';
import { ON_TRACK_PERCENT } from '../../domain/week';
import { formatCalendarDay } from '../../format';
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
    messagesIn(state.messages, 'coach-trainer').find((m) => m.from === 'Trainer')?.senderName ?? 'Trainer';

  return (
    <div className="column column--staff">
      <div className="staff-grid staff-grid--coach">
        <div className="stack-sm">
          <Card className="card--flush card--coach card--coach-status" aria-label="Availability">
            <div className="coach-card__head">
              <h2>Status</h2>
            </div>
            {athletes.length === 0 ? (
              <p className="muted pad">No athletes on the roster yet.</p>
            ) : (
              <div className="table-wrap table-wrap--flush">
                <table className="week week--coach">
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
                        <td>
                          <StatusText tone={a.availability}>{availabilityLabel(a.availability)}</StatusText>
                        </td>
                        <td>
                          {a.availability === 'cleared'
                            ? <StatusText tone="cleared">Available now</StatusText>
                            : a.expectedReturn
                              ? <span className="coach-date">{formatCalendarDay(a.expectedReturn)}</span>
                              : <StatusText tone="caution">Not set</StatusText>}
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
                  <dt><StatusText tone={o.value}>{o.label}</StatusText></dt>
                  <dd className="muted">{o.meaning}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <WeeklyProgress athletes={athletes} progress={state.progress} />
        </div>

        <ChatThread thread="coach-trainer" name={trainerName} detail="Athletic Trainer" />
      </div>
    </div>
  );
}

/**
 * This week's rehab work per athlete, in counts: exercises done, days
 * complete, and goals. Status stays readable in text as well as color.
 */
function WeeklyProgress({ athletes, progress }: { athletes: Athlete[]; progress: AthleteProgress[] | null }) {
  const now = new Date();
  const byAthlete = new Map((progress ?? []).map((p) => [p.athleteId, p]));

  return (
    <Card className="card--flush card--coach" aria-label="Weekly progress">
      <div className="coach-card__head">
        <h2>Progress</h2>
      </div>
      {progress === null ? (
        <p className="muted pad">Weekly progress isn't available yet. Ask whoever set up the database to run the weekly summary script.</p>
      ) : athletes.length === 0 ? (
        <p className="muted pad">No athletes on the roster yet.</p>
      ) : (
        <div className="table-wrap table-wrap--flush">
          <table className="week week--coach">
            <caption className="visually-hidden">This week's progress</caption>
            <thead>
              <tr>
                <th scope="col">Athlete</th>
                <th scope="col">This week</th>
                <th scope="col">Days complete</th>
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
                      <td colSpan={4} className="muted">No rehab plan right now</td>
                    </tr>
                  );
                }
                const week = thisWeek(p, now);
                const previous = lastWeek(p, now);
                const status = weekStatus(week.percent);
                return (
                  <tr key={a.id}>
                    <th scope="row" className="strong">{a.name}</th>
                    <td>
                      <div className="strong">{week.percent}%</div>
                      <StatusText tone={status === 'Behind' ? 'behind' : 'on-track'}>{status}</StatusText>
                    </td>
                    <td>
                      {week.fullDays} of {week.days}
                    </td>
                    <td>
                      {p.goalsTotal === 0 ? (
                        <span className="muted">None set</span>
                      ) : (
                        <>
                          <div className="strong">{p.goalsReached} of {p.goalsTotal} reached</div>
                          <div className="small muted">
                            {p.goalsImproved > 0
                              ? <span className="coach-improved">{p.goalsImproved} improved this week</span>
                              : 'No change this week'}
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
      <div className="coach-progress-key pad" role="group" aria-label="Weekly progress key">
        <span><StatusText tone="on-track">On track</StatusText> {ON_TRACK_PERCENT}% or more logged</span>
        <span><StatusText tone="behind">Behind</StatusText> Under {ON_TRACK_PERCENT}% logged</span>
      </div>
    </Card>
  );
}

type StatusTone = Availability | 'on-track' | 'behind' | 'caution';

function StatusText({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const classTone = tone === 'out' ? 'danger' : tone === 'limited' ? 'caution' : tone;
  return <span className={`status-text status-text--${classTone}`}>{children}</span>;
}
