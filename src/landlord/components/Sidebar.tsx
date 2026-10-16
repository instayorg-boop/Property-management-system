import { useEffect, useRef, useState } from "react";
import { isResident } from "../../lib/tenants";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  SquaresFour,
  CurrencyCircleDollar,
  UsersThree,
  DoorOpen,
  Wrench,
  IdentificationBadge,
  Receipt,
  Coins,
  ChartBar,
  GearSix,
  CaretDown,
  UserCircle,
  SignOut,
  Question,
  Bell,
  ListChecks,
  X as CloseIcon,
} from "@phosphor-icons/react";
import { useSidebar } from "../SidebarContext";
import { useMaintenance } from "../MaintenanceContext";
import { useTenants } from "../TenantsContext";
import { useNotifications } from "../NotificationsContext";
import { useSettings } from "../SettingsContext";
import { readCachedTasks } from "../../lib/todaysTasksApi";
import SectionLabel from "./SectionLabel";

const icons = {
  dashboard: SquaresFour,
  rent: CurrencyCircleDollar,
  tenants: UsersThree,
  rooms: DoorOpen,
  accounting: Receipt,
  onlinePayments: Coins,
  staff: IdentificationBadge,
  maintenance: Wrench,
  reports: ChartBar,
  settings: GearSix,
  account: UserCircle,
  help: Question,
  logout: SignOut,
  tasks: ListChecks,
  notifications: Bell,
};

type NavChild = { label: string; hash?: string; to?: string };

type NavItem = {
  label: string;
  to: string;
  icon: keyof typeof icons;
  children?: NavChild[];
};

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Daily",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: "dashboard" },
      { label: "Tasks", to: "/tasks", icon: "tasks" },
      { label: "Notifications", to: "/notifications", icon: "notifications" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Rent", to: "/rent", icon: "rent" },
      { label: "Tenants", to: "/tenants", icon: "tenants" },
      { label: "Rooms", to: "/rooms", icon: "rooms" },
      { label: "Online payments", to: "/online-payments", icon: "onlinePayments" },
      { label: "Maintenance requests", to: "/maintenance", icon: "maintenance" },
      { label: "Expense Tracker", to: "/expense-tracker", icon: "accounting" },
      // Staff/payroll — out of scope for the MVP. Re-enable by uncommenting plus
      // the matching routes in App.tsx (search "MVP: staff/payroll").
      // {
      //   label: "Staff",
      //   to: "/staff",
      //   icon: "staff",
      //   children: [
      //     { label: "Employees", to: "/staff/employees" },
      //     { label: "Payroll", to: "/staff/payroll" },
      //     { label: "Clock in / out", to: "/staff/clock" },
      //   ],
      // },
    ],
  },
  {
    label: "Insights",
    items: [
      // Reports now opens a single hub page (src/landlord/pages/Reports.tsx) with its own
      // report-type cards, rather than expanding this nav item into a list of links in place.
      { label: "Reports", to: "/reports", icon: "reports" },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Settings", to: "/settings", icon: "settings" }],
  },
  {
    label: "Support",
    items: [{ label: "Help & Support", to: "/help", icon: "help" }],
  },
];

/** Small unread-style indicator dot, pinned to the icon's top-right corner — no count,
 * just presence, matching how most SaaS sidebars flag unread items. */
function AttentionDot() {
  return <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-red-500" />;
}

