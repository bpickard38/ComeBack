import { useAppStore } from '../store/AppStore';
import { supabase } from '../store/supabase';

const ROLE_LABEL = { athlete: 'Athlete', trainer: 'Athletic trainer', coach: 'Coach' } as const;

/** Navy top bar: logo, who is signed in, and sign out. */
export function Header() {
  const { profile } = useAppStore();

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 17l5-5 4 4 7-8" />
          <path d="M15 8h5v5" />
        </svg>
        <span>Comeback</span>
      </div>
      <div className="account">
        <span className="account__who">
          {profile.name} <span className="account__role">&middot; {ROLE_LABEL[profile.role]}</span>
        </span>
        <button type="button" className="role-switch__btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
