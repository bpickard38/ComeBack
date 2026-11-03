import { useEffect, useRef } from 'react';
import { ProgressBar } from '../../components/ProgressBar';
import { Medal } from '../../components/TrophyIcon';
import { pointsFromEvents } from '../../domain/points';
import { RANKS, rankStatus } from '../../domain/rank';
import { plural } from '../../format';
import { useAppStore, useSignedInAthlete } from '../../store/AppStore';

export function Trophies() {
  const { state } = useAppStore();
  const me = useSignedInAthlete();
  const points = pointsFromEvents(me.id, state.pointEvents);
  const ranks = state.ranks.length ? state.ranks : RANKS;
  const status = rankStatus(points.total, ranks);
  const { rank, next } = status;
  const trackRef = useRef<HTMLDivElement>(null);
  const currentRankRef = useRef<HTMLLIElement>(null);

  function centerRank(button: HTMLButtonElement) {
    const track = trackRef.current;
    const rankElement = button.closest('li');
    if (!track || !rankElement) return;

    const top = rankElement.offsetTop - (track.clientHeight - rankElement.clientHeight) / 2;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  useEffect(() => {
    const track = trackRef.current;
    const current = currentRankRef.current;
    if (!track || !current) return;

    const top = current.offsetTop - (track.clientHeight - current.clientHeight) / 2;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [status.index]);

  return (
    <div className="trophy-page">
      <section className={`trophy-hero trophy-hero--${rank.metal.toLowerCase()}`} aria-labelledby="trophy-title">
        <div className="trophy-hero__identity">
          <Medal metal={rank.metal} large />
          <div className="trophy-hero__title">
            <div className="eyebrow trophy-hero__eyebrow">Current rank</div>
            <h1 id="trophy-title">{rank.name}</h1>
            <div className="trophy-hero__metal">{rank.metal}</div>
          </div>
        </div>

        <div className="trophy-hero__progress">
          <div className="spread">
            <span className="strong">{next ? `Progress to ${next.name}` : 'Top rank reached'}</span>
            {next && <span className="strong">{status.percentToNext}%</span>}
          </div>
          <ProgressBar percent={status.percentToNext} size="lg" onDark />
          {next && (
            <div className="trophy-hero__progress-copy">
              {plural(points.total - rank.minPoints, 'point')} of {plural(next.minPoints - rank.minPoints, 'point')} toward {next.name}
            </div>
          )}
        </div>

        <dl className="trophy-hero__stats">
          <div>
            <dt>Total points</dt>
            <dd>{points.total}</dd>
          </div>
          <div>
            <dt>Exercises</dt>
            <dd>{points.exercisesLogged}</dd>
          </div>
          <div>
            <dt>Goals reached</dt>
            <dd>{points.goalsReached}</dd>
          </div>
        </dl>
      </section>

      <section className="rank-ladder" aria-labelledby="rank-ladder-title">
        <div className="rank-ladder__heading">
          <h2 id="rank-ladder-title">Rank ladder</h2>
          <span className="small muted">Rank {status.index + 1} of {ranks.length}</span>
        </div>
        <div className="rank-ladder__viewport" ref={trackRef}>
          <ol className="rank-track" aria-label="Ranks and point thresholds">
            {ranks.map((item, index) => {
              const achieved = index < status.index;
              const current = index === status.index;
              const reached = index <= status.index;
              const stateLabel = current ? 'Current rank' : achieved ? 'Achieved' : 'Not reached';

              return (
                <li
                  key={item.name}
                  ref={current ? currentRankRef : undefined}
                  className={`rank-track__step${reached ? ' rank-track__step--reached' : ''}${current ? ' rank-track__step--current' : ''}`}
                >
                  <button
                    type="button"
                    className="rank-track__button"
                    aria-current={current ? 'step' : undefined}
                    aria-label={`${item.name}. ${stateLabel}. Requires ${plural(item.minPoints, 'point')}. Center this rank.`}
                    onClick={(event) => centerRank(event.currentTarget)}
                  >
                    <span className="rank-track__medal">
                      <Medal metal={reached ? item.metal : null} large={current} />
                    </span>
                    <span className="rank-track__details">
                      <span className="rank-track__name">{item.name}</span>
                      <span className="rank-track__threshold">{plural(item.minPoints, 'point')}</span>
                    </span>
                    <span className="rank-track__state">{stateLabel}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </div>
  );
}
