import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import { useToast } from "./ToastContext";
import { supabase } from "../lib/supabaseClient";
import {
  listTenants,
  insertTenant,
  updateTenantRow,
  deleteTenantRow,
  addLedgerEntry,
  tenantPatchToRow,
  relationLabel,
  RELATION_OPTIONS,
  type Tenant,
  type PaymentStatus,
  type DepositStatus,
  type DepositMethod,
  type LedgerRow,
  type PaymentMethod,
  type EmergencyContact,
  type RelationType,
} from "../lib/tenants";
import { readCachedView, writeCachedView } from "../lib/offline/cachedView";
import { enqueueAction } from "../lib/offline/sync";
import { ACTION_PRIORITY } from "../lib/offline/db";

const TENANTS_VIEW_KEY = "tenants";

// --- Types -------------------------------------------------------------------

export type { Tenant, PaymentStatus, DepositStatus, DepositMethod, LedgerRow, PaymentMethod, EmergencyContact, RelationType };
export { relationLabel, RELATION_OPTIONS };
/** The room type's name, e.g. "Single" — an open string since landlords can add their own room types on the Rooms page. */
export type RoomType = string;
export type DepositRefundability = "Refundable" | "Non-refundable" | "Partially refundable";

export function formatCurrency(n: number) {
  return `K${Math.round(n).toLocaleString("en-US")}`;
}

// --- Context -------------------------------------------------------------------

type TenantsContextValue = {
  tenants: Tenant[];
  /** False until the initial Supabase fetch resolves — pages use this to show skeletons instead of an empty state. */
  isReady: boolean;
  addTenant: (t: Omit<Tenant, "id">) => Tenant;
  updateTenant: (id: string, patch: Partial<Omit<Tenant, "id">>) => void;
  deleteTenant: (id: string) => void;
  moveOutTenant: (id: string, details: { moveOutDate: string; depositStatus: DepositStatus; depositResolutionNote: string }) => void;
  reactivateTenant: (id: string, newMoveInDate: string) => void;
  /** `label` defaults to the standard rent-row label when omitted — pass one explicitly for
   * anything that isn't a plain full-month rent payment (e.g. a pro-rata partial month). `method`
   * records how the landlord says this was paid (cash/mobile money/etc, from LogPaymentModal) —
   * real mobile-money payments via the tenant portal are tagged separately by lenco-webhook, never
   * through this path. */
  logPayment: (id: string, amount: number, label?: string, method?: PaymentMethod) => void;
};

const TenantsContext = createContext<TenantsContextValue | null>(null);

