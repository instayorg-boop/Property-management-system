import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell as BellIcon, CaretRight, Checks, X as CloseIcon } from "@phosphor-icons/react";
import { useNotifications } from "../NotificationsContext";
import { useTenants } from "../TenantsContext";
import { resolveNotificationLink } from "../linkResolver";
import { bundleByDay, CATEGORY_STYLE, type NotificationBundle } from "./NotificationsPanel";

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** One bundle's worth of data: a single notification, or several of the same category on the
 * same day folded into one row ("4 overdue rent updates"), the same way the full-page
 * notifications panel already bundles. Without this, a property with a lot of tenants could hit
 * "needs your attention" for several of them back to back and bury the feed under near-identical
 * rows. Exported so anything embedding NotificationsFeed can reuse the exact same row. */
export function NotificationFeedRow({
  bundle,
  onOpen,
}: {
  bundle: NotificationBundle;
  onOpen: (bundle: NotificationBundle) => void;
}) {
  const { icon: Icon, tint, label: categoryLabel } = CATEGORY_STYLE[bundle.category];
  const fg = tint.split(" ").find((c) => c.startsWith("text-")) ?? "text-muted";
  const latest = bundle.items[0];
  const isUnread = bundle.items.some((n) => !n.read_at);
  const isBundled = bundle.items.length > 1;

  const title = isBundled ? `${bundle.items.length} ${categoryLabel.toLowerCase()} updates` : latest.title;
  const body = isBundled
    ? bundle.items
        .slice(0, 3)
        .map((n) => n.body || n.title)
        .join(", ") + (bundle.items.length > 3 ? `, +${bundle.items.length - 3} more` : "")
    : latest.body;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(bundle)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(bundle);
        }
      }}
      className={`flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors ${
        isUnread ? "bg-brand-soft/40 hover:bg-brand-soft/60" : "hover:bg-mist/50"
      }`}
    >
      {/* A round, white-backed icon chip (border + soft shadow) rather than a flat tinted square:
          the icon itself carries the category color. */}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper shadow-sm">
        <Icon size={17} weight="duotone" className={fg} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
            {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
            <span className="truncate">{title}</span>
          </p>
          <span className="shrink-0 pt-px text-[11px] whitespace-nowrap text-muted">
            {isBundled ? `Latest ${timeAgo(latest.created_at)}` : timeAgo(latest.created_at)}
          </span>
        </div>
        {body && <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">{body}</p>}
      </div>
    </div>
  );
}

/** The day-grouped, bundled notification list: header (title, unread-aware "Mark all as read",
 * optional close), the list grouped under "Today" / "Yesterday" / a date the same way the full
 * /notifications page groups it, and a "View all activity" footer. Shared by the bell dropdown
 * (NotificationsDropdown, which wraps this in its floating panel chrome) and the dashboard's
 * "Recent activity" card (which wraps it in a plain bordered card), so the two are always the
 * exact same design instead of two hand-maintained copies that can drift apart. */
export default function NotificationsFeed({
  onClose,
  maxBundles = 8,
  maxHeight,
}: {
  /** Only passed by the dropdown: a static dashboard card has nothing to "close". */
  onClose?: () => void;
  /** How many bundles (not raw notifications) to show before "View all activity" is the only
   * way to see more. */
  maxBundles?: number;
  /** Caps the list's own height and makes it scroll internally (the dropdown's 24rem) instead of
   * growing the whole page. Omit it to let the list take whatever height its content needs. */
  maxHeight?: string;
}) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { tenants } = useTenants();
  const navigate = useNavigate();

  // Bundled before capping, since capping the raw list first could split a group of same-category
  // same-day events across the cutoff, undoing the bundling.
  const grouped = useMemo(() => {
    const byDay = bundleByDay(notifications);
    const limited: typeof byDay = [];
    let shown = 0;
    for (const day of byDay) {
      if (shown >= maxBundles) break;
      const bundles = day.bundles.slice(0, maxBundles - shown);
      shown += bundles.length;
      limited.push({ ...day, bundles });
    }
    return limited;
  }, [notifications, maxBundles]);

  const openRow = (bundle: NotificationBundle) => {
    for (const n of bundle.items) if (!n.read_at) markRead(n.id);
    onClose?.();
    // A bundled entry ("4 overdue rent updates") spans several different tenants, and there's no
    // single record to deep-link to, so send it to the full activity page instead of guessing one
    // tenant from the group. A single-item bundle still resolves to its exact record.
    navigate(bundle.items.length > 1 ? "/notifications" : resolveNotificationLink(bundle.items[0], tenants));
  };

  const goToAll = () => {
    onClose?.();
    navigate("/notifications");
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="font-display text-base font-bold tracking-tight text-ink">Notifications</p>
        <div className="flex shrink-0 items-center gap-3">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
            >
              <Checks size={14} weight="bold" />
              Mark all as read
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
            >
              <CloseIcon size={14} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className={maxHeight ? "overflow-y-auto" : ""} style={maxHeight ? { maxHeight } : undefined}>
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-mist">
              <BellIcon size={16} className="text-muted" />
            </div>
            <p className="text-sm font-medium text-ink">You're all caught up</p>
            <p className="text-xs text-muted">No notifications here right now.</p>
          </div>
        ) : (
          grouped.map(({ dayKey, dayLabel, bundles }) => (
            <div key={dayKey}>
              <p className="bg-mist/60 px-4 py-1.5 text-xs font-semibold text-muted">{dayLabel}</p>
              <div className="space-y-1 px-2.5 py-1.5">
                {bundles.map((b) => (
                  <NotificationFeedRow key={b.key} bundle={b} onOpen={openRow} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <button
        type="button"
        onClick={goToAll}
        className="flex w-full items-center justify-center gap-1 border-t border-line px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-mist hover:text-ink"
      >
        View all activity
        <CaretRight size={12} weight="bold" />
      </button>
    </>
  );
}
