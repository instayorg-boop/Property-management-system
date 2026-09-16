import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, CurrencyCircleDollar, Wrench, Coins, WarningCircle, BellRinging } from "@phosphor-icons/react";
import { useNotifications, type NotificationCategory, type NotificationRow } from "../NotificationsContext";

type FilterTab = "all" | "unread";

// Each category gets a fixed icon + tint so the list reads at a glance (a wall of same-looking
// rows is exactly what makes a notification feed hard to scan) instead of needing to read every
// title to tell a payment apart from a maintenance report. Duotone weight + a soft rounded-square
// tile (not a plain circle) reads closer to a real icon set than the flat glyphs this replaced.
const CATEGORY_STYLE: Record<NotificationCategory, { icon: typeof CurrencyCircleDollar; tint: string; label: string }> = {
  payment: { icon: CurrencyCircleDollar, tint: "bg-emerald-50 text-emerald-600", label: "Payment" },
  maintenance: { icon: Wrench, tint: "bg-amber-50 text-amber-600", label: "Maintenance" },
  payout: { icon: Coins, tint: "bg-brand-soft text-brand", label: "Payout" },
  overdue: { icon: WarningCircle, tint: "bg-red-50 text-red-600", label: "Overdue rent" },
  system: { icon: BellRinging, tint: "bg-mist text-muted", label: "Update" },
};

// Where clicking a notification should take the landlord — each category has one obvious "go look
// at this" destination.
const CATEGORY_LINK: Record<NotificationCategory, string> = {
  payment: "/rent",
  maintenance: "/maintenance",
  payout: "/accounting",
  overdue: "/rent",
  system: "/dashboard",
};

