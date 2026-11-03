import { Link } from 'react-router-dom';
import { turnOffReminders } from '../push';
import { useAppStore } from '../store/AppStore';
import { supabase } from '../store/supabase';

const ROLE_LABEL = { athlete: 'Athlete', trainer: 'Athletic trainer', coach: 'Coach' } as const;

/** Shared app header: brand, signed-in account, and sign out. */
export function Header() {
  const { profile } = useAppStore();

  async function signOut() {
    // Stop this device's reminders first (needs you signed in), so the next
    // person on this phone doesn't get yours.
    await turnOffReminders().catch(() => undefined);
    await supabase.auth.signOut();
  }

  return (
    <header className="topbar">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Link className="brand" to="/" aria-label="Comeback home">
        <svg className="icon icon--brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 17l5-5 4 4 7-8" />
          <path d="M15 8h5v5" />
        </svg>
        <span>Comeback</span>
      </Link>
      <div className="account">
        <span className="account__who">
          {profile.name} <span className="account__role">&middot; {ROLE_LABEL[profile.role]}</span>
        </span>
        <button type="button" className="btn btn--secondary" onClick={signOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
