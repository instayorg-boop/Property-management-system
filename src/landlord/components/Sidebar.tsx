import { forwardRef, useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  SquaresFour,
  CurrencyCircleDollar,
  UsersThree,
  DoorOpen,
  Wrench,
  IdentificationBadge,
  Wallet,
  ChartBar,
  GearSix,
  CaretDown,
  Lifebuoy,
  UserCircle,
  SignOut,
  X,
} from "@phosphor-icons/react";
import { useSidebar } from "../SidebarContext";
import { useMaintenance } from "../MaintenanceContext";
import { useTenants } from "../TenantsContext";
import { useSettings } from "../SettingsContext";
import NotificationsPanel from "./NotificationsPanel";
import { signOut as signOutRequest } from "../../lib/auth";

const icons = {
  dashboard: SquaresFour,
  rent: CurrencyCircleDollar,
  tenants: UsersThree,
  rooms: DoorOpen,
  accounting: Wallet,
  staff: IdentificationBadge,
  maintenance: Wrench,
  reports: ChartBar,
  settings: GearSix,
  account: UserCircle,
  help: Lifebuoy,
  logout: SignOut,
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
    items: [{ label: "Dashboard", to: "/dashboard", icon: "dashboard" }],
  },
  {
    label: "Operations",
    items: [
      { label: "Rent", to: "/rent", icon: "rent" },
      { label: "Tenants", to: "/tenants", icon: "tenants" },
      { label: "Rooms", to: "/rooms", icon: "rooms" },
      { label: "Maintenance requests", to: "/maintenance", icon: "maintenance" },
      { label: "Accounting", to: "/accounting", icon: "accounting" },
      // Staff/payroll — out of scope for the MVP. Re-enable by uncommenting this nav item plus
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
      {
        label: "Reports",
        to: "/reports",
        icon: "reports",
        children: [
          // MVP: keeping only Income vs expenses, Overdue rent, and Occupancy rate — the three
          // reports that actually matter day to day. The rest are commented out, not deleted.
          // { label: "Room rent roll", to: "/reports/bed-rent-roll" },
          { label: "Overdue rent", to: "/reports/arrears-delinquency" },
          // { label: "Payout statement", to: "/reports/owner-payout-statement" },
          { label: "Income vs expenses", to: "/reports/income-expenses" },
          // MVP: staff/payroll — see the note by the Staff nav item above.
          // { label: "Payroll summary", to: "/reports/payroll-summary" },
          { label: "Occupancy rate", to: "/reports/occupancy-rate" },
        ],
      },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Settings", to: "/settings", icon: "settings" }],
  },
];

/** Message-app-style count badge — shown at the trailing end of the row, not up front by the icon,
 * so it reads like a notification rather than a label. Caps the display at 99+. */