function categoryOf(n: NotificationRow): NotificationCategory {
  return (n.category as NotificationCategory) in CATEGORY_STYLE ? (n.category as NotificationCategory) : "system";
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

/** "Today" / "Yesterday" / "15th Apr, 2024" — same day-bucketing a real inbox uses, so a long
 * history reads as a handful of labeled sections instead of one undifferentiated scroll. */
function dayKeyAndLabel(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  const startOf = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const dayStart = startOf(d);
  const today = startOf(new Date());
  const diffDays = Math.round((today - dayStart) / 86_400_000);
  const key = new Date(dayStart).toISOString();
  if (diffDays === 0) return { key, label: "Today" };
  if (diffDays === 1) return { key, label: "Yesterday" };
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return { key, label: `${ordinal(d.getDate())} ${month}, ${d.getFullYear()}` };
}

/** One row's worth of data — either a single real notification, or several of the same category
 * on the same day folded into one ("3 payment updates") so a burst of same-kind events (a run of
 * payments landing back to back) doesn't bury everything else under a wall of near-identical rows.
 * Bundling groups by (day, category) rather than requiring adjacency, since notifications interleave
 * — two payments an hour apart with a maintenance report in between should still bundle together. */
type NotificationBundle = { key: string; category: NotificationCategory; items: NotificationRow[] };

function bundleByDay(notifications: NotificationRow[]): { dayKey: string; dayLabel: string; bundles: NotificationBundle[] }[] {
  const dayOrder: string[] = [];
  const dayLabels = new Map<string, string>();
  const byDay = new Map<string, NotificationRow[]>();
  for (const n of notifications) {
    const { key, label } = dayKeyAndLabel(n.created_at);
    if (!byDay.has(key)) {
      dayOrder.push(key);
      dayLabels.set(key, label);
      byDay.set(key, []);
    }
    byDay.get(key)!.push(n);
  }

  return dayOrder.map((dayKey) => {
    const rows = byDay.get(dayKey)!;
    const order: string[] = [];
    const byCategory = new Map<string, NotificationRow[]>();
    for (const n of rows) {
      const category = categoryOf(n);
      if (!byCategory.has(category)) {
        order.push(category);
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(n);
    }
    const bundles: NotificationBundle[] = order.map((category) => ({
      key: `${dayKey}:${category}`,
      category: category as NotificationCategory,
      items: byCategory.get(category)!,
    }));
    return { dayKey, dayLabel: dayLabels.get(dayKey)!, bundles };
  });
}

function BundleRow({ bundle, onReview, onMarkRead }: { bundle: NotificationBundle; onReview: (b: NotificationBundle) => void; onMarkRead: (b: NotificationBundle) => void }) {
  const { icon: Icon, tint, label: categoryLabel } = CATEGORY_STYLE[bundle.category];
  const latest = bundle.items[0];
  const unreadCount = bundle.items.filter((n) => !n.read_at).length;
  const isUnread = unreadCount > 0;
  const isBundled = bundle.items.length > 1;

  const title = isBundled ? `${bundle.items.length} ${categoryLabel.toLowerCase()} updates` : latest.title;
  const body = isBundled
    ? bundle.items
        .slice(0, 3)
        .map((n) => n.title)
        .join(" · ") + (bundle.items.length > 3 ? `, +${bundle.items.length - 3} more` : "")
    : latest.body;

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-start gap-3">
        <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon size={19} weight="duotone" />
          {isUnread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-brand" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-ink" : "text-ink"}`}>{title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{body}</p>
          <p className="mt-1 text-[11px] text-muted/80">
            {isBundled ? `Latest ${timeOfDay(latest.created_at)}` : timeOfDay(latest.created_at)}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => onReview(bundle)}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-mist"
            >
              Review
            </button>
            {isUnread && (
              <button
                type="button"
                onClick={() => onMarkRead(bundle)}
                className="text-xs font-medium text-muted transition-colors hover:text-brand"
              >
                Mark As Read
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [tab, setTab] = useState<FilterTab>("all");
  const navigate = useNavigate();

  const visible = tab === "all" ? notifications : notifications.filter((n) => !n.read_at);
  const grouped = useMemo(() => bundleByDay(visible), [visible]);

  const markBundleRead = (b: NotificationBundle) => {
    for (const n of b.items) if (!n.read_at) markRead(n.id);
  };

  const handleReview = (b: NotificationBundle) => {
    markBundleRead(b);
    navigate(CATEGORY_LINK[b.category]);
    onClose();
  };

  return (
    <AnimatePresence>
      {/* Docked sidebar, matching the assistant chat panel's own "sidebar" layout — a full-height
          drawer with a backdrop, not a small anchored popover, so it reads as its own view rather
          than a menu hanging off the bell button. */}
      <motion.div
        key="notifications-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40 bg-ink/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="notifications-panel"
        initial={{ opacity: 0, x: "100%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "100%" }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-line bg-paper shadow-card sm:max-w-md"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
          <p className="font-display text-lg font-semibold tracking-tight">Notifications</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* All / Unread — a plain read-state split, not a category filter: with bundling already
            grouping same-kind events together, a separate category tab bar would just be a second,
            redundant way to slice the same list. */}
        <div className="shrink-0 px-5 pb-3">
          <div className="flex rounded-lg bg-mist p-1">
            {(["all", "unread"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  tab === t ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {t === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto border-t border-line">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-14 text-center">
              <p className="text-sm font-medium text-ink">You're all caught up</p>
              <p className="text-xs text-muted">No notifications here right now.</p>
            </div>
          ) : (
            grouped.map(({ dayKey, dayLabel, bundles }) => (
              <div key={dayKey}>
                <p className="px-5 pt-3.5 pb-1 text-xs font-medium text-muted">{dayLabel}</p>
                <ul className="divide-y divide-line">
                  {bundles.map((b) => (
                    <BundleRow key={b.key} bundle={b} onReview={handleReview} onMarkRead={markBundleRead} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => {
              navigate("/settings/notifications");
              onClose();
            }}
            className="text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Go To Settings
          </button>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-40"
          >
            Mark All As Read
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
