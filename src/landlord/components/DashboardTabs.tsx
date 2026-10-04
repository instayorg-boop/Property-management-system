import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSettings } from "../SettingsContext";
import { getTodayTasks, readCachedTasks } from "../../lib/todaysTasksApi";

const TABS = [
  { label: "Overview", to: "/dashboard" },
  { label: "Tasks", to: "/tasks" },
];

/** Sits above the dashboard's greeting and above the /tasks page title — one shared way to switch
 * between the two, instead of the only route back to Overview being the /tasks page's own back
 * arrow. Same underline-tab treatment as Settings.tsx's section bar, so this reads as the same kind
 * of "persistent tab bar" pattern rather than a one-off control. Plain path match for "active":
 * both routes are exact, no nested children to account for.
 *
 * The open-task count is fetched here independently (cache-first, same as TodaysTasks.tsx) rather
 * than threaded down from either page — this bar renders on both /dashboard and /tasks, and neither
 * page's own task-fetching state is in scope of the other. */
export default function DashboardTabs() {
  const { pathname } = useLocation();
  const { propertyId } = useSettings();
  const [taskCount, setTaskCount] = useState<number | null>(() => (propertyId ? readCachedTasks(propertyId)?.counts.all ?? null : null));

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    getTodayTasks(propertyId)
      .then((p) => {
        if (!cancelled) setTaskCount(p.counts.all);
      })
      .catch((e) => console.error("Failed to load task count", e));
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  return (
    <div className="overflow-x-auto mt-4 px-4 sm:px-8">
      <div className="flex items-center gap-1">
        {TABS.map((t) => {
          const active = pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`shrink-0 flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.to === "/tasks" && !!taskCount && (
                <span className="rounded-md bg-mist px-1.5 py-0.5 text-[10px] font-medium text-muted">{taskCount}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
