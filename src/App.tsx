import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DemoBar } from './components/DemoBar';
import { Header } from './components/Header';
import { ToastRegion } from './components/Toast';
import type { Role } from './domain/types';
import { homeFor } from './routes';
import { AthleteLayout } from './screens/athlete/AthleteLayout';
import { Appointments } from './screens/athlete/Appointments';
import { Goals } from './screens/athlete/Goals';
import { Messages } from './screens/athlete/Messages';
import { Today } from './screens/athlete/Today';
import { Week } from './screens/athlete/Week';
import { Trophies } from './screens/athlete/Trophies';
import { StaffHome } from './screens/staff/StaffHome';
import { StaffLayout } from './screens/staff/StaffLayout';
import { TrainerMessages } from './screens/staff/TrainerMessages';
import { useAppStore } from './store/AppStore';

/** Sends you to your role's home screen. */
function RoleHome() {
  const { state } = useAppStore();
  return <Navigate to={homeFor(state.role)} replace />;
}

/**
 * Shows `children` only to the listed roles; anyone else is redirected home.
 * This is how a coach opening /athlete ends up on /staff. (Just navigation:
 * the real access rules are in the database, see supabase/erd_schema.sql.)
 */
function RequireRole({ allowed, children }: { allowed: Role[]; children: ReactNode }) {
  const { state } = useAppStore();
  if (!allowed.includes(state.role)) return <RoleHome />;
  return children;
}

export function App() {
  return (
    <div className="app">
      <Header />
      <ToastRegion />
      <main className="main">
        <Routes>
          <Route path="/" element={<RoleHome />} />
          {/* Nested routes: AthleteLayout draws the tabs, the child fills the rest. */}
          <Route
            path="/athlete"
            element={
              <RequireRole allowed={['athlete']}>
                <AthleteLayout />
              </RequireRole>
            }
          >
            <Route index element={<Today />} />
            <Route path="week" element={<Week />} />
            <Route path="goals" element={<Goals />} />
            <Route path="trophies" element={<Trophies />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="messages" element={<Messages />} />
          </Route>
          <Route
            path="/staff"
            element={
              <RequireRole allowed={['trainer', 'coach']}>
                <StaffLayout />
              </RequireRole>
            }
          >
            <Route index element={<StaffHome />} />
            {/* Coaches message the trainer from their home screen, so this is trainer-only. */}
            <Route
              path="messages"
              element={
                <RequireRole allowed={['trainer']}>
                  <TrainerMessages />
                </RequireRole>
              }
            />
          </Route>
          <Route path="*" element={<RoleHome />} />
        </Routes>
      </main>
      <DemoBar />
    </div>
  );
}
