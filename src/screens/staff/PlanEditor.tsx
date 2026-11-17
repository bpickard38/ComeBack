import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useToast } from '../../components/Toast';
import { useReturnFocus } from '../../components/useReturnFocus';
import { currentValue, isGoalReached } from '../../domain/goals';
import type { Athlete, AthleteInjury, Exercise, MilestoneTest } from '../../domain/types';
import type { MilestoneInput } from '../../domain/validation';
import { formatNumber } from '../../format';
import { testsFor, useAppStore } from '../../store/AppStore';
import { AppointmentScheduler } from './AppointmentScheduler';
import { AssignForm } from './AssignForm';

/**
 * Everything the trainer can change about an athlete's rehab, in one place
 * on their profile: add an injury; and, under Edit on each injury, add or
 * remove exercises, change sets and reps, add or remove milestone tests,
 * record a result, move a goal. Also clear an injury and book visits. The
 * athlete sees each change within 30 seconds.
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
            Press <strong>Edit</strong> on an injury to add or change its exercises and milestone tests.{' '}
            {athlete.name.split(' ')[0]} sees changes within 30 seconds.
          </p>
        </div>
        {!assigning && (
          <Button ref={assignButtonRef} variant="primary" onClick={() => setAssigning(true)}>
            {athlete.injuries.length ? 'Add another injury' : 'Assign injury and exercises'}
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
        {editing ? (
          <>
            {exercises.map((e) => (
              <ExerciseRow key={e.id} exercise={e} />
            ))}
            <AddExercise athlete={athlete} injury={injury} onPlan={exercises} />
          </>
        ) : exercises.length === 0 ? (
          <p className="small muted">None yet. Press Edit to add exercises.</p>
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

      <div className="stack-sm">
        <div className="small strong">Milestone tests ({tests.length})</div>
        {editing ? (
          <>
            {tests.map((t) => (
              <TestRow key={t.id} test={t} athlete={athlete} />
            ))}
            <AddMilestone injury={injury} used={tests} />
          </>
        ) : tests.length === 0 ? (
          <p className="small muted">None yet. Press Edit to add a test, like one-leg balance, to track recovery.</p>
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
    </section>
  );
}

/** Edit mode: pick one more exercise from the catalog for this injury. */
function AddExercise({ athlete, injury, onPlan }: { athlete: Athlete; injury: AthleteInjury; onPlan: Exercise[] }) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const [exerciseId, setExerciseId] = useState('');
  const [busy, setBusy] = useState(false);
  const id = `add-exercise-${injury.caseId}`;
  const taken = new Set(onPlan.map((e) => e.exerciseId));
  // This injury's usual exercises first, then the rest A to Z.
  const usual = (injury.injuryId && state.catalog.workoutSets[injury.injuryId]) || [];
  const choices = state.catalog.exercises
    .filter((e) => !taken.has(e.id))
    .sort((a, b) => Number(usual.includes(b.id)) - Number(usual.includes(a.id)) || a.name.localeCompare(b.name));

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await commands.addExerciseToInjury(athlete.id, injury.caseId, exerciseId);
    setBusy(false);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    notify(`${state.catalog.exercises.find((x) => x.id === exerciseId)?.name} added to ${athlete.name}'s ${injury.name} plan.`);
    setExerciseId('');
  }

  return (
    <form className="edit-row edit-row--add" onSubmit={add} aria-label={`Add an exercise for ${injury.name}`}>
      <div className="stack-xs edit-row__name">
        <label htmlFor={id} className="small strong">
          Add an exercise
        </label>
        <select id={id} className="field" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
          <option value="">Pick an exercise…</option>
          {choices.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {usual.includes(e.id) ? ` (usual for ${injury.name})` : ''}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="primary" disabled={busy || !exerciseId}>
        {busy ? 'Adding…' : 'Add exercise'}
      </Button>
    </form>
  );
}

/** Edit mode: a new milestone test for this injury, picked from the list or made up, with a start and a goal. */
function AddMilestone({ injury, used }: { injury: AthleteInjury; used: MilestoneTest[] }) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const NEW = 'new';
  const empty: MilestoneInput = { testId: '', newName: '', newUnit: '', baseline: '', target: '' };
  const [draft, setDraft] = useState(empty);
  const [picked, setPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const id = (part: string) => `milestone-${part}-${injury.caseId}`;
  const takenIds = new Set(used.map((t) => t.testId));
  const choices = state.catalog.tests.filter((t) => !takenIds.has(t.id));
  const unit = picked === NEW ? draft.newUnit.trim() : (state.catalog.tests.find((t) => t.id === picked)?.unit ?? '');

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await commands.addMilestone(injury.caseId, { ...draft, testId: picked === NEW ? '' : picked });
    setBusy(false);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    const name = picked === NEW ? draft.newName.trim() : state.catalog.tests.find((t) => t.id === picked)?.name;
    notify(`${name} added as a milestone for ${injury.name}.`);
    setDraft(empty);
    setPicked('');
  }

  const numberField = (key: 'baseline' | 'target', label: string) => (
    <div className="stack-xs">
      <label htmlFor={id(key)} className="small muted">
        {label}
        {unit && ` (${unit})`}
      </label>
      <input
        id={id(key)}
        className="field field--number"
        inputMode="decimal"
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <form className="edit-row edit-row--add" onSubmit={add} aria-label={`Add a milestone test for ${injury.name}`}>
      <div className="stack-xs edit-row__name">
        <label htmlFor={id('test')} className="small strong">
          Add a milestone test
        </label>
        <select id={id('test')} className="field" value={picked} onChange={(e) => setPicked(e.target.value)}>
          <option value="">Pick a test…</option>
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.unit})
            </option>
          ))}
          <option value={NEW}>New test…</option>
        </select>
      </div>
      {picked === NEW && (
        <>
          <div className="stack-xs">
            <label htmlFor={id('name')} className="small muted">
              Test name
            </label>
            <input
              id={id('name')}
              className="field"
              maxLength={60}
              placeholder="Plank hold"
              value={draft.newName}
              onChange={(e) => setDraft({ ...draft, newName: e.target.value })}
            />
          </div>
          <div className="stack-xs">
            <label htmlFor={id('unit')} className="small muted">
              Unit
            </label>
            <input
              id={id('unit')}
              className="field field--unit"
              maxLength={30}
              placeholder="seconds"
              value={draft.newUnit}
              onChange={(e) => setDraft({ ...draft, newUnit: e.target.value })}
            />
          </div>
        </>
      )}
      {numberField('baseline', 'Starts at')}
      {numberField('target', 'Goal')}
      <Button type="submit" variant="primary" disabled={busy || !picked}>
        {busy ? 'Adding…' : 'Add test'}
      </Button>
    </form>
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
  const [confirmingRemove, setConfirmingRemove] = useState(false);
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

  async function remove() {
    setBusy(true);
    const saved = await commands.removeMilestone(test.id);
    setBusy(false);
    if (!saved.ok) notify(saved.error, 'error');
    else notify(`${test.name} is no longer a milestone for ${athlete.name}.`);
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
      {confirmingRemove ? (
        <div className="row">
          <Button className="btn--small" disabled={busy} onClick={remove}>
            Yes, remove it and its results
          </Button>
          <Button className="btn--small" onClick={() => setConfirmingRemove(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <Button disabled={busy} onClick={() => setConfirmingRemove(true)} aria-label={`Remove ${test.name}`}>
          Remove
        </Button>
      )}
    </form>
  );
}
