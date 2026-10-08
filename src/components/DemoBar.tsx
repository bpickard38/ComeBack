import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/AppStore';
import { Button } from './Button';
import { useToast } from './Toast';

/** Pale blue strip of demo-only controls. Not part of the real product. */
export function DemoBar() {
  const { state, commands } = useAppStore();
  const { dismiss, notify } = useToast();
  const navigate = useNavigate();

  return (
    <div className="demo-bar">
      <span className="demo-bar__label">Prototype controls</span>
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
      <Button aria-pressed={state.offline} onClick={commands.toggleOffline}>
        {state.offline ? 'Connection: offline' : 'Connection: online'}
      </Button>
      {/* Data also refreshes every 30 seconds; this is for showing a change right away. */}
      <Button
        onClick={async () => {
          await commands.reload();
          notify('Up to date.');
        }}
      >
        Refresh data
      </Button>
    </div>
  );
}
