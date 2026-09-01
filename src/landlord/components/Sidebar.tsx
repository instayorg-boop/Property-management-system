import { forwardRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  SquaresFour,
  CurrencyCircleDollar,
  UsersThree,
  DoorOpen,
  Wrench,
  IdentificationBadge,
  Receipt,
  ChartBar,
  GearSix,
  CaretDown,
  Lifebuoy,
  X,
} from "@phosphor-icons/react";
import { useSidebar } from "../SidebarContext";

const icons = {
  dashboard: SquaresFour,
  rent: CurrencyCircleDollar,
  tenants: UsersThree,
  rooms: DoorOpen,
  expenses: Receipt,
  staff: IdentificationBadge,
  maintenance: Wrench,
  reports: ChartBar,
  settings: GearSix,
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
      { label: "Expenses", to: "/expenses", icon: "expenses" },
      {
        label: "Staff",
        to: "/staff",
        icon: "staff",
        children: [
          { label: "Employees", to: "/staff/employees" },
          { label: "Payroll", to: "/staff/payroll" },
          { label: "Clock in / out", to: "/staff/clock" },
        ],
      },
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
          { label: "Room rent roll", to: "/reports/bed-rent-roll" },
          { label: "Overdue rent", to: "/reports/arrears-delinquency" },
          { label: "Payout statement", to: "/reports/owner-payout-statement" },
          { label: "Income vs expenses", to: "/reports/income-expenses" },
          { label: "Payroll summary", to: "/reports/payroll-summary" },
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

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const location = useLocation();
  const isOnPage = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  const [open, setOpen] = useState(isOnPage && !!item.children);
  const ItemIcon = icons[item.icon];

  if (!item.children) {
    return (
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive ? "font-semibold text-brand" : "text-muted hover:bg-paper hover:text-ink"
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
            <span className="relative flex items-center gap-2.5">
              <ItemIcon size={18} weight="duotone" />
              {item.label}
            </span>
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
          isOnPage ? "font-semibold text-brand" : "text-muted hover:bg-paper hover:text-ink"
        }`}
      >
        <ItemIcon size={18} weight="duotone" />
        <span className="flex-1">{item.label}</span>
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

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal={open ? true : undefined}
      aria-label="Navigation"
      className={`fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] shrink-0 flex-col bg-paper transition-transform duration-200 lg:static lg:z-auto lg:h-full lg:w-62 lg:max-w-none lg:translate-x-0 lg:bg-transparent ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-3 lg:hidden">
        <span className="font-display text-sm font-semibold text-ink">Menu</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted/70 uppercase">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow key={item.to} item={item} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-3 py-3">
        <Link
          to="/help"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <Lifebuoy size={18} weight="duotone" />
          Help & Support
        </Link>
      </div>
    </div>
  );
});

export default Sidebar;
