import { Outlet } from "react-router-dom";
import { TabBar } from "../../components/TabBar";
import { athleteThread, unreadIn } from "../../domain/messages";
import { useAppStore } from "../../store/AppStore";

/** Athlete navigation and the active screen. */
export function AthleteLayout() {
  const { state, profile } = useAppStore();
  const unread = unreadIn(
    state.messages,
    athleteThread(profile.id),
    profile.id,
  );
  const tabs = [
    { to: "/athlete", label: "Today" },
    { to: "/athlete/week", label: "Week" },
    { to: "/athlete/goals", label: "Progress" },
    { to: "/athlete/trophies", label: "Trophies" },
    { to: "/athlete/appointments", label: "Appointments" },
    {
      to: "/athlete/messages",
      label: unread > 0 ? `Messages (${unread} new)` : "Messages",
    },
  ];

  return (
    <div className="athlete-layout">
      <aside className="athlete-layout__sidebar">
        <TabBar tabs={tabs} label="Athlete sections" className="tabs--athlete" />
      </aside>
      <section className="athlete-layout__content" aria-label="Athlete dashboard">
        <Outlet />
      </section>
    </div>
  );
}
