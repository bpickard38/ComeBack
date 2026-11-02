import { Outlet } from 'react-router-dom';
import { TabBar } from '../../components/TabBar';
import { athleteThread, awaitsTrainer } from '../../domain/messages';
import type { MessageThread } from '../../domain/types';
import { useAppStore } from '../../store/AppStore';

/**
 * Wraps the /staff screens. The trainer gets tabs (Roster, Messages); the
 * coach has a single screen, so no tabs. <Outlet /> is the current screen.
 */
export function StaffLayout() {
  const { state } = useAppStore();
  if (state.role === 'coach') return <Outlet />;

  // How many conversations are waiting on the trainer, shown on the tab.
  const threads: MessageThread[] = ['coach-trainer', ...state.athletes.map((a) => athleteThread(a.id))];
  const waiting = threads.filter((t) => awaitsTrainer(state.messages, t)).length;
  const tabs = [
    { to: '/staff', label: 'Roster' },
    { to: '/staff/messages', label: waiting > 0 ? `Messages (${waiting} new)` : 'Messages' },
  ];

  return (
    <div className="column column--staff">
      <TabBar tabs={tabs} label="Trainer sections" />
      <Outlet />
    </div>
  );
}
