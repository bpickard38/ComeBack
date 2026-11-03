import { Outlet } from 'react-router-dom';
import { TabBar, type Tab } from '../../components/TabBar';
import { athleteThread, unreadIn } from '../../domain/messages';
import type { MessageThread } from '../../domain/types';
import { useAppStore } from '../../store/AppStore';

/**
 * Wraps staff screens with role-specific navigation and the active screen.
 */
export function StaffLayout() {
  const { state, profile } = useAppStore();
  if (state.role === 'coach') {
    const tabs: Tab[] = [{ to: '/staff', label: 'Availability', icon: 'availability' }];
    return (
      <div className="staff-layout">
        <aside className="staff-layout__sidebar">
          <TabBar tabs={tabs} label="Coach sections" className="tabs--staff" />
        </aside>
        <section className="staff-layout__content" aria-label="Coach workspace">
          <Outlet />
        </section>
      </div>
    );
  }

  // How many conversations have something you haven't read, shown on the tab.
  const threads: MessageThread[] = ['coach-trainer', ...state.athletes.map((a) => athleteThread(a.id))];
  const waiting = threads.filter((t) => unreadIn(state.messages, t, profile.id) > 0).length;
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
        <Outlet />
      </section>
    </div>
  );
}
