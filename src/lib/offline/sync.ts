import { supabase } from "../supabaseClient";
import { db, type QueuedAction } from "./db";

type Listener = () => void;
const listeners = new Set<Listener>();
/** Notify subscribed UI (last-synced badge, pending counter) that cache/queue state changed. */
function notify() {
  listeners.forEach((l) => l());
}
export function subscribeOffline(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- Reads: pull server tables into Dexie -------------------------------------------------

/**
 * Refreshes one cached table from Supabase and stamps `syncMeta`. Called on load (after
 * rendering from cache) and again whenever the browser regains connectivity.
 */
export async function pullTable<T extends { id: string }>(
  table: string,
  propertyId: string,
  fetcher: () => Promise<T[]>
): Promise<T[]> {
  const rows = await fetcher();
  await db.transaction("rw", (db as any)[table], db.syncMeta, async () => {
    await (db as any)[table].where("property_id").equals(propertyId).delete();
    await (db as any)[table].bulkPut(rows);
    await db.syncMeta.put({ table, propertyId, lastSyncedAt: new Date().toISOString() });
  });
  notify();
  return rows;
}

export async function getLastSynced(table: string, propertyId: string): Promise<string | null> {
  const meta = await db.syncMeta.get(table);
  if (!meta || meta.propertyId !== propertyId) return null;
  return meta.lastSyncedAt;
}

// --- Writes: queue while offline, replay on reconnect -------------------------------------

export async function enqueueAction(action: Omit<QueuedAction, "status" | "createdAt">): Promise<void> {
  await db.mutationQueue.put({
    ...action,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  notify();
  void trySync();
}

export async function pendingCount(): Promise<number> {
  return db.mutationQueue.where("status").anyOf("pending", "syncing").count();
}

let syncing = false;

/** Replays the queue: payments first (priority 0), then other edits, each in creation order. */
export async function trySync(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const queued = await db.mutationQueue.where("status").anyOf("pending", "failed").sortBy("priority");
    const ordered = queued.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));

    for (const action of ordered) {
      await db.mutationQueue.update(action.id, { status: "syncing" });
      notify();
      try {
        const result = await replay(action);
        if (result.kind === "conflict") {
          await db.mutationQueue.update(action.id, {
            status: "conflict",
            conflict: { local: action.payload, server: result.server },
          });
        } else if (result.kind === "needs_review") {
          await db.mutationQueue.update(action.id, { status: "needs_review" });
        } else {
          await db.mutationQueue.update(action.id, { status: "synced" });
        }
      } catch (err) {
        await db.mutationQueue.update(action.id, {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      notify();
    }
  } finally {
    syncing = false;
  }
}

type ReplayResult =
  | { kind: "ok" }
  | { kind: "conflict"; server: Record<string, unknown> }
  | { kind: "needs_review" };

/**
 * Applies one queued action against Supabase. The idempotency key (`action.id`) is sent as the
 * mutation's primary key / `Prefer: resolution=merge-duplicates` target so a retried sync can
 * never double-apply a payment. Conflict detection compares `action.baseUpdatedAt` against the
 * row's current `updated_at` — a mismatch means someone else changed the record while this
 * action was queued, so it's surfaced for manual resolution instead of applied.
 */
async function replay(action: QueuedAction): Promise<ReplayResult> {
  switch (action.type) {
    case "record_payment":
      return replayLedgerEntry(action);
    case "update_tenant":
    case "add_tenant_note":
      return replayTenantUpdate(action);
    case "update_room":
      return replayRoomUpdate(action);
    case "update_maintenance_report":
      return replayRowUpdate(action, "maintenance_reports");
  }
}

async function replayLedgerEntry(action: QueuedAction): Promise<ReplayResult> {
  const { _tenantPatch, ...ledgerPayload } = action.payload as {
    tenant_id: string;
    amount: number;
    _tenantPatch?: Record<string, unknown>;
    [k: string]: unknown;
  };

  // A payment that would push the tenant into an inconsistent state (e.g. already fully paid,
  // or someone else logged a payment for the same period while offline) needs a human to look
  // at it rather than being auto-applied — see requirement 3.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owed_amount")
    .eq("id", ledgerPayload.tenant_id)
    .maybeSingle();
  if (tenant && ledgerPayload.amount > 0 && tenant.owed_amount <= 0) {
    return { kind: "needs_review" };
  }

  // The queue's payload is a dynamic, hand-assembled object (built by whichever context enqueued
  // it), so it can't statically match Supabase's generated Insert/Update row types the way a
  // normal typed call site can — cast rather than hand-narrow each queueable shape.
  const { error: ledgerError } = await supabase.from("ledger_entries").upsert(ledgerPayload as never);
  if (ledgerError) throw ledgerError;

  if (_tenantPatch) {
    const { error: tenantError } = await supabase.from("tenants").update(_tenantPatch as never).eq("id", ledgerPayload.tenant_id);
    if (tenantError) throw tenantError;
  }

  return { kind: "ok" };
}

async function replayTenantUpdate(action: QueuedAction): Promise<ReplayResult> {
  const payload = action.payload as { id: string; [k: string]: unknown };
  const conflict = await checkConflict("tenants", payload.id, action.baseUpdatedAt);
  if (conflict) return conflict;
  const { error } = await supabase.from("tenants").update(payload as never).eq("id", payload.id);
  if (error) throw error;
  return { kind: "ok" };
}

/** Rooms are keyed by (property_id, number), not id — RoomRecord/RoomsContext never loads a
 * room's row id, only its display number, so this mirrors lib/rooms.ts's own update calls. */
async function replayRoomUpdate(action: QueuedAction): Promise<ReplayResult> {
  const payload = action.payload as { property_id: string; number: string; override: string | null };
  const { error } = await supabase
    .from("rooms")
    .update({ override: payload.override } as never)
    .eq("property_id", payload.property_id)
    .eq("number", payload.number);
  if (error) throw error;
  return { kind: "ok" };
}

async function replayRowUpdate(
  action: QueuedAction,
  table: "rooms" | "maintenance_reports"
): Promise<ReplayResult> {
  const payload = action.payload as { id: string; [k: string]: unknown };
  const conflict = await checkConflict(table, payload.id, action.baseUpdatedAt);
  if (conflict) return conflict;
  const { error } = await supabase.from(table).update(payload as never).eq("id", payload.id);
  if (error) throw error;
  return { kind: "ok" };
}

/**
 * NOTE: none of tenants/rooms/maintenance_reports currently have an `updated_at` column in the
 * schema (only `created_at`), so this check is a no-op until that column + a trigger to
 * maintain it are added server-side. It's wired up now so conflict detection activates as soon
 * as the column exists, but today `baseUpdatedAt` will be null and every write goes straight
 * through — silent-overwrite risk for concurrent edits until that migration lands.
 */
async function checkConflict(
  table: "tenants" | "rooms" | "maintenance_reports",
  id: string,
  baseUpdatedAt: string | null
): Promise<{ kind: "conflict"; server: Record<string, unknown> } | null> {
  if (!baseUpdatedAt) return null;
  const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  const serverUpdatedAt = (data as Record<string, unknown> | null)?.updated_at as string | undefined;
  if (data && serverUpdatedAt && serverUpdatedAt !== baseUpdatedAt) {
    return { kind: "conflict", server: data as Record<string, unknown> };
  }
  return null;
}

export async function resolveConflict(
  actionId: string,
  resolution: "keep_local" | "keep_server" | { merged: Record<string, unknown> }
): Promise<void> {
  const action = await db.mutationQueue.get(actionId);
  if (!action) return;
  if (resolution === "keep_server") {
    await db.mutationQueue.update(actionId, { status: "synced" });
    notify();
    return;
  }
  const payload = resolution === "keep_local" ? action.payload : resolution.merged;
  await db.mutationQueue.update(actionId, {
    status: "pending",
    payload,
    baseUpdatedAt: null, // resolved manually — next replay applies without re-checking
    conflict: undefined,
  });
  notify();
  void trySync();
}

// --- Connectivity wiring --------------------------------------------------------------------

window.addEventListener("online", () => void trySync());

// Background Sync API: lets the service worker replay the queue even if the tab isn't open
// when connectivity returns. Unsupported browsers (Safari) just fall back to the "online"
// listener above, which fires once the tab is foregrounded again.
navigator.serviceWorker?.ready
  .then((reg) => {
    const syncManager = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    return syncManager?.register("instay-mutation-queue");
  })
  .catch(() => {});
