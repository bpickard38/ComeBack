import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useReturnFocus } from '../../components/useReturnFocus';
import { planNumbers } from '../../domain/assistant';
import { athletesWithInjury, setsUsingExercise } from '../../domain/catalog';
import { youtubeId } from '../../domain/video';
import { useAppStore, useTeam } from '../../store/AppStore';
import type { CatalogExercise, CatalogInjury } from '../../store/state';
import { AssignForm } from './AssignForm';
import { VideoPicker } from './VideoPicker';

type View = 'injuries' | 'exercises';

/**
 * The trainer's library: every injury with its starting plan, and every
 * exercise with its how-to and tutorial video. Starting plans are copied
 * onto an athlete when assigned, so changes here only affect future
 * assignments; plans already given keep their numbers.
 */
export function Exercises() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'exercises' ? 'exercises' : 'injuries';

  return (
    <>
      <div className="page-head">
        <div className="stack-xs">
          <div className="eyebrow">Library</div>
          <h1>Exercises</h1>
        </div>
        <div className="row" role="group" aria-label="Show">
          <button type="button" className="chip" aria-pressed={view === 'injuries'} onClick={() => setParams({})}>
            Injuries and plans
          </button>
          <button type="button" className="chip" aria-pressed={view === 'exercises'} onClick={() => setParams({ view: 'exercises' })}>
            All exercises
          </button>
        </div>
      </div>
      {view === 'injuries' ? <InjuriesView /> : <ExercisesView />}
    </>
  );
}

// ---------- Injuries and their starting plans ----------

