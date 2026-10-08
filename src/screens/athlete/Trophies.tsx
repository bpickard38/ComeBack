import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { Medal } from '../../components/TrophyIcon';
import { pointsFor, POINTS_PER_EXERCISE, POINTS_PER_GOAL } from '../../domain/points';
import { RANKS, rankStatus } from '../../domain/rank';
import { bestStreak, currentStreak } from '../../domain/streak';
import { plural } from '../../format';
import { testsFor, useAppStore, useSignedInAthlete } from '../../store/AppStore';

export function Trophies() {
  const { state } = useAppStore();
  const me = useSignedInAthlete();
  const now = new Date();
  const points = pointsFor(me, state.logs, testsFor(state, me.id), state.results);
  const status = rankStatus(points.total);
  const { rank, next } = status;

  return (
    <>
      <Card className="card--dark">
        <div className="rank-hero">
          <Medal metal={rank.metal} large />
          <div>
            <div className="eyebrow eyebrow--on-dark">Your rank &middot; {rank.metal} trophy</div>
            <h1 className="rank-hero__name">{rank.name}</h1>
          </div>
        </div>
        <div className="stack-sm">
          <ProgressBar percent={status.percentToNext} onDark />
          <div className="on-dark-muted">
            {next
              ? `${plural(status.pointsToNext, 'more point')} to reach ${next.name} (${next.metal.toLowerCase()})`
              : 'Top rank reached'}
          </div>
        </div>
        <div className="small on-dark-muted">
          {plural(points.exercisesLogged, 'exercise')} logged ({plural(POINTS_PER_EXERCISE, 'point')} each) +{' '}
          {plural(points.goalsReached, 'goal')} reached ({plural(POINTS_PER_GOAL, 'point')} each)
        </div>
        <dl className="stats">
          <div>
            <dt>Day streak</dt>
            <dd>{currentStreak(me, state.logs, now)}</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>{bestStreak(me, state.logs, now)}</dd>
          </div>
          <div>
            <dt>Points</dt>
            <dd>{points.total}</dd>
          </div>
        </dl>
      </Card>

      <h2 className="section-title">
        Trophy ladder &middot; {status.index + 1} of {RANKS.length} earned
      </h2>
      <ol className="trophy-grid">
        {RANKS.map((r, i) => {
          const earned = i <= status.index;
          const current = i === status.index;
          const label = current
            ? 'Current rank'
            : earned
              ? 'Earned'
              : `Locked · ${plural(r.minPoints - points.total, 'point')} away`;
          return (
            <li key={r.name} className={`trophy${earned ? ' trophy--earned' : ''}${current ? ' trophy--current' : ''}`}>
              <Medal metal={earned ? r.metal : null} />
              <div className="strong">{r.name}</div>
              <div className="small muted">
                {r.metal} &middot; {r.minPoints} points
              </div>
              <div className={earned ? 'small strong' : 'small strong muted'}>{label}</div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
