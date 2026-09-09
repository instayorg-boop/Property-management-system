import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudCheck, CloudSlash, ArrowsClockwise, Warning } from "@phosphor-icons/react";
import { useOnlineStatus, usePendingSyncCount } from "../../lib/offline/hooks";
import SyncReviewModal, { useReviewCount } from "./SyncReviewModal";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "Last synced Xm ago" — sits near a page's data so managers can judge staleness at a glance. */
export function LastSyncedLabel({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  return (
    <span className="text-xs text-muted" title={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : undefined}>
      Last synced {timeAgo(lastSyncedAt)}
    </span>
  );
}

type SyncState = "review" | "offline" | "syncing" | "synced";

const STATE_STYLE: Record<SyncState, { bg: string; text: string }> = {
  review: { bg: "bg-red-50", text: "text-red-700" },
  offline: { bg: "bg-amber-50", text: "text-amber-700" },
  syncing: { bg: "bg-blue-50", text: "text-blue-700" },
  synced: { bg: "bg-emerald-50", text: "text-emerald-700" },
};

/** Floating pill, bottom-center over the page — offline/needs-review/syncing stay up as long as
 * that's true; "Synced" is a brief confirmation that appears for a few seconds and then fades,
 * rather than sitting there permanently once there's nothing left to report. Doubles as the entry
 * point into SyncReviewModal whenever something needs a manager's decision. */
export function SyncStatusBadge() {
  const online = useOnlineStatus();
  const pending = usePendingSyncCount();
  const reviewCount = useReviewCount();
  const [reviewOpen, setReviewOpen] = useState(false);

  const state: SyncState = reviewCount > 0 ? "review" : !online ? "offline" : pending > 0 ? "syncing" : "synced";
  const persistent = state !== "synced";

  // "Synced" is transient — show it for a few seconds whenever the app settles into that state
  // (e.g. just came back online, or just finished a sync), then let it disappear. Offline/syncing/
  // needs-review stay up for as long as they're true, so this effect only ever times out "synced".
  const [visible, setVisible] = useState(persistent);
  useEffect(() => {
    setVisible(true);
    if (!persistent) {
      const t = window.setTimeout(() => setVisible(false), 3000);
      return () => window.clearTimeout(t);
    }
  }, [state, persistent]);

  const { bg, text } = STATE_STYLE[state];

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
        <AnimatePresence>
          {visible && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto"
            >
              {state === "review" ? (
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium shadow-card transition-colors hover:brightness-95 ${bg} ${text}`}
                >
                  <Warning size={14} weight="duotone" />
                  {reviewCount} need{reviewCount === 1 ? "s" : ""} review
                </button>
              ) : (
                <span className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium shadow-card ${bg} ${text}`}>
                  {state === "offline" && <CloudSlash size={14} weight="duotone" />}
                  {state === "syncing" && <ArrowsClockwise size={14} weight="duotone" className="animate-spin" />}
                  {state === "synced" && <CloudCheck size={14} weight="duotone" />}
                  {state === "offline" && `Offline${pending > 0 ? ` · ${pending} pending` : ""}`}
                  {state === "syncing" && `Syncing ${pending}`}
                  {state === "synced" && "Synced"}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {reviewOpen && <SyncReviewModal onClose={() => setReviewOpen(false)} />}
    </>
  );
}

/** Badge for a single record that has a queued-but-not-yet-confirmed edit. */
export function PendingSyncTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
      Pending sync
    </span>
  );
}