function NavRow({ item, onNavigate, hasAttention }: { item: NavItem; onNavigate: () => void; hasAttention: boolean }) {
  const location = useLocation();
  const isOnPage = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  const [open, setOpen] = useState(isOnPage && !!item.children);
  const ItemIcon = icons[item.icon];

  if (!item.children) {
    return (
      <NavLink
        to={item.to}
        onClick={onNavigate}
        data-tour={`nav-${item.icon}`}
        className={({ isActive }) =>
          `flex items-center gap-2.5 rounded-r-lg border-l-2 py-1.5 pl-2.5 pr-3 text-sm transition-colors ${
            isActive
              ? "border-brand bg-brand-soft font-semibold text-brand"
              : "border-transparent text-muted hover:bg-mist hover:text-ink"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className="relative shrink-0">
              <ItemIcon size={18} weight={isActive ? "fill" : "regular"} />
              {hasAttention && <AttentionDot />}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </>
        )}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 rounded-r-lg border-l-2 py-1.5 pl-2.5 pr-3 text-left text-sm transition-colors ${
          isOnPage
            ? "border-brand bg-brand-soft font-semibold text-brand"
            : "border-transparent text-muted hover:bg-mist hover:text-ink"
        }`}
      >
        <span className="relative shrink-0">
          <ItemIcon size={18} weight={isOnPage ? "fill" : "regular"} />
          {hasAttention && <AttentionDot />}
        </span>
        <span className="flex-1">{item.label}</span>
        <CaretDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-0.5 pb-1">
          {item.children.map((child) => (
            <NavLink
              key={child.to ?? child.hash}
              to={child.to ?? `${item.to}#${child.hash}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                `block rounded-r-lg border-l-2 py-1.5 pl-11 pr-3 text-[13px] transition-colors ${
                  isActive
                    ? "border-brand font-medium text-brand"
                    : "border-transparent text-muted hover:bg-mist hover:text-ink"
                }`
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mobile full-screen menu's row — a real touch target (44px+), the active state as a filled
 * chip rather than the desktop rail's thin left border (too subtle to read at a glance on a
 * phone, and there's no mouse hover to lean on either). */
function MobileNavRow({ item, onNavigate, hasAttention }: { item: NavItem; onNavigate: () => void; hasAttention: boolean }) {
  const ItemIcon = icons[item.icon];
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      data-tour={`nav-${item.icon}`}
      className={({ isActive }) =>
        `flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
          isActive ? "bg-brand-soft text-brand" : "text-ink active:bg-mist"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isActive ? "bg-brand text-paper" : "bg-mist text-muted"
            }`}
          >
            <ItemIcon size={20} weight={isActive ? "fill" : "regular"} />
            {hasAttention && <AttentionDot />}
          </span>
          {item.label}
        </>
      )}
    </NavLink>
  );
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Sidebar() {
  const { open, setOpen } = useSidebar();
  const { reports } = useMaintenance();
  const { tenants } = useTenants();
  const { notifications, unreadCount } = useNotifications();
  const { propertyId } = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);

  // Open task count comes from the same localStorage cache the Dashboard's Today's Tasks card
  // already keeps warm (see src/lib/todaysTasksApi.ts): a plain synchronous read, no extra
  // fetch, so the sidebar dot stays in sync without adding a new request on every navigation.
  const openTaskCount = propertyId ? readCachedTasks(propertyId)?.counts.all ?? 0 : 0;

  // Whether each nav item has something unread/overdue waiting, shown as a plain dot, no count.
  const attention: Partial<Record<string, boolean>> = {
    "/maintenance": reports.some((r) => r.unread),
    "/rent": tenants.some((t) => isResident(t) && (t.status === "overdue" || t.status === "unpaid")),
    // A payment that just came in through the portal, or a payout that just went out, both show up
    // here as unread notifications (category "payment" / "payout") before the person has looked.
    "/online-payments": notifications.some((n) => !n.read_at && (n.category === "payment" || n.category === "payout")),
    "/tasks": openTaskCount > 0,
    "/notifications": unreadCount > 0,
  };

  // Escape-to-close + a focus trap while the mobile full-screen menu is open, focus landing
  // inside it on open and returning to whatever opened it on close. Self-contained here (rather
  // than in DashboardLayout) since this overlay — unlike the old narrow drawer — has no backdrop
  // for a parent component to also own.
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, setOpen]);

  return (
    <>
      {/* Desktop rail — a plain static column, always on screen from `lg` up. No open/close state,
          no transform, no transition: the mobile menu below is a completely separate takeover,
          not this same panel sliding in. */}
      <div className="hidden lg:flex lg:h-full lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-line lg:bg-paper">
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-4">
          {groups.map((group, i) => (
            <div key={group.label} className={i > 0 ? "mt-4" : ""}>
              <SectionLabel className="px-3 pb-1.5">{group.label}</SectionLabel>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.to} item={item} onNavigate={() => {}} hasAttention={attention[item.to] ?? false} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Mobile full-screen menu — a genuine takeover of the viewport rather than the desktop
          rail narrowed down and slid in from the edge. Opens from the header's menu button,
          fades in/out (the panel also lifts slightly so the motion reads as arriving, not just
          appearing), and every row is a real thumb-sized target. */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex flex-col bg-paper lg:hidden"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: "easeOut", delay: 0.02 }}
              className="flex h-full flex-col"
            >
              <div
                className="flex shrink-0 items-center justify-between border-b border-line px-4 pb-3.5"
                style={{ paddingTop: "max(0.875rem, env(safe-area-inset-top, 0px))" }}
              >
                <p className="font-display text-[17px] font-bold tracking-tight text-ink">Menu</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
                >
                  <CloseIcon size={18} weight="bold" />
                </button>
              </div>

              <div
                className="flex-1 overflow-y-auto px-4 pt-4"
                style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }}
              >
                {groups.map((group, i) => (
                  <div key={group.label} className={i > 0 ? "mt-6" : ""}>
                    <SectionLabel className="px-3 pb-2">{group.label}</SectionLabel>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <MobileNavRow
                          key={item.to}
                          item={item}
                          onNavigate={() => setOpen(false)}
                          hasAttention={attention[item.to] ?? false}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
}
