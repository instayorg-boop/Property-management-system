import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Paperclip as AttachmentIcon } from "@phosphor-icons/react";

type NotificationTab = "inbox" | "general" | "archived";

type Notification = {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
  context: string;
  initials: string;
  color: string;
  online?: boolean;
  unread?: boolean;
  attachment?: string;
  request?: boolean;
  tab: NotificationTab;
};

const AVATAR_COLORS = ["bg-brand-soft text-brand", "bg-mist text-ink", "bg-line/60 text-ink"];

const SEED: Notification[] = [
  {
    id: "1",
    actor: "Priya Patel",
    action: "edited",
    target: "Unit 4B lease",
    time: "36 mins ago",
    context: "Maple Court",
    initials: "PP",
    color: AVATAR_COLORS[0],
    online: true,
    unread: true,
    tab: "inbox",
  },
  {
    id: "2",
    actor: "James Okoro",
    action: "left a comment on",
    target: "Rent Roll — August",
    time: "2 hours ago",
    context: "Reports",
    initials: "JO",
    color: AVATAR_COLORS[1],
    unread: true,
    tab: "inbox",
  },
  {
    id: "3",
    actor: "Mary Achieng",
    action: "shared the file",
    target: "Inspection 2.0",
    time: "3 hours ago",
    context: "Maintenance",
    initials: "MA",
    color: AVATAR_COLORS[2],
    online: true,
    request: true,
    tab: "inbox",
  },
  {
    id: "4",
    actor: "David Kim",
    action: "edited",
    target: "Tenant Onboarding",
    time: "3 hours ago",
    context: "Tenants",
    initials: "DK",
    color: AVATAR_COLORS[0],
    attachment: "move_in_checklist.pdf",
    tab: "general",
  },
  {
    id: "5",
    actor: "James Okoro",
    action: "created",
    target: "September statement",
    time: "1 day ago",
    context: "Expenses",
    initials: "JO",
    color: AVATAR_COLORS[1],
    tab: "general",
  },
];

const TABS: { id: NotificationTab; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "general", label: "General" },
  { id: "archived", label: "Archived" },
];

function Avatar({ n }: { n: Notification }) {
  return (
    <div className="relative shrink-0">
      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${n.color}`}>
        {n.initials}
      </div>
      {n.online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-emerald-500" />
      )}
    </div>
  );
}

export default function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<NotificationTab>("inbox");
  const [items, setItems] = useState(SEED);

  const counts = useMemo(
    () => ({
      inbox: items.filter((n) => n.tab === "inbox" && n.unread).length,
      general: items.filter((n) => n.tab === "general").length,
    }),
    [items]
  );

  const visible = items.filter((n) => n.tab === tab);

  const markAllRead = () => setItems((prev) => prev.map((n) => ({ ...n, unread: false })));

  const resolveRequest = (id: string) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, request: false, unread: false } : n)));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-h-[32rem] w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-card"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
          <p className="font-display text-lg font-semibold tracking-tight">Notifications</p>
          <button
            type="button"
            onClick={markAllRead}
            className="text-sm font-medium text-muted transition-colors hover:text-brand"
          >
            Mark all as read
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-5 border-b border-line px-5">
          {TABS.map((t) => {
            const count = t.id === "inbox" ? counts.inbox : t.id === "general" ? counts.general : 0;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 pb-2.5 text-sm font-medium transition-colors ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                      active ? "bg-ink text-paper" : "bg-mist text-muted"
                    }`}
                  >
                    {count}
                  </span>
                )}
                {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-14 text-center">
              <p className="text-sm font-medium text-ink">You're all caught up</p>
              <p className="text-xs text-muted">No notifications here right now.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((n) => (
                <li key={n.id} className="flex gap-3 px-5 py-3.5">
                  <Avatar n={n} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-ink">
                      <span className="font-semibold">{n.actor}</span> {n.action}{" "}
                      <span className="font-semibold">{n.target}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {n.time} · {n.context}
                    </p>

                    {n.attachment && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-mist px-2.5 py-1.5 text-xs font-medium text-muted">
                        <AttachmentIcon size={14} weight="duotone" />
                        {n.attachment}
                      </div>
                    )}

                    {n.request && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => resolveRequest(n.id)}
                          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-mist"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => resolveRequest(n.id)}
                          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
                        >
                          Accept
                        </button>
                      </div>
                    )}
                  </div>
                  {n.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-line px-5 py-3 text-center">
          <button type="button" onClick={onClose} className="text-sm font-medium text-muted hover:text-ink">
            Close
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
