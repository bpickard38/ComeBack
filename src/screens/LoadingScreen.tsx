/** Page-shaped placeholders shown while Supabase checks the session/profile. */
export function LoadingScreen({ variant }: { variant: 'landing' | 'app' }) {
  return (
    <div className={`loading-screen loading-screen--${variant}`} role="status" aria-label="Loading Comeback">
      <span className="visually-hidden">Loading Comeback...</span>
      <div className="loading-screen__page" aria-hidden="true">
        {variant === 'landing' ? (
          <>
            <div className="loading-screen__landing-header">
              <div className="loading-skeleton loading-screen__logo" />
              <div className="loading-skeleton loading-screen__audience" />
            </div>
            <div className="loading-screen__landing-hero">
              <div className="loading-screen__copy">
                <div className="loading-skeleton loading-screen__eyebrow" />
                <div className="loading-skeleton loading-screen__headline" />
                <div className="loading-skeleton loading-screen__headline loading-screen__headline--short" />
                <div className="loading-skeleton loading-screen__paragraph" />
                <div className="loading-skeleton loading-screen__paragraph loading-screen__paragraph--short" />
                <div className="loading-screen__buttons">
                  <div className="loading-skeleton loading-screen__button" />
                  <div className="loading-skeleton loading-screen__button loading-screen__button--secondary" />
                </div>
              </div>
              <div className="loading-skeleton loading-screen__hero-image" />
            </div>
          </>
        ) : (
          <>
            <div className="loading-screen__app-header">
              <div className="loading-skeleton loading-screen__logo" />
              <div className="loading-skeleton loading-screen__profile" />
            </div>
            <div className="loading-screen__app-body">
              <div className="loading-screen__sidebar">
                <div className="loading-skeleton" />
                <div className="loading-skeleton" />
                <div className="loading-skeleton" />
              </div>
              <div className="loading-screen__panels">
                <div className="loading-skeleton loading-screen__panel loading-screen__panel--wide" />
                <div className="loading-skeleton loading-screen__panel" />
                <div className="loading-skeleton loading-screen__panel" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
