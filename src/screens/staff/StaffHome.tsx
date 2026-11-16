import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { useReturnFocus } from '../../components/useReturnFocus';
import { needsAttention, todaysVisits } from '../../domain/attention';
import { filterRoster, isInjured, isPracticing, type HealthFilter, type PracticeFilter } from '../../domain/roster';
import { searchAthletes } from '../../domain/search';
import { formatDay, formatTime } from '../../format';
import { useAppStore, useTeam } from '../../store/AppStore';
import { AthleteSearch } from './AthleteSearch';
import { CoachView } from './CoachView';
import { Roster } from './Roster';
import { TeamCodes } from './TeamCodes';
import { NewTeamForm } from './TeamSwitcher';

/**
 * /staff is where everyone lands. The coach gets their one screen (never
 * medical details); the trainer gets Today: who's coming in and who needs
 * a look, across all their teams.
 */
export function StaffHome() {
  const { state } = useAppStore();
  return state.role === 'coach' ? <CoachView /> : <TodayPage />;
}

/** /staff/team: the roster of the picked team. */
export function TeamPage() {
  const { team } = useTeam();
  // key: switching teams closes the invite and new-team panels.
  return <TeamRoster key={team?.id} />;
}

/** The team picker's last choice, which opens the new-team form. */
const NEW_TEAM = '__new__';

/**
 * The roster and nothing else: pick a team, search, filter, tap an athlete
 * to open their profile. The search and filters live in the address, so
 * coming back from a profile finds the list just as it was left.
 */
