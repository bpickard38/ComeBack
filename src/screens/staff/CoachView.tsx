import { useState, type ReactNode } from 'react';
import { Card } from '../../components/Card';
import { ChatThread } from '../../components/Chat';
import { RecoveryBar } from '../../components/RecoveryBar';
import { AVAILABILITY_OPTIONS, availabilityLabel } from '../../domain/availability';
import { unreadIn } from '../../domain/messages';
import { lastWeek, thisWeek, weekStatus, type AthleteProgress } from '../../domain/progress';
import { PRACTICE_PERCENT, recoveryPace } from '../../domain/recovery';
import { onCoachStatus } from '../../domain/roster';
import { searchAthletes } from '../../domain/search';
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
  // A coach on several teams sees one at a time, each with its own trainer chats.
  const { team } = useTeam();
  return (
    <div className="column column--staff">
      <TeamSwitcher />
      {/* key: switching teams starts back on the whole-team conversation */}
      {team && <CoachTeam key={team.id} team={team} />}
    </div>
  );
}

function CoachTeam({ team }: { team: Team }) {
  const { state } = useAppStore();
  const { athletes: teamAthletes } = useTeam();
  // Which athlete the chat is about; '' is the whole-team conversation.
  const [aboutId, setAboutId] = useState('');
  const now = new Date();

  // Status is for athletes the coach has to plan around: hurt now, or cleared
  // in the last couple of weeks. Before the recovery script is run there's no
  // way to tell, so everyone is listed.
  const listed = teamAthletes.filter((a) => state.recovery === null || onCoachStatus(a, state.recovery[a.id], now));
  const athletes = [...listed].sort((a, b) => ORDER[a.availability] - ORDER[b.availability]);
  const healthy = teamAthletes.length - listed.length;

  /** From a Status row: open the trainer conversation about that athlete. */
  function messageAbout(athleteId: string) {
    setAboutId(athleteId);
    document.getElementById('coach-chat')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return (
      <div className="staff-grid staff-grid--coach">
        <div className="stack-sm">
          <Card className="card--flush card--coach card--coach-status" aria-label="Availability">
            <div className="coach-card__head">
              <h2>Status</h2>
            </div>
            {athletes.length === 0 ? (
              <p className="muted pad">
                {teamAthletes.length === 0 ? 'No athletes on the roster yet.' : 'Nobody is injured or recently cleared.'}
              </p>
            ) : (
              <div className="table-wrap table-wrap--flush">
                <table className="week week--coach">
                  <caption className="visually-hidden">Athletes who are injured or were recently cleared</caption>
                  <thead>
                    <tr>
                      <th scope="col">Athlete</th>
                      <th scope="col">Status</th>
                      <th scope="col">Recovery</th>
                      <th scope="col">Expected back</th>
                      <th scope="col">
                        <span className="visually-hidden">Message the trainer</span>
                      </th>
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
                        <td>
                          <button
                            type="button"
                            className="btn btn--secondary btn--small"
                            aria-pressed={aboutId === a.id}
                            aria-label={`Message the trainer about ${a.name}`}
                            onClick={() => messageAbout(a.id)}
                          >
                            Message
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {healthy > 0 && (
              <p className="small muted pad">
                {healthy} healthy {healthy === 1 ? 'athlete isn’t' : 'athletes aren’t'} listed. Search for anyone by name to
                message the trainer about them.
              </p>
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

        <CoachChat team={team} athletes={teamAthletes} aboutId={aboutId} onPick={setAboutId} />
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

/** How many names show under the search box at once; typing more narrows it. */
const MAX_RESULTS = 3;

/**
 * The coach's messages with the trainer: one conversation for the whole
 * team, plus a private one about each athlete. The coach finds an athlete by
 * typing their name (or presses Message on a Status row) and that athlete's
 * conversation opens. The athlete can't see the one about them.
 */
function CoachChat({
  team,
  athletes,
  aboutId,
  onPick,
}: {
  team: Team;
  athletes: Athlete[];
  aboutId: string;
  onPick: (athleteId: string) => void;
}) {
  const { state, profile } = useAppStore();
  const [query, setQuery] = useState('');
  const about = athletes.find((a) => a.id === aboutId);
  const unread = (athleteId: string) => unreadIn(state.messages, aboutThread(team.id, athleteId), profile.id);
  const teamUnread = unreadIn(state.messages, coachThread(team.id), profile.id);
  // Conversations with something new, other than the one on screen.
  const waiting = athletes.filter((a) => a.id !== aboutId && unread(a.id) > 0);

  const typed = query.trim();
  const matches = typed ? searchAthletes(athletes, typed) : [];

  function pick(athleteId: string) {
    onPick(athleteId);
    setQuery('');
  }

  return (
    <div id="coach-chat" className="stack-sm">
      <div className="stack-xs">
        <label htmlFor="coach-chat-about" className="strong">
          Message the trainer about
        </label>
        <div className="row">
          <div className="athlete-search__box">
            <input
              id="coach-chat-about"
              type="search"
              className="field field--slim"
              placeholder="Athlete name"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            />
            {typed && (
              <div className="card card--flush athlete-search__results">
                {matches.slice(0, MAX_RESULTS).map((a) => (
                  <button key={a.id} type="button" className="roster-row" onClick={() => pick(a.id)}>
                    <span className="roster-row__name">{a.name}</span>
                    {unread(a.id) > 0 && <span className="small strong warn-text">{unread(a.id)} new</span>}
                  </button>
                ))}
                {/* Read out by screen readers as the list changes. */}
                <p className="small muted athlete-search__status" role="status">
                  {matches.length === 0
                    ? `No athletes match "${typed}"`
                    : matches.length > MAX_RESULTS
                      ? `${matches.length - MAX_RESULTS} more. Keep typing to narrow it down.`
                      : matches.length === 1
                        ? '1 match'
                        : `${matches.length} matches`}
                </p>
              </div>
            )}
          </div>
          <button type="button" className="chip" aria-pressed={!about} onClick={() => pick('')}>
            Whole team
            {about && teamUnread > 0 && <span className="warn-text"> &middot; {teamUnread} new</span>}
          </button>
          {about && (
            <span className="chip" aria-current="true">
              {about.name}
            </span>
          )}
        </div>
        {waiting.length > 0 && (
          <div className="row small" role="status">
            <span className="strong warn-text">New from the trainer about</span>
            {waiting.map((a) => (
              <button key={a.id} type="button" className="chip chip--slim" onClick={() => pick(a.id)}>
                {a.name} ({unread(a.id)})
              </button>
            ))}
          </div>
        )}
      </div>
      {about ? (
        <AboutChat key={about.id} athlete={about} team={team} name={`Trainer - ${about.name.split(' ')[0]}`} detail="Athletic Trainer" />
      ) : (
        <ChatThread thread={coachThread(team.id)} name="Trainer - Team" detail="Athletic Trainer" />
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
