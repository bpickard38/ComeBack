import { useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { useReturnFocus } from '../../components/useReturnFocus';
import { filterRoster, isInjured, isPracticing, type HealthFilter, type PracticeFilter } from '../../domain/roster';
import { searchAthletes } from '../../domain/search';
import { formatDay } from '../../format';
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
          <div className="eyebrow">{formatDay(new Date())}</div>
          <h1>{team ? `${team.name} roster` : 'Roster'}</h1>
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
                Join codes
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
