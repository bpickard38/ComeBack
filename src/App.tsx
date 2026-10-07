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
import { Today } from './screens/athlete/Today';
import { Trophies } from './screens/athlete/Trophies';
import { StaffHome } from './screens/staff/StaffHome';
import { useAppStore } from './store/AppStore';

/** Sends you to your role's home screen. */
function RoleHome() {
  const { state } = useAppStore();
  return <Navigate to={homeFor(state.role)} replace />;
}

/**
 * Shows `children` only to the listed roles; anyone else is redirected home.
 * This is how a coach opening /athlete ends up on /staff. (Not real security,
 * just navigation. Real access control needs a backend.)
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
      <DemoBar />
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
            <Route path="goals" element={<Goals />} />
            <Route path="trophies" element={<Trophies />} />
            <Route path="appointments" element={<Appointments />} />
          </Route>
          <Route
            path="/staff"
            element={
              <RequireRole allowed={['trainer', 'coach']}>
                <StaffHome />
              </RequireRole>
            }
          />
          <Route path="*" element={<RoleHome />} />
        </Routes>
      </main>
    </div>
  );
}