function InjuriesView() {
  const { state, commands } = useAppStore();
  const { athletes } = useTeam();
  const { notify } = useToast();
  const [adding, setAdding] = useState(false);
  const addButtonRef = useReturnFocus(adding);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [assigningInjury, setAssigningInjury] = useState<string | null>(null);
  /** The injury whose starting set is open for editing (a new one opens straight away). */
  const [editingId, setEditingId] = useState<string | null>(null);
  const injuries = [...state.catalog.injuries].sort((a, b) => a.name.localeCompare(b.name));

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await commands.addInjury(name, region);
    setSaving(false);
    if (!result.ok) return notify(result.error, 'error');
    notify(`Added ${name.trim()}. Now add its starting exercises.`);
    setAdding(false);
    setName('');
    setRegion('');
    setEditingId(result.value.id);
  }

  return (
    <>
      <div className="spread">
        <p className="muted">Each injury’s starting plan is ticked for you when you assign it. Changes only affect future assignments.</p>
        {!adding && (
          <Button ref={addButtonRef} variant="primary" onClick={() => setAdding(true)}>
            Add injury
          </Button>
        )}
      </div>

      {adding && (
        <form className="card card--strong stack-sm" onSubmit={add} aria-labelledby="add-injury-title">
          <h2 id="add-injury-title">New injury</h2>
          <label className="stack-xs">
            <span className="strong">Name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Turf toe" required autoFocus />
          </label>
          <label className="stack-xs">
            <span className="strong">Body region</span>
            <input className="field" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Optional, e.g. Foot" />
          </label>
          <div className="row">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add injury'}
            </Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {assigningInjury && athletes.length > 0 && (
        <AssignForm
          athletes={athletes}
          initialAthleteId={athletes[0].id}
          initialInjuryId={assigningInjury}
          onClose={() => setAssigningInjury(null)}
        />
      )}

      {injuries.length === 0 ? (
        <p className="muted">No injuries in the catalog yet.</p>
      ) : (
        <div className="library-grid">
          {injuries.map((injury) => (
            <InjuryCard
              key={injury.id}
              injury={injury}
              editing={editingId === injury.id}
              onEdit={(open) => setEditingId(open ? injury.id : null)}
              canAssign={athletes.length > 0}
              onAssign={() => {
                setAssigningInjury(injury.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

interface SetRow {
  exerciseId: string;
  sets: string;
  reps: string;
  hold: string;
}

function InjuryCard({
  injury,
  editing,
  onEdit,
  canAssign,
  onAssign,
}: {
  injury: CatalogInjury;
  editing: boolean;
  onEdit: (open: boolean) => void;
  canAssign: boolean;
  onAssign: () => void;
}) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const set = state.catalog.setDetails.filter((s) => s.injuryId === injury.id).sort((a, b) => a.position - b.position);
  const exerciseById = new Map(state.catalog.exercises.map((e) => [e.id, e]));
  const active = athletesWithInjury(state.athletes, injury.name);
  const [rows, setRows] = useState<SetRow[]>([]);
  const [adding, setAdding] = useState('');
  const [saving, setSaving] = useState(false);
  const titleId = `injury-${injury.id}`;

  function startEditing() {
    setRows(set.map((s) => ({ exerciseId: s.exerciseId, sets: s.sets?.toString() ?? '', reps: s.reps?.toString() ?? '', hold: s.holdSeconds?.toString() ?? '' })));
    onEdit(true);
  }
  // (A brand-new injury opens in edit mode with an empty list, which is right: it has no plan yet.)

  function setRow(index: number, change: Partial<SetRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
  }

  async function save() {
    setSaving(true);
    const result = await commands.saveStartingSet(injury.id, rows);
    setSaving(false);
    if (!result.ok) return notify(result.error, 'error');
    notify(`Saved the starting plan for ${injury.name}.`);
    onEdit(false);
  }

  const available = state.catalog.exercises.filter((e) => !rows.some((r) => r.exerciseId === e.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="card library-card" aria-labelledby={titleId}>
      <div className="stack-xs">
        <h2 id={titleId} className="library-card__title">
          {injury.name}
        </h2>
        <span className="small muted">
          {[injury.bodyRegion, active ? `${active} ${active === 1 ? 'athlete has' : 'athletes have'} it now` : null].filter(Boolean).join(' · ') || 'Not in use'}
        </span>
      </div>

      {!editing ? (
        <>
          {set.length === 0 ? (
            <p className="small muted">No starting plan yet.</p>
          ) : (
            <ol className="library-card__list">
              {set.map((s) => {
                const ex = exerciseById.get(s.exerciseId);
                return (
                  <li key={s.exerciseId}>
                    <span>{ex?.name ?? 'Exercise'}</span>{' '}
                    <span className="small muted">{planNumbers(s.sets, s.reps, s.holdSeconds) || 'as directed'}</span>
                    {ex && !ex.videoUrl && (
                      <>
                        {' '}
                        <Badge tone="warn">No video</Badge>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="row">
            <Button variant="primary" className="btn--small" onClick={onAssign} disabled={!canAssign || set.length === 0}>
              Assign to…
            </Button>
            <Button className="btn--small" onClick={startEditing}>
              Edit plan
            </Button>
          </div>
        </>
      ) : (
        <div className="stack-sm">
          <p className="small muted">Changes apply to future assignments. Plans already given keep their numbers.</p>
          {rows.length === 0 && <p className="small muted">Add the exercises athletes start with for {injury.name}.</p>}
          <ol className="library-card__list">
            {rows.map((r, i) => {
              const ex = exerciseById.get(r.exerciseId);
              const label = ex?.name ?? 'Exercise';
              return (
                <li key={r.exerciseId} className="stack-xs">
                  <span className="spread">
                    <span className="strong">{label}</span>
                    <button type="button" className="link-button small" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      Remove<span className="visually-hidden"> {label}</span>
                    </button>
                  </span>
                  <span className="numbers">
                    {(['sets', 'reps', 'hold'] as const).map((key) => (
                      <label key={key} className="numbers__field">
                        <span className="small muted">{key === 'hold' ? 'Hold (sec)' : key === 'sets' ? 'Sets' : 'Reps'}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={999}
                          className="field field--slim numbers__input"
                          value={r[key]}
                          onChange={(e) => setRow(i, { [key]: e.target.value })}
                          aria-label={`${key === 'hold' ? 'Hold seconds' : key} for ${label}`}
                        />
                      </label>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="row">
            <label htmlFor={`${titleId}-add`} className="visually-hidden">
              Exercise to add to {injury.name}
            </label>
            <select id={`${titleId}-add`} className="field field--slim" value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Add an exercise…</option>
              {available.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <Button
              className="btn--small"
              disabled={!adding}
              onClick={() => {
                setRows([...rows, { exerciseId: adding, sets: '3', reps: '10', hold: '' }]);
                setAdding('');
              }}
            >
              Add
            </Button>
          </div>
          <div className="row">
            <Button variant="primary" className="btn--small" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save plan'}
            </Button>
            <Button className="btn--small" onClick={() => onEdit(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- Every exercise, with its video ----------

function ExercisesView() {
  const { state } = useAppStore();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const addButtonRef = useReturnFocus(adding);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const missing = state.catalog.exercises.filter((e) => !e.videoUrl).length;
  const shown = [...state.catalog.exercises]
    .filter((e) => !onlyMissing || !e.videoUrl)
    .filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="spread">
        <div className="row">
          <label htmlFor="exercise-search" className="visually-hidden">
            Search exercises
          </label>
          <input
            id="exercise-search"
            type="search"
            className="field field--slim"
            placeholder="Search exercises"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {missing > 0 && (
            <button type="button" className="chip chip--slim" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(!onlyMissing)}>
              No video ({missing})
            </button>
          )}
        </div>
        {!adding && (
          <Button ref={addButtonRef} variant="primary" onClick={() => setAdding(true)}>
            Add exercise
          </Button>
        )}
      </div>

      {adding && <ExerciseForm onDone={() => setAdding(false)} />}

      {shown.length === 0 ? (
        <p className="muted" role="status">
          {query.trim() ? <>No exercises match &ldquo;{query.trim()}&rdquo;.</> : 'No exercises here.'}
        </p>
      ) : (
        <div className="library-grid">
          {shown.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </div>
      )}
    </>
  );
}

function ExerciseCard({ exercise }: { exercise: CatalogExercise }) {
  const { state } = useAppStore();
  const [editing, setEditing] = useState(false);
  const editButtonRef = useReturnFocus(editing);
  const usedIn = setsUsingExercise(exercise.id, state.catalog.workoutSets, state.catalog.injuries);
  const id = exercise.videoUrl ? youtubeId(exercise.videoUrl) : null;
  const titleId = `exercise-${exercise.id}`;

  if (editing) return <ExerciseForm exercise={exercise} onDone={() => setEditing(false)} />;

  return (
    <section className="card library-card library-card--exercise" aria-labelledby={titleId}>
      {id ? (
        <a href={exercise.videoUrl!} target="_blank" rel="noreferrer" className="library-card__thumb">
          <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" />
          <span className="visually-hidden">Watch the video for {exercise.name} on YouTube (new tab)</span>
        </a>
      ) : (
        <span className="library-card__thumb library-card__thumb--empty" aria-hidden="true">
          No video
        </span>
      )}
      <div className="stack-xs">
        <h2 id={titleId} className="library-card__title">
          {exercise.name} {!exercise.videoUrl && <Badge tone="warn">No video</Badge>}
        </h2>
        {exercise.description && <span className="small">{exercise.description}</span>}
        {usedIn.length > 0 && <span className="small muted">In the starting plan for {usedIn.join(', ')}</span>}
      </div>
      <div className="row">
        <Button ref={editButtonRef} className="btn--small" onClick={() => setEditing(true)}>
          {exercise.videoUrl ? 'Edit' : 'Add a video'}
        </Button>
      </div>
    </section>
  );
}

/** Add or edit an exercise: name, how-to and video (paste a link, or let the AI find some). */
function ExerciseForm({ exercise, onDone }: { exercise?: CatalogExercise; onDone: () => void }) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const [name, setName] = useState(exercise?.name ?? '');
  const [howTo, setHowTo] = useState(exercise?.description ?? '');
  const [link, setLink] = useState(exercise?.videoUrl ?? '');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const formId = `exercise-form-${exercise?.id ?? 'new'}`;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await commands.saveExercise({ id: exercise?.id, name, howTo, videoLink: link });
    setSaving(false);
    if (!result.ok) return notify(result.error, 'error');
    notify(exercise ? `Saved ${name.trim()}.` : `Added ${name.trim()}.`);
    onDone();
  }

  return (
    <form className="card card--strong stack-sm library-card" onSubmit={save} aria-labelledby={`${formId}-title`}>
      <h2 id={`${formId}-title`} className="library-card__title">
        {exercise ? `Edit ${exercise.name}` : 'New exercise'}
      </h2>
      <label className="stack-xs">
        <span className="strong">Name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Copenhagen plank" required autoFocus={!exercise} />
      </label>
      <label className="stack-xs">
        <span className="strong">How to do it</span>
        <textarea
          className="field visit-card__text"
          rows={2}
          value={howTo}
          onChange={(e) => setHowTo(e.target.value)}
          placeholder="One or two sentences the athlete sees"
        />
      </label>
      <label className="stack-xs">
        <span className="strong">Tutorial video</span>
        <input className="field" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube link, or find one below" inputMode="url" />
      </label>
      {searching && name.trim() ? (
        <VideoPicker exerciseName={name.trim()} chosen={link || null} onPick={(video) => setLink(video?.url ?? '')} pickFirst={false} />
      ) : (
        <Button className="btn--small" onClick={() => setSearching(true)} disabled={!name.trim()}>
          Find videos with AI
        </Button>
      )}
      {searching && <p className="small muted">Searching takes up to 40 seconds. Tap a video to use it, then Save.</p>}
      <div className="row">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
