import { Outlet } from "react-router-dom";
import { TabBar, type Tab } from "../../components/TabBar";
import { athleteThread, unreadIn } from "../../domain/messages";
import { useAppStore } from "../../store/AppStore";

/**
 * Athlete navigation and the active screen. Three tabs: on phones they sit in
 * a bar along the bottom of the screen, on wide screens in a left sidebar.
 */
export function AthleteLayout() {
  const { state, profile } = useAppStore();
  const unread = unreadIn(
    state.messages,
    athleteThread(profile.id),
    profile.id,
  );
  const tabs: Tab[] = [
    { to: "/athlete", label: "Today", icon: "today" },
    { to: "/athlete/progress", label: "Progress", icon: "progress" },
    { to: "/athlete/trainer", label: "Trainer", icon: "messages", unreadCount: unread },
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
