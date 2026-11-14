import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { dayKey } from '../../domain/dates';
import { ON_TRACK_PERCENT } from '../../domain/week';
import { supabase } from '../../store/supabase';

type Workflow = 'trainer_setup' | 'coach_checkin';
interface MetricRow {
  completed_exercises: number;
  assigned_exercise_opportunities: number;
  completion_percent: number | null;
  recovered_cases: number;
  average_recovery_days: number | null;
}
interface Choice { id: string; name: string }
interface SessionRow { id: string; workflow: Workflow; duration_seconds: number; completed_at: string; details: Record<string, unknown> }
interface BestTimeRow { workflow: Workflow; best_seconds: number; session_count: number }
interface PersonChoice extends Choice { email: string }
interface CoachRosterRow { athlete_id: string; athlete_name: string; team_id: string; team_name: string; availability: string | null; expected_return: string | null }

const WORKFLOW_LABEL: Record<Workflow, string> = { trainer_setup: 'Trainer setup', coach_checkin: 'Coach check-in' };

export function OkrPanel() {
  const [metrics, setMetrics] = useState<MetricRow | null>(null);
  const [people, setPeople] = useState<PersonChoice[]>([]);
  const [injuries, setInjuries] = useState<Choice[]>([]);
  const [exercises, setExercises] = useState<Choice[]>([]);
  const [milestones, setMilestones] = useState<Choice[]>([]);
  const [coachRoster, setCoachRoster] = useState<CoachRosterRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [bestTimes, setBestTimes] = useState<BestTimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [athleteId, setAthleteId] = useState('');
  const [injuryId, setInjuryId] = useState('');
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [milestoneIds, setMilestoneIds] = useState<string[]>([]);
  const [coachTask, setCoachTask] = useState<'status' | 'message'>('status');
  const [messageDraft, setMessageDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    const [metricResult, userResult, injuryResult, exerciseResult, milestoneResult, sessionResult, coachRosterResult, bestTimeResult] = await Promise.all([
      supabase.rpc('admin_okr_metrics', { p_today: dayKey(new Date()) }),
      supabase.from('users').select('id, name, email').eq('role', 'athlete').order('name'),
      supabase.from('injuries').select('id, name').order('name'),
      supabase.from('exercises').select('id, name').order('name'),
      supabase.from('milestone_tests').select('id, name').order('name'),
      supabase.from('admin_okr_sessions').select('id, workflow, duration_seconds, completed_at, details').order('completed_at', { ascending: false }).limit(20),
      supabase.rpc('admin_okr_coach_roster'),
      supabase.rpc('admin_okr_best_times'),
    ]);
    const failed = [metricResult, userResult, injuryResult, exerciseResult, milestoneResult, sessionResult, coachRosterResult, bestTimeResult].find((result) => result.error);
    if (failed?.error) setError(`${failed.error.message}. Run supabase/okr.sql in Supabase SQL Editor if this is the first visit to OKR.`);
    if (!metricResult.error) setMetrics((metricResult.data?.[0] as MetricRow | undefined) ?? null);
    if (!userResult.error) setPeople((userResult.data ?? []) as PersonChoice[]);
    if (!injuryResult.error) setInjuries((injuryResult.data ?? []) as Choice[]);
    if (!exerciseResult.error) setExercises((exerciseResult.data ?? []) as Choice[]);
    if (!milestoneResult.error) setMilestones((milestoneResult.data ?? []) as Choice[]);
    if (!sessionResult.error) setSessions((sessionResult.data ?? []) as SessionRow[]);
    if (!coachRosterResult.error) setCoachRoster((coachRosterResult.data ?? []) as CoachRosterRow[]);
    if (!bestTimeResult.error) setBestTimes((bestTimeResult.data ?? []) as BestTimeRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (startedAt === null) return;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  function begin(kind: Workflow) {
    setError(''); setWorkflow(kind); setStartedAt(Date.now()); setElapsed(0);
    setAthleteId(''); setInjuryId(''); setExerciseIds([]); setMilestoneIds([]); setMessageDraft(''); setCoachTask('status');
  }

  function cancel() { setWorkflow(null); setStartedAt(null); setElapsed(0); }

  async function finish() {
    if (!workflow || startedAt === null) return;
    const duration = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError('Your admin session expired. Sign in again and retry.'); return; }
    const details = workflow === 'trainer_setup'
      ? { athlete_id: athleteId, injury_id: injuryId, exercise_ids: exerciseIds, milestone_ids: milestoneIds }
      : { athlete_id: athleteId, task: coachTask, message_length: coachTask === 'message' ? messageDraft.trim().length : 0 };
    setSaving(true); setError('');
    const { error: saveError } = await supabase.from('admin_okr_sessions').insert({ admin_id: auth.user.id, workflow, duration_seconds: duration, details });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    cancel(); await refresh();
  }

  const canFinish = Boolean(athleteId && (workflow === 'trainer_setup'
    ? injuryId && exerciseIds.length && milestoneIds.length
    : coachTask === 'status' || messageDraft.trim()));
  const toggle = (id: string, selected: string[], set: (ids: string[]) => void) => set(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const selectedStatus = coachRoster.filter((row) => row.athlete_id === athleteId);
  const completion = metrics?.completion_percent;
  const completionStatus = completion === null || completion === undefined ? 'Awaiting data' : completion >= ON_TRACK_PERCENT ? 'On track' : 'Needs attention';
  const completionTone = completion === null || completion === undefined ? 'neutral' : completion >= ON_TRACK_PERCENT ? 'success' : 'warning';

  return <div className="okr-panel">
    <div className="okr-intro"><div><div className="eyebrow">App goals</div><h2>OKR measurements</h2></div><Button className="okr-refresh-btn" type="button" aria-label="Refresh OKR data" title="Refresh" onClick={() => void refresh()} disabled={loading}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></svg></Button></div>
    {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
    <div className="okr-metrics" aria-label="Current OKR measurements">
      <article className={`card okr-metric okr-metric--${completionTone}`}>
        <div className="eyebrow">Weekly exercise completion</div>
        <strong>{completion == null ? '—' : `${completion}%`}</strong>
        <div className="okr-metric-detail">
          <div className="okr-progress" role="progressbar" aria-label="Weekly exercise completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion == null ? 0 : Math.min(100, completion)}><span style={{ width: `${completion == null ? 0 : Math.min(100, completion)}%` }} /></div>
          <div className="okr-metric-detail__row">
            <span className="okr-stat"><strong>{metrics?.completed_exercises ?? '—'}</strong><span>completed</span></span>
            <span className="okr-stat"><strong>{metrics?.assigned_exercise_opportunities ?? '—'}</strong><span>assigned this week</span></span>
            <span className={`okr-status-pill okr-status-pill--${completionTone}`}><span className="okr-status-dot" />{completionStatus}</span>
          </div>
        </div>
      </article>
      <article className="card okr-metric okr-metric--info">
        <div className="eyebrow">Average injury recovery</div>
        <strong>{metrics?.average_recovery_days == null ? '—' : `${metrics.average_recovery_days} days`}</strong>
        <div className="okr-metric-detail okr-recovery-detail">
          <span className="okr-status-pill okr-status-pill--info"><span className="okr-status-dot" />{metrics?.recovered_cases ?? 0} cleared cases measured</span>
        </div>
      </article>
    </div>
    <p className="small muted">Weekly completion counts each active assigned exercise once per elapsed day this week. Recovery averages calendar days from injury date to clearance for cases with both dates.</p>

    <div className="okr-proxy-grid">
      <section className="card okr-proxy" aria-labelledby="okr-trainer-title">
        <div className="okr-record-badge okr-record-badge--trainer" aria-label={`Trainer record: ${bestTime(bestTimes, 'trainer_setup')}`}><span>Record</span><strong>{bestTime(bestTimes, 'trainer_setup')}</strong></div>
        <div className="stack-xs okr-proxy-heading"><h3 id="okr-trainer-title">Trainer proxy</h3><p className="muted">Time how long it takes to select an athlete and prepare exercises and milestones.</p></div>
        {workflow !== 'trainer_setup' ? <Button variant="primary" type="button" disabled={workflow !== null} onClick={() => begin('trainer_setup')}>Start trainer session</Button> : <>
          <div className="okr-timer" role="timer" aria-live="off"><span>Trainer session in progress</span><strong>{formatDuration(elapsed)}</strong><Button type="button" onClick={cancel}>Cancel</Button></div>
          <p className="small muted">Practice time study only; it will not edit the athlete’s plan.</p>
          <label className="label" htmlFor="okr-trainer-athlete">Athlete</label>
          <select className="field" id="okr-trainer-athlete" value={athleteId} onChange={(event) => setAthleteId(event.currentTarget.value)}><option value="">Select an athlete</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          <label className="label" htmlFor="okr-injury">Injury</label>
          <select className="field" id="okr-injury" value={injuryId} onChange={(event) => setInjuryId(event.currentTarget.value)}><option value="">Select an injury</option>{injuries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <ChoiceList title="Assign exercises" items={exercises} selected={exerciseIds} onToggle={(id) => toggle(id, exerciseIds, setExerciseIds)} />
          <ChoiceList title="Set milestones" items={milestones} selected={milestoneIds} onToggle={(id) => toggle(id, milestoneIds, setMilestoneIds)} />
          <p className="small muted">Choose an athlete, injury, at least one exercise, and one milestone to finish.</p>
          <Button variant="primary" type="button" disabled={!canFinish || saving} onClick={() => void finish()}>{saving ? 'Saving…' : 'Complete and record time'}</Button>
        </>}
      </section>

      <section className="card okr-proxy" aria-labelledby="okr-coach-title">
        <div className="okr-record-badge okr-record-badge--coach" aria-label={`Coach record: ${bestTime(bestTimes, 'coach_checkin')}`}><span>Record</span><strong>{bestTime(bestTimes, 'coach_checkin')}</strong></div>
        <div className="stack-xs okr-proxy-heading"><h3 id="okr-coach-title">Coach proxy</h3><p className="muted">Time how long it takes to find an athlete, check status, or draft a message.</p></div>
        {workflow !== 'coach_checkin' ? <Button type="button" disabled={workflow !== null} onClick={() => begin('coach_checkin')}>Start coach session</Button> : <>
          <div className="okr-timer" role="timer" aria-live="off"><span>Coach session in progress</span><strong>{formatDuration(elapsed)}</strong><Button type="button" onClick={cancel}>Cancel</Button></div>
          <p className="small muted">Practice time study only; it will not send a message.</p>
          <label className="label" htmlFor="okr-coach-athlete">Athlete</label>
          <select className="field" id="okr-coach-athlete" value={athleteId} onChange={(event) => setAthleteId(event.currentTarget.value)}><option value="">Select an athlete</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          <fieldset className="okr-task-options"><legend className="label">Coach task</legend>
            <label><input type="radio" name="coach-task" checked={coachTask === 'status'} onChange={() => setCoachTask('status')} /> Check athlete status</label>
            <label><input type="radio" name="coach-task" checked={coachTask === 'message'} onChange={() => setCoachTask('message')} /> Draft a message</label>
          </fieldset>
          {coachTask === 'message' && <><label className="label" htmlFor="okr-message">Message draft</label><textarea className="field field--area" id="okr-message" value={messageDraft} onChange={(event) => setMessageDraft(event.currentTarget.value)} placeholder="Write a sample message to the trainer" /></>}
          {coachTask === 'status' && athleteId && <div className="table-wrap admin-table-wrap"><table className="admin-table"><thead><tr><th>Team</th><th>Availability</th><th>Expected back</th></tr></thead><tbody>{selectedStatus.length ? selectedStatus.map((row) => <tr key={row.team_id}><td>{row.team_name}</td><td>{row.availability ?? 'Not set'}</td><td>{row.availability === 'cleared' ? 'Available now' : row.expected_return ? new Date(`${row.expected_return}T12:00:00`).toLocaleDateString() : 'Not set'}</td></tr>) : <tr><td colSpan={3} className="muted">No team status is available for this athlete.</td></tr>}</tbody></table></div>}
          <p className="small muted">Select an athlete and complete a status check or draft a sample message.</p>
          <Button variant="primary" type="button" disabled={!canFinish || saving} onClick={() => void finish()}>{saving ? 'Saving…' : 'Complete and record time'}</Button>
        </>}
      </section>
    </div>

    <section className="stack-sm" aria-labelledby="okr-history-title"><div className="okr-intro"><h3 id="okr-history-title">Recent proxy records</h3><span className="small muted">Records: {bestTime(bestTimes, 'trainer_setup')} trainer · {bestTime(bestTimes, 'coach_checkin')} coach</span></div>
      {sessions.length === 0 ? <p className="muted">No completed proxy sessions yet.</p> : <div className="table-wrap admin-table-wrap"><table className="admin-table"><thead><tr><th>Workflow</th><th>Time</th><th>Completed</th><th>Task</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id}><td>{WORKFLOW_LABEL[session.workflow]}</td><td>{formatDuration(session.duration_seconds)}</td><td>{new Date(session.completed_at).toLocaleString()}</td><td>{session.workflow === 'coach_checkin' ? session.details.task === 'message' ? 'Message draft' : 'Status check' : `${Array.isArray(session.details.exercise_ids) ? session.details.exercise_ids.length : 0} exercises · ${Array.isArray(session.details.milestone_ids) ? session.details.milestone_ids.length : 0} milestones`}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

function ChoiceList({ title, items, selected, onToggle }: { title: string; items: Choice[]; selected: string[]; onToggle: (id: string) => void }) {
  return <fieldset className="okr-choice-list"><legend className="label">{title}</legend>{items.length ? <div className="okr-choice-grid">{items.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} /> {item.name}</label>)}</div> : <p className="small muted">No options found.</p>}</fieldset>;
}

function formatDuration(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
function bestTime(rows: BestTimeRow[], kind: Workflow) { const best = rows.find((row) => row.workflow === kind)?.best_seconds; return best === undefined ? '—' : formatDuration(best); }
