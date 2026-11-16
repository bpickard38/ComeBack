import { Outlet, useLocation } from 'react-router-dom';
import { TabBar, type Tab } from '../../components/TabBar';
import { unreadIn } from '../../domain/messages';
import { ASSISTANT_FEATURE } from '../../features';
import { teamThreads } from '../../domain/teams';
import { useAppStore } from '../../store/AppStore';
import { AthleteSearch } from './AthleteSearch';
import { TeamSwitcher } from './TeamSwitcher';

/**
 * Wraps the trainer's screens with their navigation. Like the athlete
 * side: on phones the tabs are a bar along the bottom (Team, Exercises,
 * a raised Record button, Messages); on wide screens a left sidebar.
 * Coaches have one screen, so they get no tabs.
 */
export function StaffLayout() {
  const { state, profile } = useAppStore();
  const { pathname } = useLocation();
  if (state.role === 'coach') {
    return <Outlet />;
  }

  // How many conversations have something you haven't read, shown on the tab.
  // Counted across every team, so nothing is missed while looking at one.
  const threads = new Set(state.teams.flatMap((t) => teamThreads(state.athletes, t.id)));
  const waiting = [...threads].filter((t) => unreadIn(state.messages, t, profile.id) > 0).length;
  const tabs: Tab[] = [
    { to: '/staff', label: 'Team', icon: 'roster' },
    { to: '/staff/exercises', label: 'Exercises', icon: 'exercises' },
    ...(ASSISTANT_FEATURE ? [{ to: '/staff/record', label: 'Record', icon: 'record', className: 'tabs__tab--record' } satisfies Tab] : []),
    { to: '/staff/messages', label: 'Messages', icon: 'messages', unreadCount: waiting },
  ];

  // The team picker and athlete search belong to team screens; Record and
  // Exercises cover every team, so they get the whole screen.
  const teamScreen = !pathname.startsWith('/staff/record') && !pathname.startsWith('/staff/exercises');

  return (
    <div className="staff-layout">
      <aside className="staff-layout__sidebar">
        <TabBar tabs={tabs} label="Trainer sections" className="tabs--staff" />
      </aside>
      <section className="staff-layout__content" aria-label="Trainer workspace">
        {teamScreen && (
          <>
            {/* Across every team; the roster below has its own search for one team. */}
            <AthleteSearch />
            {/* Team and Messages both show the team picked here. */}
            <TeamSwitcher />
          </>
        )}
        <Outlet />
      </section>
    </div>
  );
}
