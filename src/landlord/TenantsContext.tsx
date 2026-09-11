import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import { useToast } from "./ToastContext";
import { supabase } from "../lib/supabaseClient";
import {
  listTenants,
  insertTenant,
  updateTenantRow,
  deleteTenantRow,
  addLedgerEntry,
  deleteLedgerEntry as deleteLedgerEntryRow,
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
   * through this path. `paidAt` (YYYY-MM-DD) defaults to today — pass it when the landlord is
   * logging a payment that was actually made on a different day (backdating, paying in advance). */
  logPayment: (id: string, amount: number, label?: string, method?: PaymentMethod, paidAt?: string) => void;
  /** Same as `logPayment` but for several payments against the same tenant at once (e.g. paying
   * two or three months in advance in a single action) — applied as one state update so each
   * later entry's balance math sees the previous ones already settled, instead of separate
   * `logPayment` calls in a loop, which only the first of would actually take effect (see
   * logPayments' comment for why). */
  logPayments: (id: string, payments: { amount: number; label?: string; method?: PaymentMethod; paidAt?: string }[]) => void;
  /** Removes one payment-history record — a correction to the log, not a balance change; see
   * lib/tenants.ts's deleteLedgerEntry for why owedAmount/status are untouched. */
  deleteLedgerEntry: (tenantId: string, entryId: string) => void;
};

const TenantsContext = createContext<TenantsContextValue | null>(null);

