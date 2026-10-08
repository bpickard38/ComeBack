import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import type { Athlete } from '../../domain/types';
import { plural } from '../../format';
import { useAppStore } from '../../store/AppStore';

interface AssignFormProps {
  athletes: Athlete[];
  initialAthleteId: string;
  /** Called with the athlete's id after a successful assignment, or null on cancel. */
  onClose: (assignedTo: string | null) => void;
}

/**
 * Trainer-only form: pick an athlete, an injury and the exercises to assign.
 * The choices come from the injuries and exercises tables (state.catalog).
 */
export function AssignForm({ athletes, initialAthleteId, onClose }: AssignFormProps) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const [athleteId, setAthleteId] = useState(initialAthleteId);
  const [injuryId, setInjuryId] = useState('');
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { injuries, exercises } = state.catalog;

  function toggleExercise(id: string) {
    setExerciseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await commands.assignPlan({ athleteId, injury: injuryId, exerciseIds });
    setSaving(false);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    const name = athletes.find((a) => a.id === athleteId)?.name;
    const injury = injuries.find((i) => i.id === injuryId)?.name;
    notify(`Assigned ${plural(exerciseIds.length, 'exercise')} to ${name} for ${injury}. Tutorial videos attached.`);
    onClose(athleteId);
  }

  return (
    <form className="card card--strong" onSubmit={submit} aria-labelledby="assign-title">
      <h2 id="assign-title">New assignment</h2>

      <ChipGroup legend="1. Athlete">
        {athletes.map((a) => (
          <Chip key={a.id} pressed={athleteId === a.id} onClick={() => setAthleteId(a.id)}>
            {a.name}
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup legend="2. Injury" hint="(trainers only)">
        {injuries.map((i) => (
          <Chip key={i.id} pressed={injuryId === i.id} onClick={() => setInjuryId(i.id)}>
            {i.name}
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup legend="3. Exercises" hint="(a tutorial video is attached to each one)">
        {exercises.map((ex) => {
          const on = exerciseIds.includes(ex.id);
          return (
            <Chip key={ex.id} pressed={on} onClick={() => toggleExercise(ex.id)}>
              {on && <span aria-hidden="true">&#10003; </span>}
              {ex.name}
            </Chip>
          );
        })}
      </ChipGroup>

      <div className="row">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Assign to athlete'}
        </Button>
        <Button onClick={() => onClose(null)}>Cancel</Button>
      </div>
    </form>
  );
}

/** A <fieldset> groups related choices so screen readers announce the group name. */
function ChipGroup({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="chip-group">
      <legend className="strong">
        {legend} {hint && <span className="muted normal">{hint}</span>}
      </legend>
      <div className="row">{children}</div>
    </fieldset>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}
