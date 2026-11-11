import { Outlet } from 'react-router-dom';
import { TabBar, type Tab } from '../../components/TabBar';
import { unreadIn } from '../../domain/messages';
import { teamThreads } from '../../domain/teams';
import { useAppStore } from '../../store/AppStore';
import { AthleteSearch } from './AthleteSearch';
import { TeamSwitcher } from './TeamSwitcher';

/**
 * Wraps staff screens with role-specific navigation and the active screen.
 */
export function StaffLayout() {
  const { state, profile } = useAppStore();
  if (state.role === 'coach') {
    return <Outlet />;
  }

  // How many conversations have something you haven't read, shown on the tab.
  // Counted across every team, so nothing is missed while looking at one.
  const threads = new Set(state.teams.flatMap((t) => teamThreads(state.athletes, t.id)));
  const waiting = [...threads].filter((t) => unreadIn(state.messages, t, profile.id) > 0).length;
  const tabs: Tab[] = [
    { to: '/staff', label: 'Roster', icon: 'roster' },
    { to: '/staff/messages', label: 'Messages', icon: 'messages', unreadCount: waiting },
  ];

  return (
    <div className="staff-layout">
      <aside className="staff-layout__sidebar">
        <TabBar tabs={tabs} label="Trainer sections" className="tabs--staff" />
      </aside>
      <section className="staff-layout__content" aria-label="Trainer workspace">
        {/* Across every team; the roster below has its own search for one team. */}
        <AthleteSearch />
        {/* Roster and Messages both show the team picked here. */}
        <TeamSwitcher />
        <Outlet />
      </section>
    </div>
  );
}
