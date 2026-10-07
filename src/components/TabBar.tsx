import { NavLink } from 'react-router-dom';

export interface Tab {
  to: string;
  label: string;
}

/**
 * Row of tabs that are real links, so each tab has its own URL and the
 * browser back button works. NavLink marks the current one with
 * aria-current="page", which the CSS uses for the filled style.
 */
export function TabBar({ tabs, label }: { tabs: Tab[]; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((t) => (
        // `end` stops "/athlete" from also counting as active on "/athlete/goals".
        <NavLink key={t.to} to={t.to} end className="tabs__tab">
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
