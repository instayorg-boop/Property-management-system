import { forwardRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
  Lifebuoy,
  UserCircle,
  SignOut,
  Plus,
} from "@phosphor-icons/react";
import { useSidebar } from "../SidebarContext";
import { useMaintenance } from "../MaintenanceContext";
import { useTenants } from "../TenantsContext";
import CreateLauncherModal from "./CreateLauncherModal";
import Button from "./Button";

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
      { label: "Expense Tracker", to: "/expense-tracker", icon: "accounting" },
      { label: "Online payments", to: "/online-payments", icon: "onlinePayments" },
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
          `flex items-center gap-2.5 rounded-r-lg border-l-2 py-2 pl-2.5 pr-3 text-sm transition-colors ${
            isActive
              ? "border-brand font-semibold text-brand"
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
        className={`flex w-full items-center gap-2.5 rounded-r-lg border-l-2 py-2 pl-2.5 pr-3 text-left text-sm transition-colors ${
          isOnPage
            ? "border-brand font-semibold text-brand"
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

const Sidebar = forwardRef<HTMLDivElement>(function Sidebar(_props, ref) {
  const { open, setOpen } = useSidebar();
  const { reports } = useMaintenance();
  const { tenants } = useTenants();
  const [createOpen, setCreateOpen] = useState(false);

  // Whether each nav item has something unread/overdue waiting — shown as a plain dot, no count.
  const attention: Partial<Record<string, boolean>> = {
    "/maintenance": reports.some((r) => r.unread),
    "/rent": tenants.some((t) => t.active && (t.status === "overdue" || t.status === "unpaid")),
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal={open ? true : undefined}
      aria-label="Navigation"
      className={`fixed top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] left-0 z-50 flex h-auto w-64 max-w-[85vw] shrink-0 flex-col border-r border-line bg-paper transition-transform duration-200 lg:static lg:inset-y-0 lg:z-auto lg:h-full lg:w-64 lg:max-w-none lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="px-3 pt-4">
        <Button
          variant="primary"
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex w-full items-center justify-center gap-1.5  bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
        >
          <Plus size={16} weight="bold" />
          Create new
        </Button>
      </div>

      {createOpen && <CreateLauncherModal onClose={() => setCreateOpen(false)} />}

      <nav className="flex-1  overflow-y-auto px-3 pb-4 pt-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
              {group.label}
            </p>
            <div className="space-y-0.5 mb-1">
              {group.items.map((item) => (
                <NavRow key={item.to} item={item} onNavigate={() => setOpen(false)} hasAttention={attention[item.to] ?? false} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
});

export default Sidebar;