function AttentionBadge({ count }: { count: number }) {
  return (
    <span className="relative flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavRow({ item, onNavigate, attentionCount }: { item: NavItem; onNavigate: () => void; attentionCount: number }) {
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
          `relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive ? "font-semibold text-brand" : "text-muted hover:bg-mist hover:text-ink"
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-lg bg-brand-soft"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative flex min-w-0 flex-1 items-center gap-2.5">
              <ItemIcon size={18} weight="duotone" className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </span>
            {attentionCount > 0 && <AttentionBadge count={attentionCount} />}
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
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
          isOnPage ? "font-semibold text-brand" : "text-muted hover:bg-mist hover:text-ink"
        }`}
      >
        <ItemIcon size={18} weight="duotone" />
        <span className="flex-1">{item.label}</span>
        {attentionCount > 0 && <AttentionBadge count={attentionCount} />}
        <CaretDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-0.5 ml-6.5 space-y-0.5 border-l border-line pl-3.5">
          {item.children.map((child) => (
            <NavLink
              key={child.to ?? child.hash}
              to={child.to ?? `${item.to}#${child.hash}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                `block rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  isActive ? "font-medium text-brand" : "text-muted hover:text-ink"
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

const Sidebar = forwardRef<HTMLDivElement>(function Sidebar(_props, ref) {
  const { open, setOpen } = useSidebar();
  const { reports } = useMaintenance();
  const { tenants } = useTenants();
  const { propertyName } = useSettings();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationsOpen && !accountOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) setNotificationsOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotificationsOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [notificationsOpen, accountOpen]);

  // How many things need a look on each nav item — shown as a count badge, not just a dot, so it's
  // clear at a glance how much is waiting rather than just that something is.
  const attention: Partial<Record<string, number>> = {
    "/maintenance": reports.filter((r) => r.unread).length,
    "/rent": tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid")).length,
  };

  const handleSignOut = () => {
    setOpen(false);
    void signOutRequest().finally(() => navigate("/sign-in"));
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal={open ? true : undefined}
      aria-label="Navigation"
      className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 max-w-[85vw] shrink-0 flex-col border-r border-line bg-paper transition-transform duration-200 lg:static lg:z-auto lg:h-full lg:w-64 lg:max-w-none lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Header — logo + notifications, replacing the old full-width topbar. Lives inside the
          sidebar's own card rather than a separate strip across the whole page. */}
      <div ref={notificationsRef} className="relative flex items-center justify-between px-4 py-4">
        <Link to="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3">
          <img src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay%20Manage%20Logo.png" alt="Instay Manage" className="h-10" />
          <p className="font-display text-blue-700 text-xl font-bold leading-[1.08] tracking-[-0.09em]  ">Instay Manage</p>
        </Link>

        <div className="flex items-center gap-1">
          
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink lg:hidden"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {notificationsOpen && (
          <div className="absolute top-full left-3 z-10 mt-1 max-w-[calc(100vw-1.5rem)]">
            <NotificationsPanel onClose={() => setNotificationsOpen(false)} />
          </div>
        )}
      </div>
     

      <nav className="flex-1 space-y-3 overflow-y-auto px-3 pb-4 pt-2">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted/70 uppercase">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow key={item.to} item={item} onNavigate={() => setOpen(false)} attentionCount={attention[item.to] ?? 0} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Compact account trigger — a small icon, not a permanent list of links. Everything that
          used to be separate footer rows (Settings, Help, Log out) now lives inside the popup
          this opens, anchored above the trigger since it's at the very bottom of the sidebar. */}
      <div ref={accountRef} className="relative   px-3 py-3">
        <button
          type="button"
          onClick={() => setAccountOpen((v) => !v)}
          aria-label="Open account menu"
          aria-expanded={accountOpen}
          className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 bg-white border border-gray-200"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-blue-700 group-hover:ring-2 group-hover:ring-blue-300 transition-all">
            <UserCircle size={24} weight="fill" />
          </span>
          <div className="flex-1 text-left min-w-0 flex flex-col">
            <span className="truncate text-[15px] font-semibold leading-tight text-ink">{propertyName}</span>
            <span className="text-xs text-muted/80 mt-0.5">Property account</span>
          </div>
          <svg width="18" height="18" fill="none" viewBox="0 0 20 20" className={`ml-auto text-muted transition-transform ${accountOpen ? "rotate-180" : ""}`}>
            <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
   

        {accountOpen && (
          <div className="absolute bottom-full left-3 z-10 mb-2 w-56 overflow-hidden rounded-2xl border border-line bg-paper shadow-card">
            <div className="px-4 pt-3.5 pb-3">
              <p className="truncate text-sm font-semibold text-ink">{propertyName}</p>
              <p className="text-xs text-muted">Property account</p>
            </div>
            <div className="h-px bg-line" />
            <div className="p-1.5">
              <Link
                to="/settings"
                onClick={() => {
                  setAccountOpen(false);
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
              >
                <GearSix size={16} weight="duotone" />
                Settings
              </Link>
              <Link
                to="/help"
                onClick={() => {
                  setAccountOpen(false);
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
              >
                <Lifebuoy size={16} weight="duotone" />
                Help & Support
              </Link>
            </div>
            <div className="h-px bg-line" />
            <div className="p-1.5">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <SignOut size={16} weight="duotone" />
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default Sidebar;
