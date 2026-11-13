import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DemoBar } from './components/DemoBar';
import { Header } from './components/Header';
import { ToastRegion } from './components/Toast';
import type { Role } from './domain/types';
import { homeFor } from './routes';
import { AthleteLayout } from './screens/athlete/AthleteLayout';
import { Progress } from './screens/athlete/Progress';
import { Today } from './screens/athlete/Today';
import { Trainer } from './screens/athlete/Trainer';
import { AthleteProfile } from './screens/staff/AthleteProfile';
import { StaffHome } from './screens/staff/StaffHome';
import { StaffLayout } from './screens/staff/StaffLayout';
import { TrainerMessages } from './screens/staff/TrainerMessages';
import { AdminDashboard } from './screens/admin/AdminDashboard';
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
      <main id="main-content" className="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<RoleHome />} />
          <Route path="/admin" element={<RequireRole allowed={['admin']}><AdminDashboard /></RequireRole>} />
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
            <Route path="progress" element={<Progress />} />
            <Route path="trainer" element={<Trainer />} />
            {/* Old addresses from before the three-tab layout, so saved links still work. */}
            <Route path="week" element={<Navigate to="/athlete" replace />} />
            <Route path="goals" element={<Navigate to="/athlete/progress" replace />} />
            <Route path="trophies" element={<Navigate to="/athlete/progress" replace />} />
            <Route path="appointments" element={<Navigate to="/athlete/trainer" replace />} />
            <Route path="messages" element={<Navigate to="/athlete/trainer" replace />} />
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
            {/* Medical history and notes: trainer-only, like the data behind it. */}
            <Route
              path="athletes/:athleteId"
              element={
                <RequireRole allowed={['trainer']}>
                  <AthleteProfile />
                </RequireRole>
              }
            />
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
