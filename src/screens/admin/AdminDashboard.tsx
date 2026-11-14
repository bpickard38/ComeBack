import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { useReturnFocus } from '../../components/useReturnFocus';
import type { Role } from '../../domain/types';
import { supabase } from '../../store/supabase';
import { OkrPanel } from './OkrPanel';

type AdminTab = 'users' | 'exercises' | 'milestones' | 'okr';
interface UserRow { id: string; name: string; email: string; phone: string | null; role: Role; created_at: string }
interface ExerciseRow { id: string; name: string; description: string | null; video_url: string | null }
interface MilestoneRow { id: string; name: string; description: string | null; unit: string }
interface UserDraft { name: string; email: string; phone: string; role: Role }
interface ExerciseDraft { name: string; description: string; video_url: string }
interface MilestoneDraft { name: string; description: string; unit: string }
const ROLES: Role[] = ['athlete', 'trainer', 'coach', 'admin'];

async function edgeFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body: unknown = await context.clone().json();
        if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
        return JSON.stringify(body);
      } catch {
        const body = await context.clone().text().catch(() => '');
        if (body) return body;
      }
    }
  }
  return error instanceof Error ? error.message : 'The request failed. Check the Edge Function logs in Supabase.';
}

/** Admin-only console. Supabase RLS remains the actual authorization boundary. */
export function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null);
  const [exerciseDraft, setExerciseDraft] = useState<ExerciseDraft | null>(null);
  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneDraft | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const addButtonRef = useReturnFocus(addingUser || addingExercise || addingMilestone);
  const modalOpen = addingUser || addingExercise || addingMilestone;

  const refresh = useCallback(async () => {
    setError('');
    const [userResult, exerciseResult, milestoneResult] = await Promise.all([
      supabase.from('users').select('id, name, email, phone, role, created_at').order('created_at', { ascending: false }),
      supabase.from('exercises').select('id, name, description, video_url').order('name'),
      supabase.from('milestone_tests').select('id, name, description, unit').order('name'),
    ]);
    if (userResult.error || exerciseResult.error || milestoneResult.error) {
      setError(userResult.error?.message ?? exerciseResult.error?.message ?? milestoneResult.error?.message ?? 'Could not load records.');
      return;
    }
    setUsers((userResult.data ?? []) as UserRow[]);
    setExercises((exerciseResult.data ?? []) as ExerciseRow[]);
    setMilestones((milestoneResult.data ?? []) as MilestoneRow[]);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function persistUser(row: Omit<UserDraft, 'phone'> & { phone: string | null }, user?: UserRow) {
    if (!row.name || !row.email) { setError('Name and email are required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) { setError('Enter a valid email address.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { data, error: requestError } = await supabase.functions.invoke('admin-users', {
      body: { action: user ? 'update' : 'create', ...(user ? { id: user.id } : {}), ...row },
    });
    setBusy(false);
    if (requestError || data?.error) {
      setError(data?.error ?? (requestError ? await edgeFunctionError(requestError) : 'Could not save user.'));
      return;
    }
    setEditingUserId(null); setUserDraft(null); setAddingUser(false);
    setNotice(user ? 'User profile updated.' : 'User added. An invitation email was sent to them to finish signing up.');
    await refresh();
  }

  async function saveUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    await persistUser({
      name: String(values.get('name') ?? '').trim(),
      email: String(values.get('email') ?? '').trim().toLowerCase(),
      phone: String(values.get('phone') ?? '').trim() || null,
      role: String(values.get('role') ?? 'athlete') as Role,
    });
  }

  async function saveUserRow(user: UserRow) {
    if (!userDraft) return;
    await persistUser({ ...userDraft, phone: userDraft.phone.trim() || null }, user);
  }

  async function persistExercise(row: ExerciseDraft, exercise?: ExerciseRow) {
    row = { ...row, name: row.name.trim(), description: row.description.trim(), video_url: row.video_url.trim() };
    if (!row.name) { setError('Exercise name is required.'); return; }
    if (row.video_url) {
      try { new URL(row.video_url); } catch { setError('Enter a valid video URL.'); return; }
    }
    setBusy(true); setError(''); setNotice('');
    const savedRow = { name: row.name, description: row.description || null, video_url: row.video_url || null };
    const result = exercise
      ? await supabase.from('exercises').update(savedRow).eq('id', exercise.id)
      : await supabase.from('exercises').insert(savedRow);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setEditingExerciseId(null); setExerciseDraft(null); setAddingExercise(false);
    setNotice(exercise ? 'Exercise updated.' : 'Exercise added.');
    await refresh();
  }

  async function saveExercise(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    await persistExercise({
      name: String(values.get('name') ?? '').trim(),
      description: String(values.get('description') ?? ''),
      video_url: String(values.get('video_url') ?? ''),
    });
  }

  async function saveExerciseRow(exercise: ExerciseRow) {
    if (!exerciseDraft) return;
    await persistExercise(exerciseDraft, exercise);
  }

  async function persistMilestone(row: MilestoneDraft, milestone?: MilestoneRow) {
    row = { name: row.name.trim(), description: row.description.trim(), unit: row.unit.trim() };
    if (!row.name || !row.unit) { setError('Milestone name and unit are required.'); return; }
    setBusy(true); setError(''); setNotice('');
    const savedRow = { name: row.name, description: row.description || null, unit: row.unit };
    const result = milestone
      ? await supabase.from('milestone_tests').update(savedRow).eq('id', milestone.id)
      : await supabase.from('milestone_tests').insert(savedRow);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setEditingMilestoneId(null); setMilestoneDraft(null); setAddingMilestone(false);
    setNotice(milestone ? 'Milestone updated.' : 'Milestone added.');
    await refresh();
  }

  async function saveMilestone(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    await persistMilestone({
      name: String(values.get('name') ?? ''),
      description: String(values.get('description') ?? ''),
      unit: String(values.get('unit') ?? ''),
    });
  }

  async function saveMilestoneRow(milestone: MilestoneRow) {
    if (!milestoneDraft) return;
    await persistMilestone(milestoneDraft, milestone);
  }

  async function deleteUser(user: UserRow) {
    if (!window.confirm(`Permanently delete ${user.name}'s account? Related app records will be removed too.`)) return;
    setBusy(true); setError('');
    const { data, error: deleteError } = await supabase.functions.invoke('admin-users', { body: { action: 'delete', id: user.id } });
    setBusy(false);
    if (deleteError || data?.error) { setError(data?.error ?? deleteError?.message ?? 'Could not delete user.'); return; }
    setNotice('User account and related records deleted.');
    await refresh();
  }

  async function deleteExercise(exercise: ExerciseRow) {
    if (!window.confirm(`Delete “${exercise.name}”? This also deletes assigned plans and their related exercise logs and appointment links.`)) return;
    setBusy(true); setError('');
    const { error: deleteError } = await supabase.from('exercises').delete().eq('id', exercise.id);
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    setNotice('Exercise deleted.');
    await refresh();
  }

  async function deleteMilestone(milestone: MilestoneRow) {
    if (!window.confirm(`Delete “${milestone.name}”? This also deletes athlete goals and results linked to this milestone.`)) return;
    setBusy(true); setError('');
    const { error: deleteError } = await supabase.from('milestone_tests').delete().eq('id', milestone.id);
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    setNotice('Milestone and linked athlete records deleted.');
    await refresh();
  }

  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <div className="page-head">
        <div className="stack-xs"><div className="eyebrow">Administration</div><h1 id="admin-title">Admin dashboard</h1></div>
        {tab !== 'okr' && <Button ref={addButtonRef} variant="primary" disabled={busy || editingUserId !== null || editingExerciseId !== null || editingMilestoneId !== null} onClick={() => { setError(''); setNotice(''); if (tab === 'users') setAddingUser(true); else if (tab === 'exercises') setAddingExercise(true); else setAddingMilestone(true); }}>
          {tab === 'users' ? 'Add user' : tab === 'exercises' ? 'Add exercise' : 'Add milestone'}
        </Button>}
      </div>
      <div className="admin-tabs" role="tablist" aria-label="Admin sections">
        <button type="button" role="tab" aria-selected={tab === 'users'} onClick={() => { setTab('users'); setError(''); setNotice(''); }}>Users</button>
        <button type="button" role="tab" aria-selected={tab === 'exercises'} onClick={() => { setTab('exercises'); setError(''); setNotice(''); }}>Prescribable exercises</button>
        <button type="button" role="tab" aria-selected={tab === 'milestones'} onClick={() => { setTab('milestones'); setError(''); setNotice(''); }}>Milestones</button>
        <button type="button" role="tab" aria-selected={tab === 'okr'} onClick={() => { setTab('okr'); setError(''); setNotice(''); }}>OKR</button>
      </div>
      {error && !modalOpen && <p className="admin-message admin-message--error" role="alert">{error}</p>}
      {notice && <p className="admin-message" role="status">{notice}</p>}

      {tab === 'okr' ? <OkrPanel /> : tab === 'users' ? <>
        <div className="table-wrap admin-table-wrap">
          <table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>{users.map((user) => {
              const isEditing = editingUserId === user.id;
              return <tr key={user.id}>
                <td>{isEditing ? <input className="field admin-cell-input" aria-label="Name" required value={userDraft?.name ?? ''} onChange={(event) => { const value = event.currentTarget.value; setUserDraft((draft) => draft ? { ...draft, name: value } : draft); }} /> : user.name}</td>
                <td>{isEditing ? <input className="field admin-cell-input" aria-label="Email" type="email" required value={userDraft?.email ?? ''} onChange={(event) => { const value = event.currentTarget.value; setUserDraft((draft) => draft ? { ...draft, email: value } : draft); }} /> : user.email}</td>
                <td>{isEditing ? <input className="field admin-cell-input" aria-label="Phone" value={userDraft?.phone ?? ''} onChange={(event) => { const value = event.currentTarget.value; setUserDraft((draft) => draft ? { ...draft, phone: value } : draft); }} /> : user.phone || '—'}</td>
                <td>{isEditing ? <select className="field admin-cell-input" aria-label="Role" value={userDraft?.role ?? user.role} onChange={(event) => { const value = event.currentTarget.value as Role; setUserDraft((draft) => draft ? { ...draft, role: value } : draft); }}>{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select> : user.role}</td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td className="admin-actions">{isEditing ? <>
                  <Button className="admin-action-btn admin-action-btn--edit" type="button" disabled={busy} onClick={() => void saveUserRow(user)}>Save</Button>
                  <Button className="admin-action-btn" type="button" disabled={busy} onClick={() => { setEditingUserId(null); setUserDraft(null); }}>Cancel</Button>
                </> : <>
                  <Button className="admin-action-btn admin-action-btn--edit" type="button" disabled={busy || editingUserId !== null} onClick={() => { setAddingUser(false); setUserDraft({ name: user.name, email: user.email, phone: user.phone ?? '', role: user.role }); setEditingUserId(user.id); }}>Edit</Button>
                  <Button className="admin-action-btn admin-action-btn--delete" type="button" disabled={busy || editingUserId !== null} onClick={() => void deleteUser(user)}>Delete</Button>
                </>}</td>
              </tr>;
            })}
              {users.length === 0 && <tr><td colSpan={6} className="muted">No user profiles found.</td></tr>}</tbody>
          </table>
        </div>
        <AdminModal open={addingUser} title="Add user" onClose={() => setAddingUser(false)}>
          <form className="panel admin-form" onSubmit={(event) => void saveUser(event)}>
            <label className="label" htmlFor="admin-user-name">Name</label><input className="field" id="admin-user-name" name="name" required />
            <label className="label" htmlFor="admin-user-email">Email</label><input className="field" id="admin-user-email" name="email" type="email" required />
            <p className="muted small">Creates a Supabase login and sends an account invitation. Invitation delivery must be configured in Supabase Auth.</p>
            <label className="label" htmlFor="admin-user-phone">Phone</label><input className="field" id="admin-user-phone" name="phone" />
            <label className="label" htmlFor="admin-user-role">Role</label><select className="field" id="admin-user-role" name="role" defaultValue="athlete">{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select>
            {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
            <div className="row"><Button type="submit" variant="primary" disabled={busy}>Send invitation</Button></div>
          </form>
        </AdminModal>
      </> : tab === 'exercises' ? <>
        <div className="table-wrap admin-table-wrap">
          <table className="admin-table"><thead><tr><th>Name</th><th>Description</th><th>Video URL</th><th>Actions</th></tr></thead>
            <tbody>{exercises.map((exercise) => {
              const isEditing = editingExerciseId === exercise.id;
              return <tr key={exercise.id}>
                <td>{isEditing ? <input className="field admin-cell-input" aria-label="Exercise name" required value={exerciseDraft?.name ?? ''} onChange={(event) => { const value = event.currentTarget.value; setExerciseDraft((draft) => draft ? { ...draft, name: value } : draft); }} /> : exercise.name}</td>
                <td>{isEditing ? <textarea className="field field--area admin-cell-input admin-cell-input--area" aria-label="Description" value={exerciseDraft?.description ?? ''} onChange={(event) => { const value = event.currentTarget.value; setExerciseDraft((draft) => draft ? { ...draft, description: value } : draft); }} /> : exercise.description || '—'}</td>
                <td>{isEditing ? <input className="field admin-cell-input" aria-label="Video URL" type="url" value={exerciseDraft?.video_url ?? ''} onChange={(event) => { const value = event.currentTarget.value; setExerciseDraft((draft) => draft ? { ...draft, video_url: value } : draft); }} /> : exercise.video_url ? <a className="admin-video-link" href={exercise.video_url} target="_blank" rel="noreferrer">{exercise.video_url}</a> : '—'}</td>
                <td className="admin-actions">{isEditing ? <>
                  <Button className="admin-action-btn admin-action-btn--edit" type="button" disabled={busy} onClick={() => void saveExerciseRow(exercise)}>Save</Button>
                  <Button className="admin-action-btn" type="button" disabled={busy} onClick={() => { setEditingExerciseId(null); setExerciseDraft(null); }}>Cancel</Button>
                </> : <>
                  <Button className="admin-action-btn admin-action-btn--edit" type="button" disabled={busy || editingExerciseId !== null} onClick={() => { setAddingExercise(false); setExerciseDraft({ name: exercise.name, description: exercise.description ?? '', video_url: exercise.video_url ?? '' }); setEditingExerciseId(exercise.id); }}>Edit</Button>
                  <Button className="admin-action-btn admin-action-btn--delete" type="button" disabled={busy || editingExerciseId !== null} onClick={() => void deleteExercise(exercise)}>Delete</Button>
                </>}</td>
              </tr>;
            })}
              {exercises.length === 0 && <tr><td colSpan={4} className="muted">No exercises found.</td></tr>}</tbody>
          </table>
        </div>
        <AdminModal open={addingExercise} title="Add exercise" onClose={() => setAddingExercise(false)}>
          <form className="panel admin-form" onSubmit={(event) => void saveExercise(event)}>
            <label className="label" htmlFor="admin-exercise-name">Name</label><input className="field" id="admin-exercise-name" name="name" required />
            <label className="label" htmlFor="admin-exercise-description">Description</label><textarea className="field field--area" id="admin-exercise-description" name="description" />
            <label className="label" htmlFor="admin-exercise-video">Video URL</label><input className="field" id="admin-exercise-video" name="video_url" type="url" />
            {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
            <div className="row"><Button type="submit" variant="primary" disabled={busy}>Save exercise</Button></div>
          </form>
        </AdminModal>
      </> : <>
        <div className="table-wrap admin-table-wrap">
          <table className="admin-table"><thead><tr><th>Name</th><th>Description</th><th>Unit</th><th>Actions</th></tr></thead>
            <tbody>{milestones.map((milestone) => {
              const isEditing = editingMilestoneId === milestone.id;
              return <tr key={milestone.id}>
                <td>{isEditing ? <input className="field admin-cell-input" aria-label="Milestone name" required value={milestoneDraft?.name ?? ''} onChange={(event) => { const value = event.currentTarget.value; setMilestoneDraft((draft) => draft ? { ...draft, name: value } : draft); }} /> : milestone.name}</td>
                <td>{isEditing ? <textarea className="field field--area admin-cell-input admin-cell-input--area" aria-label="Description" value={milestoneDraft?.description ?? ''} onChange={(event) => { const value = event.currentTarget.value; setMilestoneDraft((draft) => draft ? { ...draft, description: value } : draft); }} /> : milestone.description || '—'}</td>
                <td>{isEditing ? <input className="field admin-cell-input" aria-label="Unit" required value={milestoneDraft?.unit ?? ''} onChange={(event) => { const value = event.currentTarget.value; setMilestoneDraft((draft) => draft ? { ...draft, unit: value } : draft); }} /> : milestone.unit}</td>
                <td className="admin-actions">{isEditing ? <>
                  <Button className="admin-action-btn admin-action-btn--edit" type="button" disabled={busy} onClick={() => void saveMilestoneRow(milestone)}>Save</Button>
                  <Button className="admin-action-btn" type="button" disabled={busy} onClick={() => { setEditingMilestoneId(null); setMilestoneDraft(null); }}>Cancel</Button>
                </> : <>
                  <Button className="admin-action-btn admin-action-btn--edit" type="button" disabled={busy || editingMilestoneId !== null} onClick={() => { setAddingMilestone(false); setMilestoneDraft({ name: milestone.name, description: milestone.description ?? '', unit: milestone.unit }); setEditingMilestoneId(milestone.id); }}>Edit</Button>
                  <Button className="admin-action-btn admin-action-btn--delete" type="button" disabled={busy || editingMilestoneId !== null} onClick={() => void deleteMilestone(milestone)}>Delete</Button>
                </>}</td>
              </tr>;
            })}
              {milestones.length === 0 && <tr><td colSpan={4} className="muted">No milestones found.</td></tr>}</tbody>
          </table>
        </div>
        <AdminModal open={addingMilestone} title="Add milestone" onClose={() => setAddingMilestone(false)}>
          <form className="panel admin-form" onSubmit={(event) => void saveMilestone(event)}>
            <label className="label" htmlFor="admin-milestone-name">Name</label><input className="field" id="admin-milestone-name" name="name" required />
            <label className="label" htmlFor="admin-milestone-description">Description</label><textarea className="field field--area" id="admin-milestone-description" name="description" />
            <label className="label" htmlFor="admin-milestone-unit">Unit</label><input className="field" id="admin-milestone-unit" name="unit" required placeholder="e.g. seconds, reps, cm" />
            {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
            <div className="row"><Button type="submit" variant="primary" disabled={busy}>Save milestone</Button></div>
          </form>
        </AdminModal>
      </>}
    </section>
  );
}

function AdminModal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="admin-modal"
      aria-labelledby="admin-modal-title"
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="admin-modal__head">
        <h2 id="admin-modal-title">{title}</h2>
        <Button type="button" aria-label="Close dialog" onClick={onClose}>×</Button>
      </div>
      <div className="admin-modal__body">{children}</div>
    </dialog>
  );
}
