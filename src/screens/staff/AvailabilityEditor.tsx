import { Card } from '../../components/Card';
import { useToast } from '../../components/Toast';
import { AVAILABILITY_OPTIONS } from '../../domain/availability';
import type { Athlete, Availability } from '../../domain/types';
import { useAppStore } from '../../store/AppStore';

/**
 * Whether the athlete can practice (Out, Limited, Cleared) and when they're
 * expected back. Always showing on the player profile, right under their
 * name, because it's what the trainer changes most and what the coach sees.
 * Each choice saves as soon as it's pressed.
 */
export function AvailabilityEditor({ athlete }: { athlete: Athlete }) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const dateId = `return-${athlete.id}`;
  const firstName = athlete.name.split(' ')[0];

  async function save(availability: Availability, expectedReturn: string | null, message: string) {
    const result = await commands.setAvailability(athlete.id, availability, expectedReturn);
    if (!result.ok) notify(result.error, 'error');
    else notify(message);
  }

  return (
    <Card className="status-card" aria-labelledby="status-title">
      <div className="stack-xs">
        <h2 id="status-title" className="title">
          Status and return date
        </h2>
        <p className="small muted">
          Saves right away. The coach sees only this and the date, never the injury or exercises.
        </p>
      </div>
      <div className="status-card__body">
        <fieldset className="chip-group">
          <legend className="label">Can {firstName} practice?</legend>
          <div className="status-options">
            {AVAILABILITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`status-option status-option--${o.value}`}
                aria-pressed={athlete.availability === o.value}
                onClick={() => save(o.value, athlete.expectedReturn, `${athlete.name} is now ${o.label}: ${o.meaning.toLowerCase()}.`)}
              >
                <span className="strong">{o.label}</span>
                <span className="small">{o.meaning}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="stack-xs">
          <label htmlFor={dateId} className="label">
            Expected back
          </label>
          {athlete.availability === 'cleared' ? (
            <p className="small muted">Cleared, so there&rsquo;s no return date.</p>
          ) : (
            <input
              id={dateId}
              type="date"
              className="field field--date"
              value={athlete.expectedReturn ?? ''}
              onChange={(e) =>
                save(
                  athlete.availability,
                  e.target.value || null,
                  e.target.value ? `Expected return date saved for ${athlete.name}.` : `Return date removed for ${athlete.name}.`,
                )
              }
            />
          )}
        </div>
      </div>
    </Card>
  );
}
