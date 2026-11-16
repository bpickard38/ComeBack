import { Link } from 'react-router-dom';
import { PetSprite } from '../components/PetSprite';
import { DEFAULT_LOOK } from '../domain/pet';

/** Public introduction shown before someone signs in. */
export function Landing() {
  return (
    <div className="app landing">
      <header className="landing__header">
        <Link className="landing__brand" to="/" aria-label="Comeback home">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 17l5-5 4 4 7-8" />
            <path d="M15 8h5v5" />
          </svg>
          <span>Comeback</span>
        </Link>
        <span className="landing__audience">For trainers, athletes &amp; coaches</span>
      </header>

      <main className="landing__main">
        <section className="landing__hero" aria-labelledby="landing-title">
          <div className="landing__copy">
            <p className="landing__eyebrow">Built for athletic trainers</p>
            <h1 id="landing-title">Plan rehab. Track athlete progress.</h1>
            <p className="landing__description">
              Use AI to draft plans and exercises, follow recovery between visits, and keep coaches in the loop.
            </p>
            <div className="landing__actions" role="group" aria-label="Get started">
              <Link className="btn btn--primary" to="/signup">Create your account</Link>
              <Link className="btn btn--secondary" to="/signin">Sign in</Link>
            </div>
          </div>

          <figure className="landing__visual">
            <img
              src="/comeback-rehab-hero.png"
              alt="An athlete practices a balance exercise with guidance from a trainer in a bright rehabilitation studio."
              fetchPriority="high"
            />
            <figcaption className="landing__visual-caption">
              <span className="landing__caption-mark" aria-hidden="true">✓</span>
              <span><strong>Progress, together</strong><br />A connected recovery team</span>
            </figcaption>
          </figure>
        </section>

        <section className="landing__features" aria-labelledby="landing-features-title">
          <div className="landing__features-heading">
            <p className="landing__eyebrow">One place for the recovery team</p>
            <h2 id="landing-features-title">Support athletes between visits.</h2>
          </div>
          <div className="landing__feature-grid">
            <article className="landing__feature-card">
              <div className="landing__feature-art landing__feature-art--plan" aria-hidden="true">
                <div className="landing__plan-window">
                  <span className="landing__plan-label">TRAINER ASSISTANT</span>
                  <div className="landing__plan-prompt">Draft a plan for Maya&rsquo;s ankle rehab</div>
                  <div className="landing__plan-row"><span /><span /></div>
                  <div className="landing__plan-row"><span /><span /></div>
                  <div className="landing__plan-status"><i /> Ready for trainer review</div>
                </div>
              </div>
              <div className="landing__feature-copy">
                <p className="landing__feature-kicker">For athletic trainers</p>
                <h3>Build plans with AI.</h3>
                <p>Talk through an athlete&rsquo;s visit with AI to draft a plan or add exercises. Review it before saving.</p>
              </div>
            </article>

            <article className="landing__feature-card">
              <div className="landing__feature-art landing__feature-art--player" aria-hidden="true">
                <span className="landing__player-star">&#10022;</span>
                <PetSprite state="happy" look={DEFAULT_LOOK} scale={2} />
                <div className="landing__player-progress">
                  <span>Today&rsquo;s plan</span>
                  <div><i /></div>
                  <strong>Progress gives your player energy</strong>
                </div>
              </div>
              <div className="landing__feature-copy">
                <p className="landing__feature-kicker">For athletes</p>
                <h3>Help athletes stay on track.</h3>
                <p>Athletes get a customizable player that gains energy as they log exercises. Milestones show their progress.</p>
              </div>
            </article>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <span>Comeback</span>
        <span>Built for trainers and their athletes.</span>
      </footer>
    </div>
  );
}
