import { useNavigate } from "react-router-dom";
import { CaretRight, X as XIcon } from "@phosphor-icons/react";
import type { NotificationRow } from "../NotificationsContext";
import type { Tenant } from "../TenantsContext";
import { resolveNotificationLink } from "../linkResolver";
import { CATEGORY_STYLE, categoryOf } from "./NotificationsPanel";

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** One notification row, cardless — a time column, a category icon, the message, and a dismiss
 * button. Shared by the dashboard's "Recent activity" preview and the full /notifications page.
 * The whole row is clickable (not just a small hover-only "View" link) and goes to the exact same
 * deep link resolveNotificationLink already resolves for tasks — the tenant profile, the specific
 * maintenance report, etc. — rather than a generic section route. */
export default function ActivityRow({
  notification,
  tenants,
  onMarkRead,
}: {
  notification: NotificationRow;
  tenants: Tenant[];
  onMarkRead: (id: string) => void;
}) {
  const navigate = useNavigate();
  const n = notification;
  const { icon: CategoryIcon, tint, label: categoryLabel } = CATEGORY_STYLE[categoryOf(n)];
  const isUnread = !n.read_at;
  const route = resolveNotificationLink(n, tenants);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(route)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(route);
        }
      }}
      className={`group flex cursor-pointer items-center gap-4 py-3.5 transition-colors hover:bg-mist/30 ${isUnread ? "bg-brand-soft/30" : ""}`}
    >
      {/* Time */}
      <span className="w-[52px] shrink-0 text-xs font-medium tabular-nums text-muted">{timeAgo(n.created_at)}</span>

      {/* Category — an unread dot rides on the icon tile itself rather than a separate column, so
          read and unread rows still line up identically. */}
      <span className={`relative flex shrink-0 items-center justify-center rounded-lg ${tint}`} title={categoryLabel}>
        <CategoryIcon size={18} weight="duotone" aria-hidden="true" />
        <span className="sr-only">{categoryLabel}</span>
        {isUnread && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-paper bg-brand" aria-hidden="true" />
        )}
      </span>

      {/* Activity */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm leading-5 ${isUnread ? "font-semibold text-ink" : "text-ink"}`}>{n.body || n.title}</p>
      </div>

      {/* Hover affordance — the whole row navigates, this is just the visual cue that it does. */}
      <CaretRight
        size={14}
        className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100"
      />

      {/* Dismiss */}
      {!n.read_at && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(n.id);
          }}
          aria-label="Mark activity as read"
          title="Mark as read"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-all hover:bg-mist hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
        >
          <XIcon size={12} weight="bold" />
        </button>
      )}
    </div>
  );
}
