import { Card } from '../../components/Card';
import { ChatThread } from '../../components/Chat';
import { AVAILABILITY_OPTIONS, availabilityLabel } from '../../domain/availability';
import { messagesIn } from '../../domain/messages';
import type { Availability } from '../../domain/types';
import { formatCalendarDay, formatDay } from '../../format';
import { useAppStore } from '../../store/AppStore';

// Show who's out first, then limited, then cleared.
const ORDER: Record<Availability, number> = { out: 0, limited: 1, cleared: 2 };

/**
 * The coach sees whether each athlete can play and when they're expected
 * back. Diagnoses, exercises and pain stay with the trainer.
 */
export function CoachView() {
  const { state } = useAppStore();
  const athletes = [...state.athletes].sort((a, b) => ORDER[a.availability] - ORDER[b.availability]);
  // Use the trainer's name once they've written; until then, a generic one.
  const trainerName =
    messagesIn(state.messages, 'coach-trainer').find((m) => m.from === 'Trainer')?.senderName ?? 'Athletic trainer';

  return (
    <div className="column column--staff">
      <div className="stack-xs">
        <div className="eyebrow">{formatDay(new Date())}</div>
        <h1>Team availability</h1>
        <p className="muted">Coach view. Shows who can play and when. Injury details stay with the trainer.</p>
      </div>

      <div className="staff-grid">
        <Card className="card--flush" aria-label="Availability">
          {athletes.length === 0 ? (
            <p className="muted pad">No athletes on the roster yet.</p>
          ) : (
            <div className="table-wrap table-wrap--flush">
              <table className="week">
                <caption className="visually-hidden">Team availability</caption>
                <thead>
                  <tr>
                    <th scope="col">Athlete</th>
                    <th scope="col">Status</th>
                    <th scope="col">Expected back</th>
                  </tr>
                </thead>
                <tbody>
                  {athletes.map((a) => (
                    <tr key={a.id}>
                      <th scope="row">
                        <div className="strong">{a.name}</div>
                        <div className="muted small">{a.sport}</div>
                      </th>
                      <td className={a.availability === 'out' ? 'strong warn-text' : 'strong'}>
                        {availabilityLabel(a.availability)}
                      </td>
                      <td>
                        {a.availability === 'cleared'
                          ? 'Available now'
                          : a.expectedReturn
                            ? formatCalendarDay(a.expectedReturn)
                            : 'Not set'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl className="legend-list small pad">
            {AVAILABILITY_OPTIONS.map((o) => (
              <div key={o.value}>
                <dt className="strong">{o.label}</dt>
                <dd className="muted">{o.meaning}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <ChatThread thread="coach-trainer" name={trainerName} detail="Athletic trainer. Only you two see this." />
      </div>
    </div>
  );
}
