import { Outlet } from 'react-router-dom';
import { TabBar } from '../../components/TabBar';

const ATHLETE_TABS = [
  { to: '/athlete', label: 'Today' },
  { to: '/athlete/goals', label: 'Progress' },
  { to: '/athlete/trophies', label: 'Trophies' },
  { to: '/athlete/appointments', label: 'Appointments' },
];

/** Single 520px column with the athlete tabs. <Outlet /> is where the current tab's screen goes. */
export function AthleteLayout() {
  return (
    <div className="column">
      <TabBar tabs={ATHLETE_TABS} label="Athlete sections" />
      <Outlet />
    </div>
  );
}
