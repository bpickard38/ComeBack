import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useToast } from '../../components/Toast';
import { useReturnFocus } from '../../components/useReturnFocus';
import { currentValue, isGoalReached } from '../../domain/goals';
import type { Athlete, AthleteInjury, Exercise, MilestoneTest } from '../../domain/types';
import { formatNumber } from '../../format';
import { testsFor, useAppStore } from '../../store/AppStore';
import { AppointmentScheduler } from './AppointmentScheduler';
import { AssignForm } from './AssignForm';

/**
 * Everything the trainer can change about an athlete's rehab, in one place
 * on their profile: add an injury or exercises, change sets and reps, take
 * an exercise off, record a test result, move a goal, clear an injury, and
 * book visits. The athlete sees each change within 30 seconds.
 */
export function PlanEditor({ athlete }: { athlete: Athlete }) {
  const [assigning, setAssigning] = useState(false);
  const assignButtonRef = useReturnFocus(assigning);

  return (
    <Card aria-labelledby="profile-plan">
      <div className="spread">
        <div className="stack-xs">
          <h2 id="profile-plan">Plan and progress</h2>
          <p className="muted">
            Press Edit on an injury to change it. {athlete.name.split(' ')[0]} sees changes on their screens within 30 seconds.
          </p>
        </div>
        {!assigning && (
          <Button ref={assignButtonRef} variant="primary" onClick={() => setAssigning(true)}>
            {athlete.injuries.length ? 'Add injury or exercises' : 'Assign injury and exercises'}
          </Button>
        )}
      </div>

      {assigning && <AssignForm athletes={[athlete]} initialAthleteId={athlete.id} onClose={() => setAssigning(false)} />}

      {athlete.injuries.length === 0 && !assigning && (
        <p>No active injuries. {athlete.name.split(' ')[0]} is healthy, so there's no plan to change.</p>
      )}
      {athlete.injuries.map((injury) => (
        <InjuryEditor key={injury.caseId} athlete={athlete} injury={injury} />
      ))}

      <AppointmentScheduler athlete={athlete} />
    </Card>
  );
}

/**
 * One active injury: its exercises and milestone tests. It opens read-only,
 * so nothing changes by accident; Edit unlocks the number boxes and the
 * Remove, Record and Save buttons, and Done locks it again.
 */