export function TenantsProvider({ children }: { children: ReactNode }) {
  const { propertyId, propertyName } = useSettings();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isReady, setIsReady] = useState(false);

  // Mirrors `tenants`, but updated synchronously — plain JS, not React state timing. Several of
  // this file's functions call each other back-to-back inside one caller's event handler (e.g.
  // AddTenant.tsx: addTenant, then updateTenant for a deposit entry, then logPayment for rent, all
  // in one submit). React's useState only runs a functional updater synchronously for the FIRST
  // state update queued in a given tick — a second or third `setTenants(prev => ...)` in that same
  // tick gets queued but its updater doesn't actually run until the next render, so any code that
  // tries to read the computed result right after calling it (to decide whether to fire a Supabase
  // write) sees `undefined` and silently skips that write. commitTenants sidesteps this entirely by
  // computing the next array from this ref (always accurate, no batching involved) instead of from
  // React's `prev`, so a chain of calls in one tick composes correctly regardless of render timing.
  const tenantsRef = useRef<Tenant[]>([]);
  useEffect(() => {
    tenantsRef.current = tenants;
  }, [tenants]);
  function commitTenants(compute: (prev: Tenant[]) => Tenant[]): Tenant[] {
    const next = compute(tenantsRef.current);
    tenantsRef.current = next;
    setTenants(next);
    return next;
  }

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
    commitTenants((prev) => [tenant, ...prev]);
    if (propertyId) {
      void insertTenant(propertyId, tenant.id, t)
        .then(() => showToast(`${t.name || "Tenant"} added`, "success"))
        .catch((e) => {
          console.error("Failed to save tenant", e);
          commitTenants((prev) => prev.filter((x) => x.id !== tenant.id));
          showToast(`Couldn't save ${t.name || "this tenant"} — please try again.`, "error");
        });
    } else {
      // propertyId isn't loaded yet, so this save has nowhere to go — don't let it disappear silently on reload.
      commitTenants((prev) => prev.filter((x) => x.id !== tenant.id));
      showToast(`Couldn't save ${t.name || "this tenant"} — the app is still loading. Please wait a moment and try again.`, "error");
    }
    return tenant;
  };

  const updateTenant = (id: string, patch: Partial<Omit<Tenant, "id">>) => {
    commitTenants((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (!propertyId) return;
    const { ledger, ...rowPatch } = patch;
    // A caller that only passes `ledger` (e.g. AddTenant.tsx logging a security deposit right
    // after creating the tenant — no other tenant field changes) leaves rowPatch genuinely empty.
    // Supabase/PostgREST rejects an UPDATE with no columns to set, so that used to throw and show
    // "Couldn't save that change" even though there was nothing to save on the tenant row itself —
    // only skip the row update, never the ledger insert, when rowPatch has nothing in it.
    const hasRowPatch = Object.keys(rowPatch).length > 0;

    if (!navigator.onLine) {
      // Covers "update tenant/unit records" and "add tenant notes" (notes is just another field
      // here). A `ledger` entry alongside the patch isn't queued — that path is only used for a
      // handful of non-payment call sites and would need its own idempotency handling like
      // logPayment's; it's dropped with a console warning rather than silently lost mid-sync.
      if (ledger && ledger.length > 0) {
        console.warn("Tenant update included a ledger entry while offline — that part was not queued.", { id });
      }
      if (!hasRowPatch) return;
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

    const writes: Promise<void>[] = [];
    if (hasRowPatch) writes.push(updateTenantRow(propertyId, id, rowPatch));
    // Every caller that passes `ledger` here does so to prepend exactly one new row (there's no
    // "replace the whole ledger" call site) — persist that one row the same way logPayment does,
    // instead of silently dropping it like this used to.
    if (ledger && ledger.length > 0) writes.push(addLedgerEntry(id, ledger[0]));
    if (writes.length === 0) return;
    void Promise.all(writes).catch((e) => {
      console.error("Failed to update tenant", e);
      showToast("Couldn't save that change — please try again.", "error");
    });
  };

  const deleteTenant = (id: string) => {
    commitTenants((prev) => prev.filter((t) => t.id !== id));
    void deleteTenantRow(id).catch((e) => {
      console.error("Failed to delete tenant", e);
      showToast("Couldn't delete that tenant — please try again.", "error");
    });
  };

  const moveOutTenant = (
    id: string,
    details: { moveOutDate: string; depositStatus: DepositStatus; depositResolutionNote: string }
  ) => {
    commitTenants((prev) =>
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
    commitTenants((prev) =>
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

  // NOTE: this does everything in one setTenants call, applying every payment against a running
  // local `current` snapshot rather than calling this once per payment. React only synchronously
  // runs a useState functional updater for the *first* update queued in a batch (its "eager state"
  // bailout) — a second setTenants call made before the first has actually re-rendered gets queued
  // without running, so `updated` would still be undefined and its network call would silently
  // never fire. Looping this per-payment used to lose every payment after the first for exactly
  // that reason; batching them into one updater sidesteps it entirely.
  const logPayments = (
    id: string,
    payments: { amount: number; label?: string; method?: PaymentMethod; paidAt?: string }[]
  ) => {
    if (payments.length === 0) return;
    let updated: Tenant | undefined;
    let newEntries: LedgerRow[] = [];
    commitTenants((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        let current = t;
        const createdEntries: LedgerRow[] = [];
        for (const { amount, label, method, paidAt } of payments) {
          // Generated once and reused everywhere (local state, the online insert, the offline
          // queue's idempotency key) so a retried/double-triggered sync can't insert the same
          // payment twice, and so the row can be targeted for deletion right after it's logged.
          const ledgerEntryId = crypto.randomUUID();
          // `paidAt` is a plain YYYY-MM-DD from DatePicker — treat it as local midnight on that
          // day rather than letting `new Date("YYYY-MM-DD")` parse it as UTC, which can land a day off.
          const createdAt = paidAt
            ? (() => {
                const [y, m, d] = paidAt.split("-").map(Number);
                return new Date(y, (m || 1) - 1, d || 1).toISOString();
              })()
            : new Date().toISOString();
          // A logged amount can settle less than what's owed — only clear the balance and flip to
          // "paid" once it covers the full outstanding amount; otherwise the tenant stays "partial"
          // with the remainder still owed, instead of every manual payment wiping the balance to 0.
          const owedBefore = current.owedAmount || current.rentAmount;
          const remaining = Math.max(0, owedBefore - amount);
          const settledInFull = remaining <= 0;
          createdEntries.push({
            id: ledgerEntryId,
            label: label ?? `${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} rent`,
            // `amount` is what was owed for this period, `paidAmount` is what's actually been
            // paid toward it — the same convention every reader (Rent, Dashboard, Accounting, the
            // profile ledger row) uses to show "K400 of K1,000" on a partial entry. A row that
            // settles in full doesn't need paidAmount — readers just use `amount` — but a partial
            // one left without it always read as K0 collected, however much was logged.
            amount: owedBefore,
            paidAmount: settledInFull ? undefined : amount,
            status: settledInFull ? "paid" : "partial",
            createdAt,
            method: method ?? null,
            source: "manual",
          });
          current = {
            ...current,
            status: settledInFull ? "paid" : "partial",
            owedAmount: remaining,
            onTimeCount:
              settledInFull && current.status !== "overdue" && current.status !== "unpaid"
                ? current.onTimeCount + 1
                : current.onTimeCount,
            totalMonthsCount: settledInFull ? current.totalMonthsCount + 1 : current.totalMonthsCount,
          };
        }
        const next: Tenant = { ...current, ledger: [...[...createdEntries].reverse(), ...t.ledger] };
        updated = next;
        newEntries = createdEntries;
        return next;
      })
    );
    if (propertyId && updated) {
      const tenantPatch = {
        status: updated.status,
        owedAmount: updated.owedAmount,
        onTimeCount: updated.onTimeCount,
        totalMonthsCount: updated.totalMonthsCount,
      };

      if (!navigator.onLine) {
        // sync.ts writes this patch straight to the `tenants` table, so it needs the DB's
        // snake_case column names rather than the Tenant view model's camelCase ones. The combined
        // tenant patch only needs to ride along with one of the entries — sync.ts applies it once
        // per action, so attaching it to every entry would just repeat the same (idempotent) patch.
        const tenantRowPatch = {
          status: updated.status,
          owed_amount: updated.owedAmount,
          on_time_count: updated.onTimeCount,
          total_months_count: updated.totalMonthsCount,
        };
        newEntries.forEach((entry, i) => {
          void enqueueAction({
            id: entry.id,
            type: "record_payment",
            propertyId,
            payload: {
              id: entry.id,
              tenant_id: id,
              label: entry.label,
              amount: entry.amount,
              paid_amount: entry.paidAmount ?? null,
              status: entry.status ?? null,
              method: entry.method ?? null,
              source: entry.source,
              created_at: entry.createdAt,
              _tenantPatch: i === newEntries.length - 1 ? tenantRowPatch : undefined,
            },
            baseUpdatedAt: null,
            priority: ACTION_PRIORITY.record_payment,
          });
        });
        showToast(
          newEntries.length > 1 ? "Payments saved — will sync when you're back online" : "Payment saved — will sync when you're back online",
          "info"
        );
        return;
      }

      void Promise.all([updateTenantRow(propertyId, id, tenantPatch), ...newEntries.map((entry) => addLedgerEntry(id, entry))])
        .then(() => showToast(newEntries.length > 1 ? "Payments logged" : "Payment logged", "success"))
        .catch((e) => {
          console.error("Failed to log payment", e);
          showToast("Couldn't log that payment — please try again.", "error");
        });
    }
  };

  const logPayment = (id: string, amount: number, label?: string, method?: PaymentMethod, paidAt?: string) =>
    logPayments(id, [{ amount, label, method, paidAt }]);

  // Deleting a payment-history row is a record correction, not a balance change — owedAmount,
  // status, and the on-time/total month counts stay exactly as they are (see the comment on
  // lib/tenants.ts's deleteLedgerEntry). Only supported online: this one skips the offline queue
  // rather than risk a delete racing a not-yet-synced payment insert for the same row.
  const deleteLedgerEntry = (tenantId: string, entryId: string) => {
    if (!navigator.onLine) {
      showToast("Reconnect to delete this entry.", "info");
      return;
    }
    commitTenants((prev) =>
      prev.map((t) => (t.id === tenantId ? { ...t, ledger: t.ledger.filter((row) => row.id !== entryId) } : t))
    );
    void deleteLedgerEntryRow(entryId).catch((e) => {
      console.error("Failed to delete ledger entry", e);
      showToast("Couldn't delete that entry — please try again.", "error");
    });
  };

  return (
    <TenantsContext.Provider
      value={{ tenants, isReady, addTenant, updateTenant, deleteTenant, moveOutTenant, reactivateTenant, logPayment, logPayments, deleteLedgerEntry }}
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
