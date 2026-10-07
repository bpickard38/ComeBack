import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { EXERCISES, INJURIES } from '../../data/seed';
import type { Athlete } from '../../domain/types';
import { plural } from '../../format';
import { useAppStore } from '../../store/AppStore';

interface AssignFormProps {
  athletes: Athlete[];
  initialAthleteId: string;
  /** Called with the athlete's id after a successful assignment, or null on cancel. */
  onClose: (assignedTo: string | null) => void;
}

/** Trainer-only form: pick an athlete, an injury and the exercises to assign. */
export function AssignForm({ athletes, initialAthleteId, onClose }: AssignFormProps) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const [athleteId, setAthleteId] = useState(initialAthleteId);
  const [injury, setInjury] = useState('');
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);

  function toggleExercise(id: string) {
    setExerciseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = commands.assignPlan({ athleteId, injury, exerciseIds });
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    const name = athletes.find((a) => a.id === athleteId)?.name;
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
        {INJURIES.map((name) => (
          <Chip key={name} pressed={injury === name} onClick={() => setInjury(name)}>
            {name}
          </Chip>
        ))}
      </ChipGroup>

      <ChipGroup legend="3. Exercises" hint="(a tutorial video is attached to each one)">
        {EXERCISES.map((ex) => {
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
        <Button type="submit" variant="primary">
          Assign to athlete
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
