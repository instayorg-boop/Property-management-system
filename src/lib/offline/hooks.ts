import { useEffect, useState } from "react";
import { db, type QueuedAction } from "./db";
import { getCachedViewSyncedAt } from "./cachedView";
import { getLastSynced, pendingCount, subscribeOffline } from "./sync";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useLastSynced(table: string, propertyId: string | undefined): string | null {
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    const refresh = () => {
      getLastSynced(table, propertyId).then((v) => !cancelled && setLastSynced(v));
    };
    refresh();
    const unsubscribe = subscribeOffline(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [table, propertyId]);
  return lastSynced;
}

/** Like useLastSynced, but for a whole-list view cache written via writeCachedView. */
export function useCachedViewSyncedAt(viewKey: string, propertyId: string | undefined): string | null {
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    const refresh = () => {
      getCachedViewSyncedAt(viewKey, propertyId).then((v) => !cancelled && setSyncedAt(v));
    };
    refresh();
    const unsubscribe = subscribeOffline(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [viewKey, propertyId]);
  return syncedAt;
}

export function usePendingSyncCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => pendingCount().then(setCount);
    refresh();
    return subscribeOffline(refresh);
  }, []);
  return count;
}

function useActionsByStatus(status: QueuedAction["status"]): QueuedAction[] {
  const [actions, setActions] = useState<QueuedAction[]>([]);
  useEffect(() => {
    const refresh = () => db.mutationQueue.where("status").equals(status).toArray().then(setActions);
    refresh();
    return subscribeOffline(refresh);
  }, [status]);
  return actions;
}

export function useConflictedActions(): QueuedAction[] {
  return useActionsByStatus("conflict");
}

/** Payments/edits the sync engine deliberately did not auto-apply — see sync.ts's replay(). */
export function useNeedsReviewActions(): QueuedAction[] {
  return useActionsByStatus("needs_review");
}

/** Ids of records with a not-yet-confirmed queued edit, for showing a "pending sync" tag on that
 * row. `extractId` pulls the record's id out of a queued action's payload (shape varies by type —
 * a payment keys off `tenant_id`, a room update off `number`, etc). */
function usePendingRecordIds(types: QueuedAction["type"][], extractId: (a: QueuedAction) => string | undefined): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const refresh = () =>
      db.mutationQueue
        .where("status")
        .anyOf("pending", "syncing")
        .toArray()
        .then((actions) => {
          const matched = actions.filter((a) => types.includes(a.type));
          setIds(new Set(matched.map(extractId).filter((id): id is string => !!id)));
        });
    refresh();
    return subscribeOffline(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types.join(",")]);
  return ids;
}

export function usePendingTenantIds(): Set<string> {
  return usePendingRecordIds(["record_payment", "update_tenant", "add_tenant_note"], (a) => {
    const payload = a.payload as { tenant_id?: string; id?: string };
    return payload.tenant_id ?? payload.id;
  });
}

export function usePendingRoomNumbers(): Set<string> {
  return usePendingRecordIds(["update_room"], (a) => (a.payload as { number?: string }).number);
}

export function usePendingMaintenanceIds(): Set<string> {
  return usePendingRecordIds(["update_maintenance_report"], (a) => (a.payload as { id?: string }).id);
}
