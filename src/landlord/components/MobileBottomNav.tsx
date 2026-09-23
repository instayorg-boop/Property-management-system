import { NavLink, useLocation } from "react-router-dom";
import {
  SquaresFour,
  CurrencyCircleDollar,
  Wrench,
  ChatCircle,
  DotsThreeCircle,
} from "@phosphor-icons/react";
import { useSidebar } from "../SidebarContext";
import { useAssistantUi } from "../AssistantUiContext";
import { useMaintenance } from "../MaintenanceContext";
import { useTenants } from "../TenantsContext";

const tabClass = ({ active }: { active: boolean }) =>
  `relative flex w-full flex-col items-center justify-center gap-0.5 pt-1 text-[10px] font-medium transition-colors ${
    active ? "text-brand" : "text-muted"
  }`;

function AttentionDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute top-1 right-[22%] h-1.5 w-1.5 rounded-full bg-red-500" />
  );
}

/** Phone/tablet tab bar — the five check-in destinations. Everything else stays behind More
 * (the existing sidebar drawer) rather than crowding this row. Hidden from `lg` up, where the
 * full sidebar is always on screen. */
export default function MobileBottomNav() {
  const location = useLocation();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const { open: assistantOpen, setOpen: setAssistantOpen } = useAssistantUi();
  const { reports } = useMaintenance();
  const { tenants } = useTenants();

  const overdueCount = tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid")).length;
  const maintenanceCount = reports.filter((r) => r.unread).length;

  const closeOverlays = () => {
    setSidebarOpen(false);
    setAssistantOpen(false);
  };

  const homeActive = location.pathname === "/dashboard" && !assistantOpen && !sidebarOpen;
  const rentActive = location.pathname.startsWith("/rent") && !assistantOpen && !sidebarOpen;
  const maintenanceActive = location.pathname.startsWith("/maintenance") && !assistantOpen && !sidebarOpen;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Mobile navigation"
    >
      <div className="grid h-14 grid-cols-5">
        <NavLink to="/dashboard" onClick={closeOverlays} className={tabClass({ active: homeActive })}>
          <SquaresFour size={22} weight={homeActive ? "fill" : "duotone"} />
          Home
        </NavLink>

        <NavLink to="/rent" onClick={closeOverlays} className={tabClass({ active: rentActive })}>
          <CurrencyCircleDollar size={22} weight={rentActive ? "fill" : "duotone"} />
          <AttentionDot count={overdueCount} />
          Rent
        </NavLink>

        <NavLink to="/maintenance" onClick={closeOverlays} className={tabClass({ active: maintenanceActive })}>
          <Wrench size={22} weight={maintenanceActive ? "fill" : "duotone"} />
          <AttentionDot count={maintenanceCount} />
          Fixes
        </NavLink>

        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false);
            setAssistantOpen(!assistantOpen);
          }}
          className={tabClass({ active: assistantOpen })}
        >
          <ChatCircle size={22} weight={assistantOpen ? "fill" : "duotone"} />
          Chat
        </button>

        <button
          type="button"
          onClick={() => {
            setAssistantOpen(false);
            setSidebarOpen(!sidebarOpen);
          }}
          className={tabClass({ active: sidebarOpen })}
        >
          <DotsThreeCircle size={22} weight={sidebarOpen ? "fill" : "duotone"} />
          More
        </button>
      </div>
    </nav>
  );
}