function TeamRoster() {
  const { state, commands } = useAppStore();
  const { team, athletes } = useTeam();
  const [showingCodes, setShowingCodes] = useState(false);
  const codesButtonRef = useReturnFocus(showingCodes);
  const [addingTeam, setAddingTeam] = useState(false);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const health = (['injured', 'healthy'].includes(params.get('show') ?? '') ? params.get('show') : 'all') as HealthFilter;
  const practice = (['practicing', 'not-practicing'].includes(params.get('practice') ?? '') ? params.get('practice') : 'any') as PracticeFilter;
  const severalTeams = state.teams.length > 1;

  // Filters first, then the name search within what's left.
  const filtered = filterRoster(athletes, health, practice, state.recovery);
  const shown = query.trim() ? searchAthletes(filtered, query) : filtered;

  const injured = athletes.filter(isInjured);
  const practicing = injured.filter((a) => isPracticing(a, state.recovery?.[a.id])).length;

  // Updates the address in place (no new history entry per keystroke); defaults are left out.
  function update(next: { q?: string; show?: HealthFilter; practice?: PracticeFilter }) {
    const merged = { q: query, show: health, practice, ...next };
    const out: Record<string, string> = {};
    if (merged.q) out.q = merged.q;
    if (merged.show !== 'all') out.show = merged.show;
    if (merged.practice !== 'any') out.practice = merged.practice;
    setParams(out, { replace: true });
  }

  function pickHealth(next: HealthFilter) {
    update({ show: next, practice: 'any' });
  }

  function setPractice(next: PracticeFilter) {
    update({ practice: next });
  }

  // A brand-new team has nobody on it, so the way to join is shown up front.
  const codesOpen = athletes.length === 0 || showingCodes;

  return (
    <>
      <div className="stack-sm">
        <div className="stack-xs">
          <div className="eyebrow">Team</div>
          <h1>{team ? team.name : 'Team'}</h1>
        </div>
        <div className="row team-actions">
          {/* One small picker holds every team plus "New team", instead of a row of team buttons. */}
          {team && (
            <>
              <label htmlFor="team-pick" className="visually-hidden">
                Switch team
              </label>
              <select
                id="team-pick"
                className="field field--slim team-pick"
                value={addingTeam ? NEW_TEAM : team.id}
                onChange={(e) => {
                  if (e.target.value === NEW_TEAM) setAddingTeam(true);
                  else {
                    setAddingTeam(false);
                    commands.selectTeam(e.target.value);
                  }
                }}
              >
                {state.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value={NEW_TEAM}>+ New team…</option>
              </select>
            </>
          )}
          {athletes.length > 0 && (
            <Button ref={codesButtonRef} aria-expanded={showingCodes} onClick={() => setShowingCodes((open) => !open)}>
              Invite
            </Button>
          )}
        </div>
      </div>

      {addingTeam && <NewTeamForm onClose={() => setAddingTeam(false)} />}

      {team && codesOpen && <TeamCodes team={team} onClose={athletes.length > 0 ? () => setShowingCodes(false) : undefined} />}

      {athletes.length === 0 ? (
        <p className="muted">No athletes on this team yet. Share a join link or code above to add them.</p>
      ) : (
        <>
          <div className="stack-sm">
            {/* One search box: across every team when there are several, otherwise this team. */}
            {severalTeams ? (
              <AthleteSearch />
            ) : (
              <>
                <label htmlFor="roster-search" className="visually-hidden">
                  Search {team?.name ?? 'this team'} by name
                </label>
                <input
                  id="roster-search"
                  type="search"
                  className="field"
                  placeholder="Search by name"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => update({ q: e.target.value })}
                />
              </>
            )}
            <div className="row" role="group" aria-label="Show athletes">
              <FilterChip pressed={health === 'all'} onClick={() => pickHealth('all')}>
                All ({athletes.length})
              </FilterChip>
              <FilterChip pressed={health === 'injured'} onClick={() => pickHealth('injured')}>
                Injured ({injured.length})
              </FilterChip>
              <FilterChip pressed={health === 'healthy'} onClick={() => pickHealth('healthy')}>
                Healthy ({athletes.length - injured.length})
              </FilterChip>
            </div>
            {health === 'injured' && (
              // Pressing the one that's on turns it back off.
              <div className="row" role="group" aria-label="Injured athletes who are">
                <FilterChip pressed={practice === 'practicing'} onClick={() => setPractice(practice === 'practicing' ? 'any' : 'practicing')}>
                  Practicing ({practicing})
                </FilterChip>
                <FilterChip
                  pressed={practice === 'not-practicing'}
                  onClick={() => setPractice(practice === 'not-practicing' ? 'any' : 'not-practicing')}
                >
                  Not practicing ({injured.length - practicing})
                </FilterChip>
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="muted" role="status">
              {query.trim() ? <>No athletes here match &ldquo;{query.trim()}&rdquo;.</> : 'No athletes in this group.'}
            </p>
          ) : (
            <Roster athletes={shown} />
          )}
        </>
      )}
    </>
  );
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip chip--slim" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

/** How many athletes "Needs attention" lists before "Show all". */
const ATTENTION_SHOWN = 5;

/**
 * The trainer's landing page: who's coming in today (each with a button to
 * record the visit) and who needs attention, across all their teams.
 */
function TodayPage() {
  const { state, profile } = useAppStore();
  const [showAll, setShowAll] = useState(false);
  const now = new Date();
  const athletes = state.athletes;
  const today = todaysVisits(state.appointments, athletes, state.visits, now);
  const attention = needsAttention({
    athletes,
    logs: state.logs,
    messages: state.messages,
    visits: state.visits,
    teamIds: state.teams.map((t) => t.id),
    trainerId: profile.id,
    now,
  });
  const shown = showAll ? attention : attention.slice(0, ATTENTION_SHOWN);

  return (
    <>
      <div className="page-head">
        <div className="stack-xs">
          <div className="eyebrow">{formatDay(now)}</div>
          <h1>Today</h1>
        </div>
        {/* The main job, first thing on the page (on a laptop there's no raised button in a bottom bar). */}
        <div className="page-head__actions">
          <Link to="/staff/record" className="btn btn--primary">
            Record a visit
          </Link>
        </div>
      </div>

      {athletes.length === 0 ? (
        <p className="muted">
          No athletes yet. Go to{' '}
          <Link to="/staff/team" className="link-button">
            Team
          </Link>{' '}
          to invite them.
        </p>
      ) : (
        <div className="team-today">
          <section className="card" aria-labelledby="today-visits-title">
            <h2 id="today-visits-title">Coming in</h2>
            {today.length === 0 ? (
              <p className="muted">No visits booked today.</p>
            ) : (
              <ul className="team-list">
                {today.map(({ appointment, athlete, recorded }) => (
                  <li key={appointment.id} className="team-list__row">
                    <span className="stack-xs">
                      <span className="strong">
                        {formatTime(appointment.startsAt)} &middot; {athlete.name}
                      </span>
                      <span className="small muted">{appointment.title}</span>
                    </span>
                    {recorded ? (
                      <span className="small strong">&#10003; Recorded</span>
                    ) : (
                      <Link to={`/staff/record?athlete=${athlete.id}`} className="btn btn--primary btn--small">
                        Record visit
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="today-attention-title">
            <h2 id="today-attention-title">Needs attention</h2>
            {attention.length === 0 ? (
              <p className="muted">Nothing urgent. No high pain, unread messages or anyone behind this week.</p>
            ) : (
              <>
                <ul className="team-list">
                  {shown.map(({ athlete, reasons }) => (
                    <li key={athlete.id} className="team-list__row">
                      <span className="stack-xs">
                        <Link to={`/staff/athletes/${athlete.id}`} className="link-button strong">
                          {athlete.name}
                        </Link>
                        <span className="small warn-text">{reasons.join(' · ')}</span>
                      </span>
                      <Link to={`/staff/record?athlete=${athlete.id}`} className="btn btn--secondary btn--small">
                        Record visit
                      </Link>
                    </li>
                  ))}
                </ul>
                {attention.length > ATTENTION_SHOWN && (
                  <Button className="btn--small" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                    {showAll ? 'Show fewer' : `Show all ${attention.length}`}
                  </Button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
