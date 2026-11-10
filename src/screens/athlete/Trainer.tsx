import { ChatThread } from '../../components/Chat';
import { athleteThread, messagesIn } from '../../domain/messages';
import { formatDay, formatTime } from '../../format';
import { useAppStore, useSignedInAthlete } from '../../store/AppStore';
import { upcomingAppointments } from '../../domain/appointments';
import { Appointments } from './Appointments';

/**
 * Everything between the athlete and their trainer: upcoming visits (folded
 * away so the chat stays near the top) and the direct message thread.
 */
export function Trainer() {
  const { state } = useAppStore();
  const me = useSignedInAthlete();
  const thread = athleteThread(me.id);
  // Use the trainer's name once they've written; until then, a generic one.
  const trainerName = messagesIn(state.messages, thread).find((m) => m.from === 'Trainer')?.senderName ?? 'Your trainer';
  const upcoming = upcomingAppointments(state.appointments, me.id, new Date());
  const next = upcoming[0];

  return (
    <>
      <h1 className="visually-hidden">Trainer</h1>

      <details className="card appt-drawer">
        <summary className="appt-drawer__summary">
          <span className="stack-xs">
            <span className="appt-drawer__heading">
              <span className="eyebrow">Upcoming appointments</span>
              {upcoming.length > 0 && (
                <span className="appt-count" aria-label={`${upcoming.length} upcoming appointments`}>
                  {upcoming.length}
                </span>
              )}
            </span>
            <span className="strong">
              {next ? `Next: ${formatDay(next.startsAt)} · ${formatTime(next.startsAt)}` : 'Nothing scheduled'}
            </span>
          </span>
        </summary>
        <div className="appt-drawer__body">
          <Appointments />
        </div>
      </details>

      <ChatThread thread={thread} name={trainerName} detail="Athletic trainer. Your coach can’t see these." />
    </>
  );
}
