import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MagnifyingGlass as SearchIcon,
  UsersThree,
  DoorOpen,
  Wrench,
  Compass,
  X as CloseIcon,
} from "@phosphor-icons/react";
import { useTenants } from "../TenantsContext";
import { useRooms, roomLabel } from "../RoomsContext";
import { useMaintenance } from "../MaintenanceContext";

type Group = "Tenants" | "Rooms" | "Maintenance" | "Pages";

type ResultItem = {
  key: string;
  group: Group;
  icon: typeof UsersThree;
  title: string;
  subtitle: string;
  badge?: string;
  to: string;
  /** For a tenant result: lets the panel jump to the Maintenance tab pre-filtered to their reports. */
  relatedMaintenanceCount?: number;
};

const statusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

const GROUP_ICON: Record<Group, typeof UsersThree> = {
  Tenants: UsersThree,
  Rooms: DoorOpen,
  Maintenance: Wrench,
  Pages: Compass,
};

const PAGES: { title: string; subtitle: string; to: string }[] = [
  { title: "Dashboard", subtitle: "Overview", to: "/dashboard" },
  { title: "Rent", subtitle: "Rent collection", to: "/rent" },
  { title: "Tenants", subtitle: "All tenants", to: "/tenants" },
  { title: "Add tenant", subtitle: "Tenants", to: "/tenants/new" },
  { title: "Rooms", subtitle: "Room inventory", to: "/rooms" },
  { title: "Maintenance requests", subtitle: "Maintenance", to: "/maintenance" },
  { title: "Expense Tracker", subtitle: "Accounting", to: "/expense-tracker" },
  { title: "Online payments", subtitle: "Payouts", to: "/online-payments" },
  { title: "Overdue rent", subtitle: "Reports", to: "/reports/arrears-delinquency" },
  { title: "Income vs expenses", subtitle: "Reports", to: "/reports/income-expenses" },
  { title: "Occupancy rate", subtitle: "Reports", to: "/reports/occupancy-rate" },
  { title: "Settings", subtitle: "Property settings", to: "/settings" },
];

