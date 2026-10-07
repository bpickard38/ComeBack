import { useState } from 'react';
import { Button } from '../../components/Button';
import { useReturnFocus } from '../../components/useReturnFocus';
import { formatDay } from '../../format';
import { useAppStore } from '../../store/AppStore';
import { AssignForm } from './AssignForm';
import { AthleteDetail } from './AthleteDetail';
import { CoachView } from './CoachView';
import { Roster } from './Roster';

/** /staff shows a different screen per role: the coach never gets medical details. */
export function StaffHome() {
  const { state } = useAppStore();
  return state.role === 'coach' ? <CoachView /> : <TrainerView />;
}

/** Trainer home: roster on the left, selected athlete on the right. */
function TrainerView() {
  const { state } = useAppStore();
  const [selectedId, setSelectedId] = useState(state.athletes[0]?.id);
  const [assigning, setAssigning] = useState(false);
  const assignButtonRef = useReturnFocus(assigning);

  const selected = state.athletes.find((a) => a.id === selectedId) ?? state.athletes[0];

  return (
    <div className="column column--staff">
      <div className="page-head">
        <div className="stack-xs">
          <div className="eyebrow">{formatDay(new Date())}</div>
          <h1>Roster</h1>
          <p className="muted">Trainer view. You can assign injuries and exercises.</p>
        </div>
        {!assigning && (
          <Button ref={assignButtonRef} variant="primary" onClick={() => setAssigning(true)}>
            Assign injury and exercises
          </Button>
        )}
      </div>

      {assigning && selected && (
        <AssignForm
          athletes={state.athletes}
          initialAthleteId={selected.id}
          onClose={(assignedTo) => {
            if (assignedTo) setSelectedId(assignedTo);
            setAssigning(false);
          }}
        />
      )}

      {state.athletes.length === 0 ? (
        <p className="muted">No athletes on the roster yet.</p>
      ) : (
        <div className="staff-grid">
          <Roster athletes={state.athletes} selectedId={selected?.id} onSelect={setSelectedId} />
          {selected && <AthleteDetail athlete={selected} />}
        </div>
      )}
    </div>
  );
}
