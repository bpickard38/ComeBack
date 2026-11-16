import { useToast } from '../../components/Toast';
import { AVAILABILITY_OPTIONS } from '../../domain/availability';
import type { Athlete, Availability } from '../../domain/types';
import { useAppStore } from '../../store/AppStore';

/**
 * The status the coach sees (Out, Limited, Cleared...) and the expected
 * return date. On the player profile, under Coach sees > Change.
 */
export function AvailabilityEditor({ athlete }: { athlete: Athlete }) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const dateId = `return-${athlete.id}`;

  async function save(availability: Availability, expectedReturn: string | null, announce: boolean) {
    const result = await commands.setAvailability(athlete.id, availability, expectedReturn);
    if (!result.ok) notify(result.error, 'error');
    else if (announce) {
      const label = AVAILABILITY_OPTIONS.find((o) => o.value === availability)?.label;
      notify(`The coach now sees ${athlete.name} as ${label}.`);
    }
  }

  return (
    <fieldset className="chip-group panel">
      <legend className="strong">Status shown to the coach</legend>
      <p className="small muted">The coach sees only this and the return date, not the injury or exercises.</p>
      <div className="row">
        {AVAILABILITY_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={athlete.availability === o.value}
            onClick={() => save(o.value, athlete.expectedReturn, true)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {athlete.availability !== 'cleared' && (
        <div className="stack-xs">
          <label htmlFor={dateId} className="small strong">
            Expected back
          </label>
          <input
            id={dateId}
            type="date"
            className="field field--date"
            value={athlete.expectedReturn ?? ''}
            onChange={(e) => save(athlete.availability, e.target.value || null, false)}
          />
        </div>
      )}
    </fieldset>
  );
}
