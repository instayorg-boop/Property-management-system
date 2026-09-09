import { useState } from "react";
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

/** Small pill in the header: offline state + how many actions are still queued to sync. Doubles
 * as the entry point into SyncReviewModal whenever something needs a manager's decision. */
export function SyncStatusBadge() {
  const online = useOnlineStatus();
  const pending = usePendingSyncCount();
  const reviewCount = useReviewCount();
  const [reviewOpen, setReviewOpen] = useState(false);

  if (reviewCount > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="flex w-full items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
        >
          <Warning size={14} weight="duotone" />
          {reviewCount} need{reviewCount === 1 ? "s" : ""} review
        </button>
        {reviewOpen && <SyncReviewModal onClose={() => setReviewOpen(false)} />}
      </>
    );
  }

  if (!online) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        <CloudSlash size={14} weight="duotone" />
        Offline{pending > 0 ? ` · ${pending} pending` : ""}
      </span>
    );
  }

  if (pending > 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
        <ArrowsClockwise size={14} weight="duotone" className="animate-spin" />
        Syncing {pending}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <CloudCheck size={14} weight="duotone" />
      Synced
    </span>
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