export default function GlobalSearch({
  onClose,
  onNavigate,
  initialQuery = "",
}: {
  onClose: () => void;
  onNavigate: () => void;
  initialQuery?: string;
}) {
  const { tenants } = useTenants();
  const { rooms, roomTypeConfigs } = useRooms();
  const { reports } = useMaintenance();
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<"All" | Group>("All");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const allResults = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const tenantResults: ResultItem[] = tenants
      .filter((t) => t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q) || (t.phones[0] ?? "").includes(q))
      .map((t) => ({
        key: `tenant-${t.id}`,
        group: "Tenants" as const,
        icon: UsersThree,
        title: t.name,
        subtitle: `${t.room} · ${t.roomType}`,
        badge: statusLabel[t.status] ?? undefined,
        to: `/tenants/${t.portalToken ?? t.id}`,
        relatedMaintenanceCount: reports.filter((r) => r.tenant === t.name).length,
      }));

    const roomResults: ResultItem[] = rooms
      .filter((r) => {
        const typeName = roomTypeConfigs.find((c) => c.id === r.typeId)?.name ?? "";
        return r.number.toLowerCase().includes(q) || roomLabel(r.number).toLowerCase().includes(q) || typeName.toLowerCase().includes(q);
      })
      .map((r) => {
        const typeName = roomTypeConfigs.find((c) => c.id === r.typeId)?.name ?? "Room";
        return {
          key: `room-${r.number}`,
          group: "Rooms" as const,
          icon: DoorOpen,
          title: roomLabel(r.number),
          subtitle: typeName,
          to: "/rooms",
        };
      });

    const maintenanceResults: ResultItem[] = reports
      .filter(
        (r) =>
          r.location.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tenant.toLowerCase().includes(q)
      )
      .map((r) => ({
        key: `maintenance-${r.id}`,
        group: "Maintenance" as const,
        icon: Wrench,
        title: r.location || "Maintenance request",
        subtitle: r.tenant ? `${r.tenant} · ${r.description}` : r.description,
        badge: r.status === "open" ? "Open" : r.status === "in-progress" ? "In progress" : "Resolved",
        to: "/maintenance",
      }));

    const pageResults: ResultItem[] = PAGES.filter(
      (p) => p.title.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q)
    ).map((p) => ({
      key: `page-${p.to}`,
      group: "Pages" as const,
      icon: Compass,
      title: p.title,
      subtitle: p.subtitle,
      to: p.to,
    }));

    return [...tenantResults, ...roomResults, ...maintenanceResults, ...pageResults];
  }, [query, tenants, rooms, roomTypeConfigs, reports]);

  const counts = useMemo(() => {
    const c: Record<Group, number> = { Tenants: 0, Rooms: 0, Maintenance: 0, Pages: 0 };
    for (const r of allResults) c[r.group]++;
    return c;
  }, [allResults]);

  const visible = tab === "All" ? allResults : allResults.filter((r) => r.group === tab);

  const grouped = useMemo(() => {
    if (tab !== "All") return [{ group: tab, items: visible }];
    const order: Group[] = ["Tenants", "Rooms", "Maintenance", "Pages"];
    return order
      .map((group) => ({ group, items: allResults.filter((r) => r.group === group).slice(0, 5) }))
      .filter((g) => g.items.length > 0);
  }, [tab, visible, allResults]);

  const select = (item: ResultItem) => {
    navigate(item.to);
    onNavigate();
  };

  const jumpToMaintenance = (tenantName: string) => {
    setTab("Maintenance");
    setQuery(tenantName);
    inputRef.current?.focus();
  };

  const tabs: { key: "All" | Group; label: string; count?: number }[] = [
    { key: "All", label: "All" },
    { key: "Tenants", label: "Tenants", count: counts.Tenants },
    { key: "Rooms", label: "Rooms", count: counts.Rooms },
    { key: "Maintenance", label: "Maintenance", count: counts.Maintenance },
    { key: "Pages", label: "Pages", count: counts.Pages },
  ];

  return (
    <div className="fixed inset-0 z-60 flex flex-col bg-paper">
      <motion.div
        initial={{ y: "-100%" }}
        animate={{ y: 0 }}
        exit={{ y: "-100%" }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col"
      >
        {/* Header bar — search input sits where the sidebar logo/search icon lives, so opening this
            feels like the trigger simply expanded into a full-screen surface. */}
        <div className="shrink-0 border-b border-line px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <SearchIcon size={22} weight="bold" className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tenants, rooms, maintenance requests, pages…"
              className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
            >
              <CloseIcon size={18} weight="bold" />
            </button>
          </div>

          {query.trim() !== "" && (
            <div className="mx-auto mt-4 flex max-w-3xl items-center gap-1 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    tab === t.key ? "bg-ink text-paper" : "text-muted hover:bg-mist hover:text-ink"
                  }`}
                >
                  {t.label}
                  {typeof t.count === "number" && t.count > 0 && (
                    <span className={`text-xs ${tab === t.key ? "text-paper/70" : "text-muted/70"}`}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl">
            {query.trim() === "" && (
              <p className="py-16 text-center text-sm text-muted">Start typing to search across the whole property account.</p>
            )}

            {query.trim() !== "" && visible.length === 0 && (
              <p className="py-16 text-center text-sm text-muted">No matches for "{query}".</p>
            )}

            {grouped.map((section) => {
              const SectionIcon = GROUP_ICON[section.group];
              return (
                <div key={section.group} className="mb-6 last:mb-0">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                      <SectionIcon size={14} weight="bold" />
                      {section.group}
                    </p>
                    {tab === "All" && counts[section.group] > section.items.length && (
                      <button
                        type="button"
                        onClick={() => setTab(section.group)}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        View all {counts[section.group]}
                      </button>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-line">
                    {section.items.map((item, i) => {
                      const ItemIcon = item.icon;
                      return (
                        <div
                          key={item.key}
                          className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-mist ${
                            i > 0 ? "border-t border-line" : ""
                          }`}
                        >
                          <button type="button" onClick={() => select(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                              <ItemIcon size={17} weight="duotone" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                              <span className="block truncate text-xs text-muted">{item.subtitle}</span>
                            </span>
                          </button>

                          {item.group === "Tenants" && !!item.relatedMaintenanceCount && (
                            <button
                              type="button"
                              onClick={() => jumpToMaintenance(item.title)}
                              className="shrink-0 rounded-full bg-mist px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-line"
                            >
                              {item.relatedMaintenanceCount} maintenance
                            </button>
                          )}

                          {item.badge && (
                            <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-muted">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
