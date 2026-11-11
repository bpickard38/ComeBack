import { useState, type ReactNode } from 'react';
import { Card } from '../../components/Card';
import { ChatThread } from '../../components/Chat';
import { RecoveryBar } from '../../components/RecoveryBar';
import { AVAILABILITY_OPTIONS, availabilityLabel } from '../../domain/availability';
import { messagesIn, unreadIn } from '../../domain/messages';
import { lastWeek, thisWeek, weekStatus, type AthleteProgress } from '../../domain/progress';
import { PRACTICE_PERCENT, recoveryPace } from '../../domain/recovery';
import type { Athlete, Availability, Team } from '../../domain/types';
import { ON_TRACK_PERCENT } from '../../domain/week';
import { formatCalendarDay } from '../../format';
import { aboutThread, coachThread } from '../../domain/teams';
import { useAppStore, useTeam } from '../../store/AppStore';
import { AboutChat } from './AboutChat';
import { TeamSwitcher } from './TeamSwitcher';

// Show who's out first, then limited, then cleared.
const ORDER: Record<Availability, number> = { out: 0, limited: 1, cleared: 2 };

/**
 * The coach sees whether each athlete can play, when they're expected
 * back, and how the week is going in counts only. Diagnoses, exercises,
 * pain and test numbers stay with the trainer.
 */
export function CoachView() {
  const { state } = useAppStore();
  // A coach on several teams sees one at a time, each with its own trainer chat.
  const { team, athletes: teamAthletes } = useTeam();
  const athletes = [...teamAthletes].sort((a, b) => ORDER[a.availability] - ORDER[b.availability]);
  const thread = coachThread(team?.id ?? '');
  // Use the trainer's name once they've written; until then, a generic one.
  const trainerName =
    messagesIn(state.messages, thread).find((m) => m.from === 'Trainer')?.senderName ?? 'Trainer';

  return (
    <div className="column column--staff">
      <TeamSwitcher />
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
                      <th scope="col">Recovery</th>
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
                          <RecoveryCell athlete={a} />
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
            <p className="small muted pad">
              Recovery fills as the athlete passes their trainer's tests: {PRACTICE_PERCENT}% is back to practice (the mark on the
              bar) and 100% is back to play. The dates are where they're on pace to get there, and move with every new result.
              &ldquo;Expected back&rdquo; is the trainer's own estimate.
            </p>
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

        {/* key starts over on the whole-team conversation when you switch teams */}
        {team && <CoachChat key={team.id} team={team} athletes={athletes} trainerName={trainerName} />}
      </div>
    </div>
  );
}

/** One athlete's recovery bar and projected dates. A percentage only: no tests or values reach the coach. */
function RecoveryCell({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  if (state.recovery === null) return <span className="muted">Not available yet</span>;
  const cleared = athlete.availability === 'cleared';
  const pace = recoveryPace(state.recovery[athlete.id], cleared, new Date());
  return pace ? <RecoveryBar pace={pace} cleared={cleared} /> : <span className="muted">No milestones set</span>;
}

/**
 * The coach's messages with the trainer: one conversation for the whole
 * team, plus a private one about each athlete, picked from a list. The
 * athlete can't see the one about them.
 */
function CoachChat({ team, athletes, trainerName }: { team: Team; athletes: Athlete[]; trainerName: string }) {
  const { state, profile } = useAppStore();
  const [aboutId, setAboutId] = useState(''); // '' is the whole-team conversation
  const about = athletes.find((a) => a.id === aboutId);
  const unread = (athleteId: string) => unreadIn(state.messages, aboutThread(team.id, athleteId), profile.id);
  const teamUnread = unreadIn(state.messages, coachThread(team.id), profile.id);
  const newLabel = (count: number) => (count > 0 ? ` (${count} new)` : '');
  // Conversations with something new, other than the one on screen.
  const waiting = athletes.filter((a) => a.id !== aboutId && unread(a.id) > 0);

  return (
    <div className="stack-sm">
      <div className="stack-xs">
        <label htmlFor="coach-chat-about" className="strong">
          Message the trainer about
        </label>
        <select id="coach-chat-about" className="field" value={about ? about.id : ''} onChange={(e) => setAboutId(e.target.value)}>
          <option value="">The whole team{newLabel(about ? teamUnread : 0)}</option>
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {newLabel(a.id === aboutId ? 0 : unread(a.id))}
            </option>
          ))}
        </select>
        {waiting.length > 0 && (
          <p className="small strong warn-text" role="status">
            New from the trainer about {waiting.map((a) => a.name).join(', ')}
          </p>
        )}
      </div>
      {about ? (
        <AboutChat
          key={about.id}
          athlete={about}
          team={team}
          name={trainerName}
          detail={`Athletic Trainer, about ${about.name}. ${about.name.split(' ')[0]} can't see this.`}
        />
      ) : (
        <ChatThread thread={coachThread(team.id)} name={trainerName} detail="Athletic Trainer" />
      )}
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
