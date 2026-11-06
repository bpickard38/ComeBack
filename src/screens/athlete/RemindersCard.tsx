import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useToast } from '../../components/Toast';
import { MISSED_HOUR, REMINDER_HOUR } from '../../domain/reminder';
import { pushStatus, turnOffReminders, turnOnReminders, type PushStatus } from '../../push';

/** "6 PM", "9 AM" */
function hourText(hour: number): string {
  return hour < 12 ? `${hour} AM` : `${hour === 12 ? 12 : hour - 12} PM`;
}

const WHAT_YOU_GET = `A nudge at ${hourText(REMINDER_HOUR)} if exercises are left, and at ${hourText(MISSED_HOUR)} if you missed any yesterday.`;

/** Turn push reminders on or off for this device. Hidden until push is set up (VITE_VAPID_PUBLIC_KEY). */
export function RemindersCard({ compact = false }: { compact?: boolean }) {
  const { notify } = useToast();
  // undefined while we ask the browser.
  const [status, setStatus] = useState<PushStatus>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushStatus().then(setStatus);
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    const result = on ? await turnOnReminders() : await turnOffReminders();
    setBusy(false);
    setStatus(await pushStatus());
    if (!result.ok) notify(result.error, 'error');
    else notify(on ? 'Reminders are on for this device.' : 'Reminders are off for this device.');
  }

  if (status === undefined || status === 'not-configured') return null;

  if (compact) {
    return (
      <div className="reminders-inline" aria-label="Exercise notifications">
        {status === 'on' ? (
          <Button disabled={busy} onClick={() => toggle(false)}>Notifications on · Turn off</Button>
        ) : status === 'off' ? (
          <Button variant="primary" disabled={busy} onClick={() => toggle(true)}>
            {busy ? 'One moment…' : 'Turn on notifications'}
          </Button>
        ) : (
          <span className="small muted" role="status">
            {status === 'needs-install' ? 'Install the app to turn on notifications' :
              status === 'denied' ? 'Notifications blocked in browser settings' :
              'Notifications unavailable in this browser'}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card aria-labelledby="reminders-title">
      <h2 id="reminders-title" className="title">
        Reminders
      </h2>
      {status === 'on' && (
        <>
          <p className="small">
            <span className="strong">On for this device.</span> {WHAT_YOU_GET}
          </p>
          <Button className="align-start" disabled={busy} onClick={() => toggle(false)}>
            Turn off
          </Button>
        </>
      )}
      {status === 'off' && (
        <>
          <p className="small muted">{WHAT_YOU_GET}</p>
          <Button variant="primary" className="align-start" disabled={busy} onClick={() => toggle(true)}>
            {busy ? 'One moment…' : 'Turn on reminders'}
          </Button>
        </>
      )}
      {status === 'needs-install' && (
        <p className="small muted">
          {WHAT_YOU_GET} On iPhone, first tap <span className="strong">Share</span>, then{' '}
          <span className="strong">Add to Home Screen</span>. Open Comeback from your home screen and turn reminders on
          there.
        </p>
      )}
      {status === 'denied' && (
        <p className="small muted">
          Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings, then come back here.
        </p>
      )}
      {status === 'unsupported' && (
        <p className="small muted">This browser can&rsquo;t show reminders. Try Chrome, Edge, Firefox or Safari.</p>
      )}
    </Card>
  );
}
