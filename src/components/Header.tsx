import { useNavigate } from 'react-router-dom';
import type { Role } from '../domain/types';
import { homeFor } from '../routes';
import { useAppStore } from '../store/AppStore';
import { useToast } from './Toast';

const ROLES: Array<{ role: Role; label: string }> = [
  { role: 'athlete', label: 'Athlete' },
  { role: 'trainer', label: 'Trainer' },
  { role: 'coach', label: 'Coach' },
];

/** Navy top bar: logo plus the role switcher that stands in for logging in. */
export function Header() {
  const { state, commands } = useAppStore();
  const { dismiss } = useToast();
  const navigate = useNavigate();

  function switchTo(role: Role) {
    commands.setRole(role);
    dismiss();
    navigate(homeFor(role));
  }

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 17l5-5 4 4 7-8" />
          <path d="M15 8h5v5" />
        </svg>
        <span>Comeback</span>
      </div>
      <div className="role-switch" role="group" aria-label="Viewing as">
        {ROLES.map(({ role, label }) => (
          <button
            key={role}
            type="button"
            className="role-switch__btn"
            aria-pressed={state.role === role}
            onClick={() => switchTo(role)}
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}
