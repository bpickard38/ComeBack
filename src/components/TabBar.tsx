import { NavLink } from 'react-router-dom';
import { AppIcon, type AppIconName } from './AppIcon';

export interface Tab {
  to: string;
  label: string;
  icon: AppIconName;
  unreadCount?: number;
}

/**
 * Row of tabs that are real links, so each tab has its own URL and the
 * browser back button works. NavLink marks the current one with
 * aria-current="page", which the CSS uses for the selected style.
 */
export function TabBar({ tabs, label, className = '' }: { tabs: Tab[]; label: string; className?: string }) {
  return (
    <nav className={`tabs ${className}`.trim()} aria-label={label}>
      {tabs.map((t) => (
        // `end` stops "/athlete" from also counting as active on "/athlete/goals".
        <NavLink key={t.to} to={t.to} end className="tabs__tab">
          <AppIcon name={t.icon} className="nav-icon" />
          <span>{t.label}</span>
          {!!t.unreadCount && (
            <>
              <span className="tabs__count" aria-hidden="true">{t.unreadCount}</span>
              <span className="visually-hidden">
                {t.unreadCount} unread {t.unreadCount === 1 ? 'message' : 'messages'}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
