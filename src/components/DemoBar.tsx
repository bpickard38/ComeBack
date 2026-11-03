import { useNavigate } from 'react-router-dom';
import { findLog } from '../domain/logs';
import { listNames } from '../domain/reminder';
import { previewReminder } from '../push';
import { exerciseById, useAppStore } from '../store/AppStore';
import { Button } from './Button';
import { useToast } from './Toast';

/** Demo-only controls, kept at the bottom of the dashboard. */
export function DemoBar() {
  const { state, commands, profile } = useAppStore();
  const { dismiss, notify } = useToast();
  const navigate = useNavigate();

  /** The 6 PM push as it would read right now (same wording as supabase/push.sql). */
  function eveningPush(): [string, string] {
    const me = state.athletes.find((a) => a.id === profile.id);
    const now = new Date();
    const left = (me?.assignedExerciseIds ?? [])
      .filter((id) => !findLog(state.logs, profile.id, id, now))
      .map((id) => exerciseById(state, id).name);
    if (left.length === 0) return ['All done today', 'You finished today’s exercises.'];
    return [
      `${left.length} ${left.length === 1 ? 'exercise' : 'exercises'} left today`,
      `${listNames(left)}. Log them today to keep your streak going.`,
    ];
  }

  return (
    <footer className="demo-bar">
      <details className="demo-panel">
        <summary>Preview tools</summary>
        <div className="demo-panel__controls">
          {state.role === 'athlete' && (
            <Button
              onClick={() => {
                commands.simulateReminder();
                dismiss();
                navigate('/athlete');
              }}
            >
              Simulate end-of-day reminder
            </Button>
          )}
          {state.role === 'athlete' && (
            <Button
              onClick={async () => {
                const result = await previewReminder(...eveningPush());
                if (!result.ok) notify(result.error, 'error');
              }}
            >
              Preview push reminder
            </Button>
          )}
          <Button aria-pressed={state.offline} onClick={commands.toggleOffline}>
            {state.offline ? 'Connection: offline' : 'Connection: online'}
          </Button>
          <Button
            onClick={async () => {
              await commands.reload();
              notify('Up to date.');
            }}
          >
            Refresh data
          </Button>
        </div>
      </details>
    </footer>
  );
}
