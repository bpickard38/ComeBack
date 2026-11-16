import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { useReturnFocus } from '../../components/useReturnFocus';
import { needsAttention, todaysVisits } from '../../domain/attention';
import { filterRoster, isInjured, isPracticing, type HealthFilter, type PracticeFilter } from '../../domain/roster';
import { searchAthletes } from '../../domain/search';
import type { Athlete } from '../../domain/types';
import { formatDay, formatTime } from '../../format';
import { useAppStore, useTeam } from '../../store/AppStore';
import { AssignForm } from './AssignForm';
import { AthleteDetail } from './AthleteDetail';
import { CoachView } from './CoachView';
import { Roster } from './Roster';
import { TeamCodes } from './TeamCodes';

/** /staff shows a different screen per role: the coach never gets medical details. */
export function StaffHome() {
  const { state } = useAppStore();
  const { team } = useTeam();
  // key: switching teams starts the roster fresh (search box, filters, open form, picked athlete).
  return state.role === 'coach' ? <CoachView /> : <TrainerView key={team?.id} />;
}

/**
 * Trainer home for the team picked in the switcher: the whole roster,
 * healthy athletes included, on the left and the selected athlete on the right.
 */
function TrainerView() {
  const { state } = useAppStore();
  const { team, athletes } = useTeam();
  const [selectedId, setSelectedId] = useState(athletes[0]?.id);
  const [assigning, setAssigning] = useState(false);
  const assignButtonRef = useReturnFocus(assigning);
  const [showingCodes, setShowingCodes] = useState(false);
  const codesButtonRef = useReturnFocus(showingCodes);
  const [query, setQuery] = useState('');
  const [health, setHealth] = useState<HealthFilter>('all');
  const [practice, setPractice] = useState<PracticeFilter>('any');

  // Filters first, then the name search within what's left.
  const filtered = filterRoster(athletes, health, practice, state.recovery);
  const shown = query.trim() ? searchAthletes(filtered, query) : filtered;

  // After switching teams, filtering or searching, the old pick may not be listed, so take the first.
  const selected = shown.find((a) => a.id === selectedId) ?? shown[0];

  const injured = athletes.filter(isInjured);
  const practicing = injured.filter((a) => isPracticing(a, state.recovery?.[a.id])).length;

  function pickHealth(next: HealthFilter) {
    setHealth(next);
    setPractice('any');
  }

  // A brand-new team has nobody on it, so the way to join is shown up front.
  // Once someone has joined it moves behind the "Join codes" button.
  const codesOpen = athletes.length === 0 || showingCodes;

  // The page column and tabs come from StaffLayout.
  return (
    <>
      <div className="page-head">
        <div className="stack-xs">
          <div className="eyebrow">Team &middot; {formatDay(new Date())}</div>
          <h1>{team ? team.name : 'Team'}</h1>
        </div>
        <div className="page-head__actions">
          {athletes.length > 0 && (
            <>
              <label htmlFor="roster-search" className="visually-hidden">
                Search {team?.name ?? 'this team'} by name
              </label>
              <input
                id="roster-search"
                type="search"
                className="field field--slim"
                placeholder="Search team"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button ref={codesButtonRef} aria-expanded={showingCodes} onClick={() => setShowingCodes((open) => !open)}>
                Invite athletes
              </Button>
            </>
          )}
          {!assigning && athletes.length > 0 && (
            <Button ref={assignButtonRef} variant="primary" onClick={() => setAssigning(true)}>
              Assign injury and exercises
            </Button>
          )}
        </div>
      </div>

      {team && codesOpen && <TeamCodes team={team} onClose={athletes.length > 0 ? () => setShowingCodes(false) : undefined} />}

      {assigning && athletes.length > 0 && (
        <AssignForm
          athletes={athletes}
          initialAthleteId={(selected ?? athletes[0]).id}
          onClose={(assignedTo) => {
            if (assignedTo) setSelectedId(assignedTo);
            setAssigning(false);
          }}
        />
      )}

      {team && athletes.length > 0 && <TeamToday athletes={athletes} teamId={team.id} />}

      {athletes.length === 0 ? (
        <p className="muted">No athletes on this team yet. Share a join link or code above to add them.</p>
      ) : (
        <>
          <div className="stack-sm">
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
            <div className="staff-grid">
              <Roster athletes={shown} selectedId={selected?.id} onSelect={setSelectedId} />
              {selected && <AthleteDetail athlete={selected} />}
            </div>
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
 * The top of the Team page: who's coming in today (each with a button to
 * record the visit) and who needs attention, before the full roster.
 */
function TeamToday({ athletes, teamId }: { athletes: Athlete[]; teamId: string }) {
  const { state, profile } = useAppStore();
  const [showAll, setShowAll] = useState(false);
  const now = new Date();
  const today = todaysVisits(state.appointments, athletes, state.visits, now);
  const attention = needsAttention({
    athletes,
    logs: state.logs,
    messages: state.messages,
    visits: state.visits,
    teamId,
    trainerId: profile.id,
    now,
  });
  const shown = showAll ? attention : attention.slice(0, ATTENTION_SHOWN);

  return (
    <div className="team-today">
      <section className="card" aria-labelledby="team-today-title">
        <h2 id="team-today-title">Today</h2>
        {today.length === 0 ? (
          <p className="muted">
            No visits booked today. When someone comes in, tap{' '}
            <Link to="/staff/record" className="link-button">
              Record
            </Link>
            .
          </p>
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

      <section className="card" aria-labelledby="team-attention-title">
        <h2 id="team-attention-title">Needs attention</h2>
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
  );
}
