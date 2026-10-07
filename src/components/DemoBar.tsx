import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/AppStore';
import { Button } from './Button';
import { useToast } from './Toast';

/** Pale blue strip of demo-only controls. Not part of the real product. */
export function DemoBar() {
  const { state, commands } = useAppStore();
  const { dismiss } = useToast();
  const navigate = useNavigate();

  return (
    <div className="demo-bar">
      <span className="demo-bar__label">Prototype controls</span>
      <Button
        onClick={() => {
          commands.simulateReminder(); // also switches to the athlete
          dismiss();
          navigate('/athlete');
        }}
      >
        Simulate end-of-day reminder
      </Button>
      <Button aria-pressed={state.offline} onClick={commands.toggleOffline}>
        {state.offline ? 'Connection: offline' : 'Connection: online'}
      </Button>
      <Button
        onClick={() => {
          commands.resetDemo();
          dismiss();
          navigate('/athlete');
        }}
      >
        Reset demo data
      </Button>
    </div>
  );
}
