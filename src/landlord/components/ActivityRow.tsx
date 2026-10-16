import { useNavigate } from "react-router-dom";
import { X as XIcon } from "@phosphor-icons/react";
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

/** Same card look as the bell dropdown's own row (NotificationsDropdown.tsx): a round white icon
 * chip with the category color carried by the icon itself, a title line with an unread dot and
 * the timestamp right-aligned, and a short two-line body preview underneath, rather than cramming
 * everything onto one line, which is what was truncating mid-sentence in a narrow card. Shared by
 * the dashboard's "Recent activity" preview and the full /notifications page. The whole row is
 * clickable and goes to the exact same deep link resolveNotificationLink already resolves for
 * tasks: the tenant profile, the specific maintenance report, etc., rather than a generic
 * section route. */
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
  const { icon: Icon, tint } = CATEGORY_STYLE[categoryOf(n)];
  const fg = tint.split(" ").find((c) => c.startsWith("text-")) ?? "text-muted";
  const isUnread = !n.read_at;
  const route = resolveNotificationLink(n, tenants);
  const title = n.title || n.body || "Update";
  const body = n.title ? n.body : null;

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
      className={`group flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors ${
        isUnread ? "bg-brand-soft/40 hover:bg-brand-soft/60" : "hover:bg-mist/50"
      }`}
    >
      {/* A round, white-backed icon chip (border + soft shadow): the icon itself carries the
          category color, same as the bell dropdown. */}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper shadow-sm">
        <Icon size={17} weight="duotone" className={fg} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
            {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
            <span className="truncate">{title}</span>
          </p>
          <span className="shrink-0 pt-px text-[11px] whitespace-nowrap text-muted">{timeAgo(n.created_at)}</span>
        </div>
        {body && <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">{body}</p>}
      </div>

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
          className="flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-md text-muted opacity-0 transition-all hover:bg-mist hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
        >
          <XIcon size={12} weight="bold" />
        </button>
      )}
    </div>
  );
}
