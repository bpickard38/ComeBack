import { useState } from 'react';
import { Button } from '../../components/Button';
import { useReturnFocus } from '../../components/useReturnFocus';
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
  // key: switching teams starts the roster fresh (search box, open form, picked athlete).
  return state.role === 'coach' ? <CoachView /> : <TrainerView key={team?.id} />;
}

/** Trainer home for the team picked in the switcher: roster on the left, selected athlete on the right. */
function TrainerView() {
  const { team, athletes } = useTeam();
  const [selectedId, setSelectedId] = useState(athletes[0]?.id);
  const [assigning, setAssigning] = useState(false);
  const assignButtonRef = useReturnFocus(assigning);

  const [query, setQuery] = useState('');
  // The roster search only looks at this team; an empty search shows everyone.
  const shown = query.trim() ? searchAthletes(athletes, query) : athletes;

  // After switching teams or searching, the old pick may not be listed, so take the first.
  const selected = shown.find((a) => a.id === selectedId) ?? shown[0];

  // The page column and tabs come from StaffLayout.
  return (
    <>
      <div className="page-head">
        <div className="stack-xs">
          <div className="eyebrow">{formatDay(new Date())}</div>
          <h1>{team ? `${team.name} roster` : 'Roster'}</h1>
        </div>
        {!assigning && selected && (
          <Button ref={assignButtonRef} variant="primary" onClick={() => setAssigning(true)}>
            Assign injury and exercises
          </Button>
        )}
      </div>

      {team && <TeamCodes team={team} />}

      {assigning && selected && (
        <AssignForm
          athletes={athletes}
          initialAthleteId={selected.id}
          onClose={(assignedTo) => {
            if (assignedTo) setSelectedId(assignedTo);
            setAssigning(false);
          }}
        />
      )}

      {athletes.length === 0 ? (
        <p className="muted">No athletes on this team yet. Share the athlete join code above to add them.</p>
      ) : (
        <>
          <div className="stack-xs">
            <label htmlFor="roster-search" className="strong">
              Search {team?.name ?? 'this team'}
            </label>
            <input
              id="roster-search"
              type="search"
              className="field athlete-search__field"
              placeholder="Athlete name"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {shown.length === 0 ? (
            <p className="muted" role="status">
              No athletes on this team match &ldquo;{query.trim()}&rdquo;.
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
