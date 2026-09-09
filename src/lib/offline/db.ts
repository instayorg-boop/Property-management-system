import Dexie, { type Table } from "dexie";
import type { Database } from "../database.types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

// Mirrors the Supabase tables that dashboard pages read while offline. Each row is the last
// known server copy — writes go through `mutationQueue`, not directly into these tables, so a
// cached row is always "what the server had as of last sync" rather than a pending edit.
export type CachedTenant = Row<"tenants">;
export type CachedLedgerEntry = Row<"ledger_entries">;
export type CachedRoom = Row<"rooms">;
export type CachedExpense = Row<"expenses">;
export type CachedInvoice = Row<"invoices">;
export type CachedMaintenanceReport = Row<"maintenance_reports">;

/** One row per cached table, tracking when it was last pulled from Supabase. */
export type SyncMeta = {
  table: string;
  lastSyncedAt: string;
  propertyId: string;
};

export type QueuedActionType =
  | "record_payment"
  | "add_tenant_note"
  | "update_tenant"
  | "update_room"
  | "update_maintenance_report";

export type QueuedActionStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "needs_review"
  | "conflict"
  | "failed";

/** One offline-originated write, replayed against Supabase on reconnect. */
export type QueuedAction = {
  /** Client-generated UUID, also sent to the server as the idempotency key. */
  id: string;
  type: QueuedActionType;
  propertyId: string;
  /** Free-form payload for `type` — shape is owned by the handler in offline/mutations.ts. */
  payload: Record<string, unknown>;
  /** `updated_at` (or equivalent) of the record this action was based on, for conflict detection. */
  baseUpdatedAt: string | null;
  createdAt: string;
  status: QueuedActionStatus;
  /** Sync priority — lower runs first. Payments sync before other edits. */
  priority: number;
  error?: string;
  /** Present once status is "conflict": the two versions for the manager to resolve. */
  conflict?: { local: Record<string, unknown>; server: Record<string, unknown> };
};

class OfflineDb extends Dexie {
  tenants!: Table<CachedTenant, string>;
  ledgerEntries!: Table<CachedLedgerEntry, string>;
  rooms!: Table<CachedRoom, string>;
  expenses!: Table<CachedExpense, string>;
  invoices!: Table<CachedInvoice, string>;
  maintenanceReports!: Table<CachedMaintenanceReport, string>;
  syncMeta!: Table<SyncMeta, string>;
  mutationQueue!: Table<QueuedAction, string>;
  /**
   * Whole-list read caches, keyed by `${viewKey}:${propertyId}`. The dashboard's contexts
   * (TenantsContext, InvoicesContext, ...) fetch through `lib/*.ts` functions that already map
   * raw Supabase rows into view models (Tenant, Invoice, ...) — caching that mapped output here
   * is what lets a context render instantly from cache without duplicating its mapping logic.
   * The granular per-table stores above exist separately for the write-queue's conflict checks,
   * which need real row shapes with `updated_at`, not view models.
   */
  cachedViews!: Table<{ key: string; propertyId: string; data: unknown; syncedAt: string }, string>;

  constructor() {
    super("instay-offline");
    this.version(1).stores({
      tenants: "id, property_id, room_id, status",
      ledgerEntries: "id, tenant_id, period",
      rooms: "id, property_id, room_type_id",
      expenses: "id, property_id, category_id, date",
      invoices: "id, property_id, tenant_id, status",
      maintenanceReports: "id, property_id, status, submitted_at",
      syncMeta: "table",
      mutationQueue: "id, status, priority, createdAt, type",
      cachedViews: "key, propertyId",
    });
  }
}

export const db = new OfflineDb();

export const ACTION_PRIORITY: Record<QueuedActionType, number> = {
  record_payment: 0,
  add_tenant_note: 1,
  update_tenant: 1,
  update_room: 1,
  update_maintenance_report: 1,
};
