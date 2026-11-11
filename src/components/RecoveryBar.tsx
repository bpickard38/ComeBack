import { PRACTICE_PERCENT, type RecoveryPace } from '../domain/recovery';
import { formatCalendarDay } from '../format';

/**
 * Recovery progress with a mark where practice starts; the end of the bar is
 * return to play. The dates underneath are projected from the athlete's
 * pace, so they move as results come in. The bar itself is hidden from
 * screen readers because the text beside it says the same thing.
 */
export function RecoveryBar({ pace, cleared }: { pace: RecoveryPace; cleared: boolean }) {
  const atPractice = pace.percent >= PRACTICE_PERCENT;

  return (
    <div className="recovery-bar">
      <div className="recovery-bar__head">
        <span className="strong">{pace.percent}%</span>
        <span className="small muted">
          {cleared ? 'Cleared to play' : pace.percent >= 100 ? 'Every milestone reached' : atPractice ? 'Ready for practice' : 'In rehab'}
        </span>
      </div>
      <div className="recovery-bar__track" aria-hidden="true">
        <div className="recovery-bar__fill" style={{ width: `${pace.percent}%` }} />
        <div className="recovery-bar__mark" style={{ left: `${PRACTICE_PERCENT}%` }} />
      </div>
      {!cleared && (
        <dl className="recovery-bar__dates small">
          <div>
            <dt>Practice ({PRACTICE_PERCENT}%)</dt>
            <dd>{atPractice ? 'Reached' : pace.practiceOn ? `On pace for ${formatCalendarDay(pace.practiceOn)}` : 'No pace yet'}</dd>
          </div>
          <div>
            <dt>Play (100%)</dt>
            <dd>
              {pace.percent >= 100
                ? 'Waiting on the trainer to clear'
                : pace.playOn
                  ? `On pace for ${formatCalendarDay(pace.playOn)}`
                  : 'No pace yet'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
