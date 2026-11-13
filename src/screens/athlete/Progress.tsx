import { Card } from '../../components/Card';
import { availabilityLabel } from '../../domain/availability';
import { currentValue, goalPercent, goalsReached, isGoalReached } from '../../domain/goals';
import { formatCalendarDay, injuryLabel } from '../../format';
import { testsFor, useAppStore, useSignedInAthlete } from '../../store/AppStore';
import { GoalCard } from './Goals';

/**
 * "How close am I to playing again?" A road to recovery: one bar split into
 * a segment per milestone, then each milestone as a stop along a path that
 * ends at return to play.
 */
export function Progress() {
  const { state } = useAppStore();
  const me = useSignedInAthlete();
  const tests = testsFor(state, me.id);
  const met = goalsReached(tests, state.results, me.id);
  const allMet = tests.length > 0 && met === tests.length;
  const next = tests.find((t) => !isGoalReached(t, state.results, me.id));
  const nextPercent = next ? goalPercent(next, currentValue(next, state.results, me.id)) : 100;

  return (
    <>
      <Card className="recovery-summary">
        <div className="stack-xs">
          <div className="eyebrow">Road to recovery</div>
          <h1>Your recovery</h1>
          <p className="muted">
            {injuryLabel(me)} &middot; {availabilityLabel(me.availability)}
            {me.expectedReturn && <> &middot; expected back {formatCalendarDay(me.expectedReturn)}</>}
          </p>
        </div>

        {tests.length > 0 && (
          <div className="recovery-meter">
            {/* The bar tracks only the next milestone. When the trainer records a passing result,
                it moves on to the one after. Test results drive it, never exercise logs. */}
            {next ? (
              <div className="stack-xs">
                <div className="eyebrow">Next milestone</div>
                <div className="recovery-meter__headline">
                  <span className="recovery-meter__name">{next.name}</span>
                  <span className="recovery-meter__pct">{nextPercent}%</span>
                </div>
                {/* The percentage above says the same thing, so the bar is hidden from screen readers. */}
                <div className="recovery-meter__track" aria-hidden="true">
                  {nextPercent > 0 && (
                    <div className="recovery-meter__fill" style={{ width: `${nextPercent}%` }} />
                  )}
                </div>
                <div className="small muted">
                  {met} of {tests.length} milestones reached
                </div>
              </div>
            ) : (
              <div className="recovery-meter__headline">
                <span className="recovery-meter__name">All {tests.length} milestones reached</span>
              </div>
            )}

            <div className="stack-xs">
              <ul className="milestone-chips">
                {tests.map((test) => {
                  // Only the next milestone's percentage is shown, in the bar above. Chips just say done or not.
                  const reached = isGoalReached(test, state.results, me.id);
                  return (
                    <li key={test.id} className={`milestone-chip${reached ? ' milestone-chip--reached' : ''}`}>
                      {reached && (
                        <span className="milestone-chip__mark" aria-hidden="true">
                          ✓
                        </span>
                      )}
                      <span>{test.name}</span>
                      {reached && <span className="visually-hidden">(reached)</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </Card>


      {tests.length === 0 ? (
        <Card>
          <p className="muted">
            Your trainer hasn&rsquo;t set any milestones yet. They&rsquo;ll appear here after your next visit.
          </p>
        </Card>
      ) : (
        <ol className="recovery-path" aria-label="Milestones">
          {tests.map((test, index) => {
            const reached = isGoalReached(test, state.results, me.id);
            return (
              <li key={test.id} className={`recovery-path__step${reached ? ' recovery-path__step--reached' : ''}`}>
                <span className="recovery-path__marker" aria-hidden="true">
                  {reached ? '✓' : index + 1}
                </span>
                <GoalCard test={test} athleteId={me.id} />
              </li>
            );
          })}
          <li className={`recovery-path__step recovery-path__step--finish${allMet ? ' recovery-path__step--reached' : ''}`}>
            <span className="recovery-path__marker" aria-hidden="true">
              &#9873;
            </span>
            <Card className={allMet ? 'card--mist' : undefined}>
              <h2 className="title">Return to play</h2>
              <p className="muted">
                {allMet
                  ? 'Every milestone reached. Your trainer will confirm you’re cleared at your next visit.'
                  : 'Reach every milestone above and your trainer can clear you to return.'}
              </p>
            </Card>
          </li>
        </ol>
      )}
    </>
  );
}
