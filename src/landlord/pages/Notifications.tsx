import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell as BellIcon, Funnel } from "@phosphor-icons/react";
import { useNotifications, type NotificationCategory } from "../NotificationsContext";
import { useTenants } from "../TenantsContext";
import ActivityRow from "../components/ActivityRow";
import { CATEGORY_STYLE, categoryOf, dayKeyAndLabel } from "../components/NotificationsPanel";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";

type ReadTab = "all" | "unread";
type DateRange = "all" | "today" | "7d" | "30d";

const DATE_RANGE_LABEL: Record<DateRange, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

function withinRange(iso: string, range: DateRange): boolean {
  if (range === "all") return true;
  const ms = Date.now() - new Date(iso).getTime();
  const days = ms / 86_400_000;
  if (range === "today") return days < 1;
  if (range === "7d") return days < 7;
  return days < 30;
}

/** Full activity/notifications page — the bell icon and the dashboard's "View all activity" both
 * land here instead of opening the old side drawer. Styled identically to the dashboard's "Recent
 * activity" card (cardless row list, same time/icon/text/dismiss layout), grouped by day the same
 * way the old drawer grouped its bundles, plus read-state, category and date filters a compact
 * dashboard preview has no room for. */
export default function Notifications() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { tenants } = useTenants();
  const [readTab, setReadTab] = useState<ReadTab>("all");
  const [categories, setCategories] = useState<Set<NotificationCategory>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const navigate = useNavigate();

  const activeFilterCount = categories.size + (dateRange !== "all" ? 1 : 0);

  const toggleCategory = (c: NotificationCategory) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const visible = useMemo(
    () =>
      notifications.filter((n) => {
        if (readTab === "unread" && n.read_at) return false;
        if (categories.size > 0 && !categories.has(categoryOf(n))) return false;
        if (!withinRange(n.created_at, dateRange)) return false;
        return true;
      }),
    [notifications, readTab, categories, dateRange]
  );

  const grouped = useMemo(() => {
    const order: string[] = [];
    const labels = new Map<string, string>();
    const byDay = new Map<string, typeof visible>();
    for (const n of visible) {
      const { key, label } = dayKeyAndLabel(n.created_at);
      if (!byDay.has(key)) {
        order.push(key);
        labels.set(key, label);
        byDay.set(key, []);
      }
      byDay.get(key)!.push(n);
    }
    return order.map((key) => ({ key, label: labels.get(key)!, rows: byDay.get(key)! }));
  }, [visible]);

  const allCategories = Object.keys(CATEGORY_STYLE) as NotificationCategory[];

  return (
    <div className="px-4 pt-5 pb-24 sm:px-8">
      {/* Title and its filter/action controls share one row — closely packed on the right, rather
          than the controls sitting on a separate line below the title. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            aria-label="Back to dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <ArrowLeft size={16} weight="bold" />
          </button>

          <h1 className="font-display text-2xl font-bold tracking-tight text-brand">Recent activity</h1>
          {notifications.length > 0 && (
            <span className="rounded-md bg-mist px-2 py-1 text-xs font-medium text-muted">{notifications.length}</span>
          )}
        </div>

        {/* One grouped toolbar (single border, one background) rather than three separately
            boxed controls sitting side by side — read-state and type/date are both "narrow the
            list" filters, so they share a segment; "Mark all as read" is a different kind of
            action, set off by a divider instead of its own detached button. */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-paper p-1">
          <div className="inline-flex items-center rounded-md bg-mist/50 p-0.5">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setReadTab(t)}
                className={`rounded-[5px] px-2.5 py-1.5 text-sm font-medium transition-all ${
                  readTab === t ? "border border-line bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {t === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
              </button>
            ))}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Funnel size={14} weight="bold" />
                Filter
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-0.5 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 border-gray-200">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Type</p>
                <div className="mt-2 space-y-2">
                  {allCategories.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox checked={categories.has(c)} onCheckedChange={() => toggleCategory(c)} />
                      {CATEGORY_STYLE[c].label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground">Date</p>
                <div className="mt-2 space-y-1">
                  {(Object.keys(DATE_RANGE_LABEL) as DateRange[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setDateRange(r)}
                      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        dateRange === r ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/60"
                      }`}
                    >
                      {DATE_RANGE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    setCategories(new Set());
                    setDateRange("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </PopoverContent>
          </Popover>

          <div className="mx-1 h-5 w-px bg-line" aria-hidden="true" />

          <Button variant="ghost" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
            Mark all as read
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center border-y border-line/70 py-20 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-mist">
            <BellIcon size={19} className="text-muted" />
          </div>
          <p className="text-sm font-medium text-ink">No activity here</p>
          <p className="mt-1 text-xs text-muted">Try a different filter, or check back later.</p>
        </div>
      ) : (
        <div className="mt-6 max-w-3xl">
          {grouped.map(({ key, label, rows }) => (
            <div key={key}>
              <p className="pt-3 pb-1 text-xs font-medium text-muted">{label}</p>
              <div className="divide-y divide-line/70">
                {rows.map((n) => (
                  <ActivityRow key={n.id} notification={n} tenants={tenants} onMarkRead={markRead} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