function InjuryEditor({ athlete, injury }: { athlete: Athlete; injury: AthleteInjury }) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const editButtonRef = useReturnFocus(editing);
  const [confirming, setConfirming] = useState(false);
  const exercises = state.exercises.filter((e) => e.caseId === injury.caseId && e.active !== false);
  const tests = testsFor(state, athlete.id).filter((t) => t.caseId === injury.caseId);
  const headingId = `plan-${injury.caseId}`;

  async function clear() {
    setConfirming(false);
    const result = await commands.clearInjury(injury.caseId);
    if (!result.ok) notify(result.error, 'error');
    else notify(`${injury.name} cleared for ${athlete.name}. Its exercises are off their list.`);
  }

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="spread">
        <h3 id={headingId} className="strong">
          {injury.name}
        </h3>
        {confirming ? (
          <div className="row">
            <Button variant="primary" className="btn--small" onClick={clear}>
              Yes, clear {injury.name}
            </Button>
            <Button className="btn--small" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="row">
            <Button
              ref={editButtonRef}
              variant={editing ? 'primary' : 'secondary'}
              className="btn--small"
              aria-pressed={editing}
              aria-label={editing ? `Done editing ${injury.name}` : `Edit ${injury.name}`}
              onClick={() => setEditing((on) => !on)}
            >
              {editing ? 'Done' : 'Edit'}
            </Button>
            <Button className="btn--small" aria-label={`Mark ${injury.name} cleared`} onClick={() => setConfirming(true)}>
              Mark cleared
            </Button>
          </div>
        )}
      </div>

      <div className="stack-sm">
        <div className="small strong">Exercises ({exercises.length})</div>
        {exercises.length === 0 ? (
          <p className="small muted">None assigned. Use &ldquo;Add injury or exercises&rdquo; above and pick {injury.name}.</p>
        ) : editing ? (
          exercises.map((e) => <ExerciseRow key={e.id} exercise={e} />)
        ) : (
          <ul className="plain-list">
            {exercises.map((e) => (
              <li key={e.id}>
                {e.name} <span className="small muted">{e.prescription}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {tests.length > 0 && (
        <div className="stack-sm">
          <div className="small strong">Milestone tests ({tests.length})</div>
          {editing ? (
            tests.map((t) => <TestRow key={t.id} test={t} athlete={athlete} />)
          ) : (
            <ul className="plain-list">
              {tests.map((t) => (
                <li key={t.id}>
                  {t.name}{' '}
                  <span className="small muted">
                    now {formatNumber(currentValue(t, state.results, athlete.id))} {t.unit}, goal {formatNumber(t.target)} {t.unit}
                    {isGoalReached(t, state.results, athlete.id) && <span className="strong"> (reached)</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Sets, reps and hold for one exercise, with Save and Remove. */
function ExerciseRow({ exercise }: { exercise: Exercise }) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const text = (n: number | null | undefined) => (n ? String(n) : '');
  const [sets, setSets] = useState(text(exercise.sets));
  const [reps, setReps] = useState(text(exercise.reps));
  const [hold, setHold] = useState(text(exercise.holdSeconds));
  const [busy, setBusy] = useState(false);
  const changed = sets.trim() !== text(exercise.sets) || reps.trim() !== text(exercise.reps) || hold.trim() !== text(exercise.holdSeconds);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await commands.setPrescription(exercise.id, { sets, reps, hold });
    setBusy(false);
    if (!result.ok) notify(result.error, 'error');
    else notify(`${exercise.name} updated.`);
  }

  async function remove() {
    setBusy(true);
    const result = await commands.removeExercise(exercise.id);
    setBusy(false);
    if (!result.ok) notify(result.error, 'error');
    else notify(`${exercise.name} is off the plan. Past logs are kept.`);
  }

  const field = (label: string, value: string, onChange: (v: string) => void) => {
    const id = `${label}-${exercise.id}`;
    return (
      <div className="stack-xs">
        <label htmlFor={id} className="small muted">
          {label}
        </label>
        <input
          id={id}
          className="field field--number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  };

  return (
    <form className="edit-row" onSubmit={save} aria-label={exercise.name}>
      <div className="edit-row__name stack-xs">
        <span className="strong">{exercise.name}</span>
        <span className="small muted">{exercise.prescription}</span>
      </div>
      {field('Sets', sets, setSets)}
      {field('Reps', reps, setReps)}
      {field('Hold (sec)', hold, setHold)}
      <div className="row">
        <Button type="submit" variant="primary" disabled={busy || !changed}>
          Save
        </Button>
        <Button disabled={busy} onClick={remove} aria-label={`Remove ${exercise.name}`}>
          Remove
        </Button>
      </div>
    </form>
  );
}

/** One milestone test: where they are, the goal (editable), and a box to record a new result. */
function TestRow({ test, athlete }: { test: MilestoneTest; athlete: Athlete }) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const [result, setResult] = useState('');
  const [target, setTarget] = useState(formatNumber(test.target));
  const [busy, setBusy] = useState(false);
  const current = currentValue(test, state.results, athlete.id);
  const reached = isGoalReached(test, state.results, athlete.id);
  const targetChanged = target.trim() !== formatNumber(test.target);

  async function record(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const saved = await commands.recordResult(athlete.id, test.id, result);
    setBusy(false);
    if (!saved.ok) {
      notify(saved.error, 'error');
      return;
    }
    setResult('');
    notify(
      saved.value.newlyReached
        ? `${test.name}: ${formatNumber(saved.value.result.value)} ${test.unit} recorded. Goal reached.`
        : `${test.name}: ${formatNumber(saved.value.result.value)} ${test.unit} recorded.`,
    );
  }

  async function saveTarget() {
    setBusy(true);
    const saved = await commands.setGoalTarget(test.id, target);
    setBusy(false);
    if (!saved.ok) notify(saved.error, 'error');
    else notify(`${test.name} goal is now ${target.trim()} ${test.unit}.`);
  }

  return (
    <form className="edit-row" onSubmit={record} aria-label={test.name}>
      <div className="edit-row__name stack-xs">
        <span className="strong">{test.name}</span>
        <span className="small muted">
          Now {formatNumber(current)} {test.unit}, started at {formatNumber(test.baseline)}
          {reached && <span className="strong"> (goal reached)</span>}
        </span>
      </div>
      <div className="stack-xs">
        <label htmlFor={`result-${test.id}`} className="small muted">
          New result ({test.unit})
        </label>
        <input
          id={`result-${test.id}`}
          className="field field--number"
          inputMode="decimal"
          value={result}
          onChange={(e) => setResult(e.target.value)}
        />
      </div>
      <Button type="submit" variant="primary" disabled={busy || result.trim() === ''}>
        Record
      </Button>
      <div className="stack-xs">
        <label htmlFor={`target-${test.id}`} className="small muted">
          Goal ({test.unit})
        </label>
        <input
          id={`target-${test.id}`}
          className="field field--number"
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </div>
      <Button disabled={busy || !targetChanged} onClick={saveTarget}>
        Save goal
      </Button>
    </form>
  );
}
