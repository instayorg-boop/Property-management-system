import { useState } from "react";
import { Warning, GitMerge } from "@phosphor-icons/react";
import Modal from "./Modal";
import Button from "./Button";
import { useConflictedActions, useNeedsReviewActions } from "../../lib/offline/hooks";
import { resolveConflict, trySync } from "../../lib/offline/sync";
import { db, type QueuedAction } from "../../lib/offline/db";

const ACTION_LABEL: Record<QueuedAction["type"], string> = {
  record_payment: "Payment",
  add_tenant_note: "Tenant note",
  update_tenant: "Tenant update",
  update_room: "Room update",
  update_maintenance_report: "Maintenance update",
};

function fieldDiff(local: Record<string, unknown>, server: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(local), ...Object.keys(server)])).filter(
    (k) => !k.startsWith("_") && k !== "id" && local[k] !== server[k]
  );
  return keys.map((k) => ({ key: k, local: local[k], server: server[k] }));
}

function ConflictRow({ action }: { action: QueuedAction }) {
  const [busy, setBusy] = useState(false);
  if (!action.conflict) return null;
  const diffs = fieldDiff(action.conflict.local, action.conflict.server);

  const resolve = async (choice: "keep_local" | "keep_server") => {
    setBusy(true);
    await resolveConflict(action.id, choice);
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center gap-2">
        <GitMerge size={16} weight="duotone" className="text-amber-600" />
        <p className="text-sm font-semibold text-ink">{ACTION_LABEL[action.type]}</p>
        <span className="text-xs text-muted">queued {new Date(action.createdAt).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        This record changed on the server while your edit was offline. Choose which version to keep.
      </p>
      {diffs.length > 0 && (
        <div className="mt-3 space-y-1.5 text-xs">
          {diffs.map((d) => (
            <div key={d.key} className="grid grid-cols-[100px_1fr_1fr] gap-2">
              <span className="font-medium text-muted">{d.key}</span>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{String(d.local ?? "—")}</span>
              <span className="rounded bg-mist px-1.5 py-0.5 text-ink">{String(d.server ?? "—")}</span>
            </div>
          ))}
          <div className="grid grid-cols-[100px_1fr_1fr] gap-2 pt-0.5 text-[11px] text-muted">
            <span />
            <span>Your offline edit</span>
            <span>Current server value</span>
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => resolve("keep_local")}>
          Keep my edit
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => resolve("keep_server")}>
          Keep server version
        </Button>
      </div>
    </div>
  );
}

function NeedsReviewRow({ action }: { action: QueuedAction }) {
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    await db.mutationQueue.update(action.id, { status: "pending" });
    await trySync();
    setBusy(false);
  };
  const discard = async () => {
    setBusy(true);
    await db.mutationQueue.delete(action.id);
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center gap-2">
        <Warning size={16} weight="duotone" className="text-amber-600" />
        <p className="text-sm font-semibold text-ink">{ACTION_LABEL[action.type]}</p>
        <span className="text-xs text-muted">queued {new Date(action.createdAt).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        This needs a quick look before it's applied — the tenant's balance may already be settled,
        or someone else may have logged the same thing while this was offline.
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={apply}>
          Apply anyway
        </Button>
        <Button variant="secondary" disabled={busy} onClick={discard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

/** Modal listing every queued action that needs a manager's decision — conflicts (someone else
 * changed the record while this was offline) and flagged actions (e.g. a payment that would push
 * an already-settled balance negative). Neither type auto-applies — see sync.ts's replay(). */
export default function SyncReviewModal({ onClose }: { onClose: () => void }) {
  const conflicts = useConflictedActions();
  const needsReview = useNeedsReviewActions();
  const total = conflicts.length + needsReview.length;

  return (
    <Modal onClose={onClose} title="Needs your review" description={`${total} queued ${total === 1 ? "action needs" : "actions need"} a decision before syncing.`} maxWidth="max-w-lg">
      <div className="space-y-3 px-6 py-4">
        {conflicts.map((a) => (
          <ConflictRow key={a.id} action={a} />
        ))}
        {needsReview.map((a) => (
          <NeedsReviewRow key={a.id} action={a} />
        ))}
        {total === 0 && <p className="py-6 text-center text-sm text-muted">Nothing needs review.</p>}
      </div>
    </Modal>
  );
}

export function useReviewCount(): number {
  const conflicts = useConflictedActions();
  const needsReview = useNeedsReviewActions();
  return conflicts.length + needsReview.length;
}
