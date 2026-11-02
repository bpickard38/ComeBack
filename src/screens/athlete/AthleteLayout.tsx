import { Outlet } from "react-router-dom";
import { TabBar } from "../../components/TabBar";
import { athleteThread, unreadIn } from "../../domain/messages";
import { useAppStore } from "../../store/AppStore";

/** Single 520px column with the athlete tabs. <Outlet /> is where the current tab's screen goes. */
export function AthleteLayout() {
  const { state, profile } = useAppStore();
  const unread = unreadIn(
    state.messages,
    athleteThread(profile.id),
    profile.id,
  );
  const tabs = [
    { to: "/athlete", label: "Today" },
    { to: "/athlete/goals", label: "Progress" },
    { to: "/athlete/trophies", label: "Trophies" },
    { to: "/athlete/appointments", label: "Appointments" },
    {
      to: "/athlete/messages",
      label: unread > 0 ? `Messages (${unread} new)` : "Messages",
    },
  ];

  return (
    <div className="column">
      <TabBar tabs={tabs} label="Athlete sections" />
      <Outlet />
    </div>
  );
}