export function TenantsProvider({ children }: { children: ReactNode }) {
  const { propertyId, propertyName } = useSettings();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;

    // Render whatever we cached from the last successful sync immediately — before any network
    // round trip — so the tenant list isn't blank while offline or on a slow connection.
    readCachedView<Tenant>(TENANTS_VIEW_KEY, propertyId).then((cached) => {
      if (!cancelled && cached) {
        setTenants(cached);
        setIsReady(true);
      }
    });

    (async () => {
      try {
        const rows = await listTenants(propertyId, propertyName);
        if (!cancelled) {
          setTenants(rows);
          setIsReady(true);
        }
        void writeCachedView(TENANTS_VIEW_KEY, propertyId, rows);
      } catch (e) {
        // Offline (or the request failed) and nothing was cached to fall back to — surface the
        // empty/loading state as-is rather than throwing; the cached-view read above already
        // rendered whatever we had.
        if (!cancelled && !navigator.onLine) setIsReady(true);
        else console.error("Failed to load tenants", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // propertyName intentionally excluded: it can change via Settings without needing a full tenant refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Live updates — a payment landing via lenco-webhook (or any change from another device/tab)
  // shows up on the Rent page, Dashboard, and tenant profile without a manual refresh. Refetches
  // the whole list on any event rather than patching in place, reusing listTenants' existing
  // mapping logic; cheap enough at the scale of one property's tenant roster.
  //
  // ledger_entries has no property_id column to filter by (only tenant_id) — subscribed
  // unfiltered, but RLS still scopes which rows this session actually receives, so this can't see
  // another landlord's payments land.
  useEffect(() => {
    if (!propertyId) return;
    const refetch = () => {
      void listTenants(propertyId, propertyName)
        .then((rows) => {
          setTenants(rows);
          void writeCachedView(TENANTS_VIEW_KEY, propertyId, rows);
        })
        .catch((e) => console.error("Failed to refresh tenants after a live update", e));
    };
    const channel = supabase
      .channel(`tenants-ledger:${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants", filter: `property_id=eq.${propertyId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries" }, refetch)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const addTenant = (t: Omit<Tenant, "id">): Tenant => {
    const tenant: Tenant = { ...t, id: crypto.randomUUID() };
    setTenants((prev) => [tenant, ...prev]);
    if (propertyId) {
      void insertTenant(propertyId, tenant.id, t)
        .then(() => showToast(`${t.name || "Tenant"} added`, "success"))
        .catch((e) => {
          console.error("Failed to save tenant", e);
          setTenants((prev) => prev.filter((x) => x.id !== tenant.id));
          showToast(`Couldn't save ${t.name || "this tenant"} — please try again.`, "error");
        });
    } else {
      // propertyId isn't loaded yet, so this save has nowhere to go — don't let it disappear silently on reload.
      setTenants((prev) => prev.filter((x) => x.id !== tenant.id));
      showToast(`Couldn't save ${t.name || "this tenant"} — the app is still loading. Please wait a moment and try again.`, "error");
    }
    return tenant;
  };

  const updateTenant = (id: string, patch: Partial<Omit<Tenant, "id">>) => {
    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (!propertyId) return;
    const { ledger, ...rowPatch } = patch;

    if (!navigator.onLine) {
      // Covers "update tenant/unit records" and "add tenant notes" (notes is just another field
      // here). A `ledger` entry alongside the patch isn't queued — that path is only used for a
      // handful of non-payment call sites and would need its own idempotency handling like
      // logPayment's; it's dropped with a console warning rather than silently lost mid-sync.
      if (ledger && ledger.length > 0) {
        console.warn("Tenant update included a ledger entry while offline — that part was not queued.", { id });
      }
      void tenantPatchToRow(propertyId, rowPatch).then((row) =>
        enqueueAction({
          id: crypto.randomUUID(),
          type: "update_tenant",
          propertyId,
          payload: { id, ...row },
          baseUpdatedAt: null,
          priority: ACTION_PRIORITY.update_tenant,
        })
      );
      return;
    }

    const writes: Promise<void>[] = [updateTenantRow(propertyId, id, rowPatch)];
    // Every caller that passes `ledger` here does so to prepend exactly one new row (there's no
    // "replace the whole ledger" call site) — persist that one row the same way logPayment does,
    // instead of silently dropping it like this used to.
    if (ledger && ledger.length > 0) writes.push(addLedgerEntry(id, ledger[0]));
    void Promise.all(writes).catch((e) => {
      console.error("Failed to update tenant", e);
      showToast("Couldn't save that change — please try again.", "error");
    });
  };

  const deleteTenant = (id: string) => {
    setTenants((prev) => prev.filter((t) => t.id !== id));
    void deleteTenantRow(id).catch((e) => {
      console.error("Failed to delete tenant", e);
      showToast("Couldn't delete that tenant — please try again.", "error");
    });
  };

  const moveOutTenant = (
    id: string,
    details: { moveOutDate: string; depositStatus: DepositStatus; depositResolutionNote: string }
  ) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, active: false, ...details } : t))
    );
    // The Rooms page derives occupancy from active tenants' `room` field (see RoomsContext's
    // useRoomsView), so setting active: false here is what actually frees the room up there too.
    if (propertyId)
      void updateTenantRow(propertyId, id, { active: false, ...details }).catch((e) => {
        console.error("Failed to move out tenant", e);
        showToast("Couldn't save the move-out — please try again.", "error");
      });
  };

  const reactivateTenant = (id: string, newMoveInDate: string) => {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, active: true, moveInDate: newMoveInDate, moveOutDate: undefined, depositResolutionNote: undefined }
          : t
      )
    );
    if (propertyId)
      void updateTenantRow(propertyId, id, {
        active: true,
        moveInDate: newMoveInDate,
        moveOutDate: undefined,
        depositResolutionNote: undefined,
      }).catch((e) => {
        console.error("Failed to reactivate tenant", e);
        showToast("Couldn't reactivate that tenant — please try again.", "error");
      });
  };

  const logPayment = (id: string, amount: number, label?: string, method?: PaymentMethod) => {
    let updated: Tenant | undefined;
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next: Tenant = {
          ...t,
          status: "paid",
          owedAmount: 0,
          onTimeCount: t.status === "overdue" || t.status === "unpaid" ? t.onTimeCount : t.onTimeCount + 1,
          totalMonthsCount: t.totalMonthsCount + 1,
          ledger: [
            {
              label: label ?? `${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} rent`,
              amount,
              status: "paid",
              createdAt: new Date().toISOString(),
              method: method ?? null,
            },
            ...t.ledger,
          ],
        };
        updated = next;
        return next;
      })
    );
    if (propertyId && updated) {
      const newEntry = updated.ledger[0];
      const tenantPatch = {
        status: "paid" as const,
        owedAmount: 0,
        onTimeCount: updated.onTimeCount,
        totalMonthsCount: updated.totalMonthsCount,
      };

      if (!navigator.onLine) {
        // sync.ts writes this patch straight to the `tenants` table, so it needs the DB's
        // snake_case column names rather than the Tenant view model's camelCase ones.
        const tenantRowPatch = {
          status: "paid",
          owed_amount: 0,
          on_time_count: updated.onTimeCount,
          total_months_count: updated.totalMonthsCount,
        };
        // Queue instead of writing directly. The ledger row's id is generated here (rather than
        // left to the DB default) and reused as the queue action's idempotency key, so a retried
        // or double-triggered sync can't insert the same payment twice.
        const ledgerEntryId = crypto.randomUUID();
        void enqueueAction({
          id: ledgerEntryId,
          type: "record_payment",
          propertyId,
          payload: {
            id: ledgerEntryId,
            tenant_id: id,
            label: newEntry.label,
            amount: newEntry.amount,
            paid_amount: newEntry.paidAmount ?? null,
            status: newEntry.status ?? null,
            method: newEntry.method ?? null,
            _tenantPatch: tenantRowPatch,
          },
          baseUpdatedAt: null,
          priority: ACTION_PRIORITY.record_payment,
        });
        showToast("Payment saved — will sync when you're back online", "info");
        return;
      }

      void Promise.all([
        updateTenantRow(propertyId, id, tenantPatch),
        addLedgerEntry(id, newEntry),
      ])
        .then(() => showToast("Payment logged", "success"))
        .catch((e) => {
          console.error("Failed to log payment", e);
          showToast("Couldn't log that payment — please try again.", "error");
        });
    }
  };

  return (
    <TenantsContext.Provider
      value={{ tenants, isReady, addTenant, updateTenant, deleteTenant, moveOutTenant, reactivateTenant, logPayment }}
    >
      {children}
    </TenantsContext.Provider>
  );
}

export function useTenants() {
  const ctx = useContext(TenantsContext);
  if (!ctx) throw new Error("useTenants must be used within TenantsProvider");
  return ctx;
}

/**
 * Rent actually collected from active tenants right now — paid tenants count their full rent,
 * partial tenants count only what they've actually paid so far. Shared by Rent, Expenses, and the
 * Owner Payout / Income vs Expenses reports so "collected" means the same thing everywhere.
 */
export function useCollectedRent() {
  const { tenants } = useTenants();
  return useMemo(
    () =>
      tenants
        .filter((t) => t.active)
        .reduce((sum, t) => {
          if (t.status === "paid") return sum + t.rentAmount;
          if (t.status === "partial") return sum + (t.ledger[0]?.paidAmount ?? 0);
          return sum;
        }, 0),
    [tenants]
  );
}
