import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { findLog } from '../../domain/logs';
import { availabilityLabel } from '../../domain/availability';
import { currentValue, goalPercent, goalsReached, isGoalReached, overallGoalPercent } from '../../domain/goals';
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
  const overall = overallGoalPercent(tests, state.results, me.id);
  const allMet = tests.length > 0 && met === tests.length;
  const next = tests.find((t) => !isGoalReached(t, state.results, me.id));

  // Today's exercises, so the next goal can point at the work that builds toward it.
  const now = new Date();
  const assigned = me.assignedExerciseIds.length;
  const doneToday = me.assignedExerciseIds.filter((id) => findLog(state.logs, me.id, id, now)).length;

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
            {/* Milestones reached is the headline: the trainer's test results decide it, not exercise logs. */}
            <div className="recovery-meter__headline">
              <span className="recovery-meter__pct">
                {met} of {tests.length}
              </span>
              <span className="muted">milestones reached</span>
            </div>
            {/* The bar also moves as results improve between milestones. The headline says the
                same thing in words, so the bar is hidden from screen readers. */}
            <div className="recovery-meter__track" aria-hidden="true">
              <div className="recovery-meter__fill" style={{ width: `${overall}%` }} />
            </div>

            <div className="stack-xs">
              <ul className="milestone-chips">
                {tests.map((test) => {
                  const reached = isGoalReached(test, state.results, me.id);
                  const percent = goalPercent(test, currentValue(test, state.results, me.id));
                  return (
                    <li key={test.id} className={`milestone-chip${reached ? ' milestone-chip--reached' : ''}`}>
                      {reached && (
                        <span className="milestone-chip__mark" aria-hidden="true">
                          ✓
                        </span>
                      )}
                      <span>{test.name}</span>
                      <span className="milestone-chip__pct">{reached ? 'Reached' : `${percent}%`}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </Card>

      {next && (
        <Link to="/athlete" className="card next-visit">
          <span className="stack-xs">
            <span className="eyebrow">Next goal</span>
            <span className="strong">Pass: {next.name}</span>
            {assigned > 0 && (
              <span className="muted">
                Today&rsquo;s exercises build toward it &middot; {doneToday} of {assigned} done
              </span>
            )}
          </span>
          <span className="next-visit__arrow" aria-hidden="true">&rsaquo;</span>
        </Link>
      )}

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
