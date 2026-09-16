import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  MagnifyingGlass as SearchIcon,
  UsersThree,
  DoorOpen,
  Wrench,
  Compass,
  X as CloseIcon,
  ArrowUp,
  ArrowDown,
  ArrowElbowDownLeft,
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

// Each group gets its own quiet accent so the eye can sort results before it even reads them.
const GROUP_STYLE: Record<Group, { bg: string; fg: string; ring: string }> = {
  Tenants: { bg: "bg-blue-50", fg: "text-blue-600", ring: "ring-blue-100" },
  Rooms: { bg: "bg-violet-50", fg: "text-violet-600", ring: "ring-violet-100" },
  Maintenance: { bg: "bg-amber-50", fg: "text-amber-600", ring: "ring-amber-100" },
  Pages: { bg: "bg-slate-100", fg: "text-slate-500", ring: "ring-slate-100" },
};

const BADGE_STYLE: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-700",
  Overdue: "bg-red-50 text-red-700",
  Unpaid: "bg-amber-50 text-amber-700",
  Partial: "bg-amber-50 text-amber-700",
  Open: "bg-red-50 text-red-700",
  "In progress": "bg-amber-50 text-amber-700",
  Resolved: "bg-emerald-50 text-emerald-700",
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

/** Wraps the substring of `text` that matches `query` in a highlight span. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-brand/15 text-ink px-px font-semibold">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const } },
};

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
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, tab]);

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

  // Flat, keyboard-navigable list in the same order the sections render.
  const flatVisible = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const select = (item: ResultItem) => {
    navigate(item.to);
    onNavigate();
  };

  const jumpToMaintenance = (tenantName: string) => {
    setTab("Maintenance");
    setQuery(tenantName);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatVisible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatVisible[activeIndex]) {
      e.preventDefault();
      select(flatVisible[activeIndex]);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tabs: { key: "All" | Group; label: string; count?: number }[] = [
    { key: "All", label: "All" },
    { key: "Tenants", label: "Tenants", count: counts.Tenants },
    { key: "Rooms", label: "Rooms", count: counts.Rooms },
    { key: "Maintenance", label: "Maintenance", count: counts.Maintenance },
    { key: "Pages", label: "Pages", count: counts.Pages },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-60 flex flex-col bg-paper/95 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -16, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-full flex-col"
      >
        {/* Header bar — search input sits where the sidebar logo/search icon lives, so opening this
            feels like the trigger simply expanded into a full-screen surface. */}
        <div className="shrink-0 border-b border-line px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-2.5 shadow-sm">
            <SearchIcon size={20} weight="bold" className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search tenants, rooms, maintenance requests, pages…"
              className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
              >
                <CloseIcon size={13} weight="bold" />
              </button>
            )}
            <span className="hidden shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted sm:flex">
              esc
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
            >
              <CloseIcon size={16} weight="bold" />
            </button>
          </div>

          <AnimatePresence>
            {query.trim() !== "" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="mx-auto mt-3 flex max-w-3xl items-center gap-1 overflow-x-auto"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl">
            {query.trim() === "" && (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-mist text-muted">
                  <SearchIcon size={20} weight="bold" />
                </span>
                <p className="text-sm text-muted">Start typing to search across the whole property account.</p>
              </div>
            )}

            {query.trim() !== "" && visible.length === 0 && (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-mist text-muted">
                  <SearchIcon size={20} weight="bold" />
                </span>
                <p className="text-sm text-muted">No matches for "{query}".</p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {grouped.map((section) => {
                const SectionIcon = GROUP_ICON[section.group];
                const style = GROUP_STYLE[section.group];
                return (
                  <motion.div
                    key={section.group}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-6 last:mb-0"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className={`flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase ${style.fg}`}>
                        <SectionIcon size={13} weight="bold" />
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

                    <motion.div
                      variants={listVariants}
                      initial="hidden"
                      animate="show"
                      className="overflow-hidden rounded-xl border border-line bg-paper"
                    >
                      {section.items.map((item, i) => {
                        const ItemIcon = item.icon;
                        const flatIndex = flatVisible.indexOf(item);
                        const isActive = flatIndex === activeIndex;
                        return (
                          <motion.div
                            key={item.key}
                            variants={itemVariants}
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                            className={`group flex items-center gap-3 px-4 py-3 transition-colors ${
                              i > 0 ? "border-t border-line" : ""
                            } ${isActive ? "bg-mist" : "hover:bg-mist"}`}
                          >
                            <button type="button" onClick={() => select(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ${style.bg} ${style.fg} ${style.ring}`}>
                                <ItemIcon size={16} weight="bold" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">
                                  <Highlight text={item.title} query={query} />
                                </span>
                                <span className="block truncate text-xs text-muted">{item.subtitle}</span>
                              </span>
                            </button>

                            {item.group === "Tenants" && !!item.relatedMaintenanceCount && (
                              <button
                                type="button"
                                onClick={() => jumpToMaintenance(item.title)}
                                className="shrink-0 rounded-full bg-mist px-2.5 py-1 text-[11px] font-medium text-muted opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                {item.relatedMaintenanceCount} maintenance
                              </button>
                            )}

                            {item.badge && (
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_STYLE[item.badge] ?? "bg-paper text-muted"}`}>
                                {item.badge}
                              </span>
                            )}

                            {isActive && (
                              <ArrowElbowDownLeft size={13} weight="bold" className="hidden shrink-0 text-muted/60 sm:block" />
                            )}
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Keyboard hint footer — quiet, only shows once there's something to navigate. */}
        {flatVisible.length > 0 && (
          <div className="hidden shrink-0 items-center justify-center gap-4 border-t border-line py-2.5 text-xs text-muted sm:flex">
            <span className="flex items-center gap-1">
              <ArrowUp size={12} weight="bold" />
              <ArrowDown size={12} weight="bold" /> navigate
            </span>
            <span className="flex items-center gap-1">
              <ArrowElbowDownLeft size={12} weight="bold" /> select
            </span>
            <span className="flex items-center gap-1">esc close</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}