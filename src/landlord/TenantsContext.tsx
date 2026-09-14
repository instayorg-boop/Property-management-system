import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import { useToast } from "./ToastContext";
import { supabase } from "../lib/supabaseClient";
import {
  listTenants,
  insertTenant,
  generatePortalToken,
  updateTenantRow,
  deleteTenantRow,
  addLedgerEntry,
  addLedgerEvent,
  type NewLedgerEventInsert,
  syncTenantBalanceIfNewModel,
  needsBalanceFallbackWrite,
  round2,
  voidLedgerEntry as voidLedgerEntryRow,
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
import { calcPenalty, calcTotalOwed } from "./invoiceUtils";

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
  /** Marks one ledger record voided (never deletes it) — a correction to the log, not a balance
   * change; see lib/tenants.ts's voidLedgerEntry for why owedAmount/status are untouched, and why
   * this is safe for both legacy and new-model rows. Deliberately does NOT optimistically remove
   * the row from local state before the write succeeds — the caller should treat this as pending
   * until it resolves, and show an error (leaving the row as-is) if it rejects. Resolves once the
   * server confirms the void; the tenant's ledger then updates via the existing realtime
   * subscription on `ledger_entries`, not via any local mutation here. */
  voidLedgerEntry: (tenantId: string, entryId: string, reason: string) => Promise<void>;
  /** An ad-hoc charge (amount > 0, e.g. a damage fine) or credit/waiver (amount < 0) — a balance
   * change that isn't a rent payment being settled. `label` is the full display text to log. */
  addAdjustment: (tenantId: string, input: { amount: number; label: string }) => void;
  /** Clears the live accrued late penalty (resets daysOverdue) and logs an audit-only ledger row
   * explaining why — doesn't touch owedAmount, since the penalty was never part of it. */
  waivePenalty: (tenantId: string, reason: string) => void;
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
    const tenant: Tenant = { ...t, id: crypto.randomUUID(), portalToken: t.portalToken ?? generatePortalToken() };
    commitTenants((prev) => [tenant, ...prev]);
    if (propertyId) {
      void insertTenant(propertyId, tenant.id, tenant)
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
    let newEvents: NewLedgerEventInsert[] = [];
    commitTenants((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        let current = t;
        const createdEvents: NewLedgerEventInsert[] = [];
        for (const { amount, label, method, paidAt } of payments) {
          // Generated once and reused everywhere (local state, the online insert, the offline
          // queue's idempotency key) so a retried/double-triggered sync can't insert the same
          // payment twice, and so the row can be targeted for deletion right after it's logged.
          const ledgerEntryId = crypto.randomUUID();
          // `paidAt` is a plain YYYY-MM-DD from DatePicker, which always has a value (defaults to
          // today) — so this used to collapse EVERY manual payment to local midnight on its date,
          // never the actual time it was logged. That's correct for a genuinely backdated payment
          // (sorts under that past day), but for today's date it meant a payment logged at 2pm got
          // timestamped earlier than a charge/credit added at, say, 10am the same day (those use
          // the real current time), making same-day entries sort in the wrong order relative to
          // each other. Only collapse to midnight when the date is actually in the past.
          const todayStr = new Date().toISOString().slice(0, 10);
          const createdAt = paidAt && paidAt !== todayStr
            ? (() => {
                const [y, m, d] = paidAt.split("-").map(Number);
                return new Date(y, (m || 1) - 1, d || 1).toISOString();
              })()
            : new Date().toISOString();
          // A logged amount can settle less than what's owed — only clear the balance and flip to
          // "paid" once it covers the full outstanding amount; otherwise the tenant stays "partial"
          // with the remainder still owed, instead of every manual payment wiping the balance to 0.
          // `calcTotalOwed` (not the raw `owedAmount` field) so a payment that includes the live
          // late penalty is recorded at what was actually owed, not silently short by the penalty
          // portion. The `> 0` check is deliberate, not `||` — `owedAmount` is a real monetary
          // value where 0 is a legitimate balance, not a signal to fall back to `rentAmount`; `||`
          // on a number is exactly the class of bug that produced this (a merely-just-settled
          // tenant read as "no obligation tracked" and got re-charged a fresh month's rent).
          const totalOwed = calcTotalOwed(current);
          const owedBefore = totalOwed > 0 ? totalOwed : current.rentAmount;
          const remaining = Math.max(0, owedBefore - amount);
          const settledInFull = remaining <= 0;
          const label_ = label ?? `${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} rent`;

          // Phase 3D charge matching: prefer the tenant's own open (not yet fully paid) rent
          // charge for THIS calendar billing period — the shape Phase 3B's generator produces
          // (event_type='charge', billingPeriodId='YYYY-MM'). `current.ledger` is already the
          // Phase 3C *projected* view, so a charge row's `id` here is the real ledger_entries id
          // to link against, and `status` already reflects any prior payments against it. There's
          // deliberately no search across other periods or any allocation-splitting — a payment
          // that doesn't match this period's open charge (none generated yet, already settled, or
          // this is an advance/backdated payment for a different period) becomes a standalone
          // event instead of guessing at a historical charge to attach it to.
          const now = new Date();
          const currentBillingPeriodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          const openCharge = current.ledger.find(
            (row) => row.eventType === "charge" && row.billingPeriodId === currentBillingPeriodId && row.status !== "paid"
          );

          const rawEvent: NewLedgerEventInsert = {
            id: ledgerEntryId,
            tenantId: id,
            label: label_,
            // The actual amount paid, negative — never the legacy "amount owed" convention.
            amount: -amount,
            eventType: "payment",
            affectsBalance: true,
            origin: "landlord_manual",
            source: "manual",
            chargeId: openCharge ? openCharge.id : null,
            // Deterministic function of this operation's own id — stable across a retried
            // offline replay of the exact same queued action, unique per real payment.
            idempotencyKey: `manual_payment:${ledgerEntryId}`,
            method: method ?? null,
            createdAt,
          };
          createdEvents.push(rawEvent);

          // Optimistic local projection update — current.ledger already holds Phase 3C-projected
          // rows, so a payment linked to an open charge updates THAT row in place (matching
          // projectLedgerRows' own remaining/paidAmount math) rather than appending a second,
          // independent row for the same charge. An unlinked payment appends its own standalone
          // row, exactly the shape projectStandaloneRow would produce for it server-side.
          const nextLedger: LedgerRow[] = openCharge
            ? current.ledger.map((row) => {
                if (row.id !== openCharge.id) return row;
                const priorPaid = row.status === "paid" ? row.amount : row.paidAmount ?? 0;
                const newPaidTotal = priorPaid + amount;
                const remainingOnCharge = Math.max(0, row.amount - newPaidTotal);
                const newStatus: PaymentStatus = remainingOnCharge <= 0 ? "paid" : newPaidTotal > 0 ? "partial" : "unpaid";
                // Matches projectLedgerRows' own round2() on its equivalent paidAmount — without
                // it, a payment amount with fractional cents could leave the optimistic UI
                // showing floating-point noise (e.g. 733.0000000000001) until the next refetch.
                return { ...row, paidAmount: newStatus === "partial" ? round2(newPaidTotal) : undefined, status: newStatus };
              })
            : [
                {
                  id: ledgerEntryId,
                  label: label_,
                  amount,
                  paidAmount: amount,
                  status: "paid",
                  createdAt,
                  method: method ?? null,
                  source: "manual",
                  eventType: "payment",
                  chargeId: null,
                  affectsBalance: true,
                  origin: "landlord_manual",
                } satisfies LedgerRow,
                ...current.ledger,
              ];

          current = {
            ...current,
            ledger: nextLedger,
            status: settledInFull ? "paid" : "partial",
            owedAmount: remaining,
            // Matches reconcileCollection.ts's automatic-payment path, which already resets this
            // on full settlement — the manual path previously left it untouched, so a tenant who
            // paid off their balance by hand kept their old daysOverdue lingering, ready to
            // resurface a stale penalty the moment status left "paid" next cycle.
            daysOverdue: settledInFull ? 0 : current.daysOverdue,
            onTimeCount:
              settledInFull && current.status !== "overdue" && current.status !== "unpaid"
                ? current.onTimeCount + 1
                : current.onTimeCount,
            totalMonthsCount: settledInFull ? current.totalMonthsCount + 1 : current.totalMonthsCount,
          };
        }
        updated = current;
        newEvents = createdEvents;
        return current;
      })
    );
    if (propertyId && updated) {
      const tenantPatch = {
        status: updated.status,
        owedAmount: updated.owedAmount,
        daysOverdue: updated.daysOverdue,
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
          days_overdue: updated.daysOverdue ?? null,
          on_time_count: updated.onTimeCount,
          total_months_count: updated.totalMonthsCount,
        };
        newEvents.forEach((event, i) => {
          void enqueueAction({
            id: event.id,
            type: "record_payment",
            propertyId,
            payload: {
              id: event.id,
              tenant_id: event.tenantId,
              label: event.label,
              amount: event.amount,
              event_type: event.eventType,
              affects_balance: event.affectsBalance,
              origin: event.origin,
              source: event.source,
              charge_id: event.chargeId,
              idempotency_key: event.idempotencyKey,
              method: event.method ?? null,
              created_at: event.createdAt,
              _tenantPatch: i === newEvents.length - 1 ? tenantRowPatch : undefined,
            },
            baseUpdatedAt: null,
            priority: ACTION_PRIORITY.record_payment,
          });
        });
        showToast(
          newEvents.length > 1 ? "Payments saved — will sync when you're back online" : "Payment saved — will sync when you're back online",
          "info"
        );
        return;
      }

      // Phase 3E: the event(s) must land before syncing — sync recomputes from whatever's
      // already durably written, so calling it first (or racing it against the insert) would
      // read a stale state. A failed insert here must never reach the sync call at all — it
      // throws straight into the catch below.
      void (async () => {
        try {
          await Promise.all(newEvents.map((event) => addLedgerEvent(event)));

          // Authoritative for a new-model-only tenant (writes owed_amount/status/days_overdue
          // itself); a no-op for anyone with legacy history. Only fall back to the old
          // manually-computed tenantPatch write when sync did NOT do it — never both, so there's
          // never two competing balance calculations landing for the same tenant.
          let syncResult: { synchronized: boolean } | null = null;
          try {
            syncResult = await syncTenantBalanceIfNewModel(id);
          } catch (e) {
            console.error("Failed to sync tenant balance after payment", e);
          }
          if (needsBalanceFallbackWrite(syncResult)) {
            await updateTenantRow(propertyId, id, tenantPatch);
          }

          showToast(newEvents.length > 1 ? "Payments logged" : "Payment logged", "success");
        } catch (e) {
          console.error("Failed to log payment", e);
          showToast("Couldn't log that payment — please try again.", "error");
        }
      })();
    }
  };

  const logPayment = (id: string, amount: number, label?: string, method?: PaymentMethod, paidAt?: string) =>
    logPayments(id, [{ amount, label, method, paidAt }]);

  // Voiding a ledger row is a record correction, not a balance change — owedAmount, status, and
  // the on-time/total month counts stay exactly as they are (see the comment on lib/tenants.ts's
  // voidLedgerEntry). Only supported online: this one skips the offline queue rather than risk a
  // void racing a not-yet-synced payment insert for the same row.
  // A manually-applied balance change that isn't a payment being settled — an ad-hoc charge
  // (amount > 0, e.g. a damage fine) or a credit/waiver (amount < 0, e.g. a goodwill discount).
  // `label` is the full display text the caller already composed (including any reason folded in,
  // the same convention LogPaymentModal uses for its note field) — this doesn't add its own.
  // Clamped so owedAmount can never go negative: there's no "tenant is in credit" concept anywhere
  // else in this data model, so a credit larger than what's currently owed just zeroes it out
  // rather than carrying the remainder forward.
  const addAdjustment = (id: string, input: { amount: number; label: string }) => {
    if (!navigator.onLine) {
      showToast("Reconnect to add a charge or credit.", "info");
      return;
    }
    let updated: Tenant | undefined;
    let newEntry: LedgerRow | undefined;
    commitTenants((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const nextOwed = Math.max(0, t.owedAmount + input.amount);
        const nextStatus: PaymentStatus = nextOwed === 0 ? "paid" : t.status === "paid" ? "unpaid" : t.status;
        const entry: LedgerRow = {
          id: crypto.randomUUID(),
          label: input.label,
          amount: input.amount,
          source: "adjustment",
          createdAt: new Date().toISOString(),
        };
        const next: Tenant = { ...t, owedAmount: nextOwed, status: nextStatus, ledger: [entry, ...t.ledger] };
        updated = next;
        newEntry = entry;
        return next;
      })
    );
    if (propertyId && updated && newEntry) {
      void Promise.all([
        updateTenantRow(propertyId, id, { status: updated.status, owedAmount: updated.owedAmount }),
        addLedgerEntry(id, newEntry),
      ])
        .then(() => showToast(input.amount >= 0 ? "Charge added" : "Credit applied", "success"))
        .catch((e) => {
          console.error("Failed to add adjustment", e);
          showToast("Couldn't save that change — please try again.", "error");
        });
    }
  };

  // The late penalty isn't stored anywhere — calcPenalty derives it live from daysOverdue every
  // time (see invoiceUtils.ts) — so "waiving" it doesn't touch owedAmount at all; it just resets
  // daysOverdue so the live formula stops accruing it, plus an audit-only ledger row explaining
  // where the K-amount that used to show up went, so it isn't just silently gone from history.
  const waivePenalty = (id: string, reason: string) => {
    if (!navigator.onLine) {
      showToast("Reconnect to waive a penalty.", "info");
      return;
    }
    let updated: Tenant | undefined;
    let newEntry: LedgerRow | undefined;
    commitTenants((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const penalty = calcPenalty(t);
        if (penalty <= 0) return t;
        const entry: LedgerRow = {
          id: crypto.randomUUID(),
          label: `Late penalty waived (${t.daysOverdue}d${reason ? `, ${reason}` : ""})`,
          amount: -penalty,
          source: "adjustment",
          createdAt: new Date().toISOString(),
        };
        // 0, not undefined — tenantPatchToRow only writes daysOverdue to the DB when it's
        // !== undefined, so undefined here would silently no-op instead of actually clearing it.
        const next: Tenant = { ...t, daysOverdue: 0, ledger: [entry, ...t.ledger] };
        updated = next;
        newEntry = entry;
        return next;
      })
    );
    if (propertyId && updated && newEntry) {
      void Promise.all([updateTenantRow(propertyId, id, { daysOverdue: 0 }), addLedgerEntry(id, newEntry)])
        .then(() => showToast("Late penalty waived", "success"))
        .catch((e) => {
          console.error("Failed to waive penalty", e);
          showToast("Couldn't save that change — please try again.", "error");
        });
    }
  };

  // Deliberately no optimistic local mutation — the row must stay visible, unchanged, until the
  // server confirms the void, and stay visible if it fails. The existing realtime subscription on
  // `ledger_entries` (see the effect above) already refetches and re-projects on any change to
  // that table, so a successful void reaches the UI without this function touching local state
  // itself. Callers should await this and handle a rejection (show an error, keep the row as-is).
  const voidLedgerEntry = async (_tenantId: string, entryId: string, reason: string): Promise<void> => {
    if (!navigator.onLine) {
      showToast("Reconnect to void this entry.", "info");
      throw new Error("offline");
    }
    try {
      await voidLedgerEntryRow(entryId, reason);
    } catch (e) {
      console.error("Failed to void ledger entry", e);
      // A VoidRefusedError (e.g. the charge-void guard) has a specific, user-facing explanation —
      // show that instead of the generic fallback so the landlord knows *why* it was refused. A
      // rejected void never reaches the sync call below — nothing changed, so there's nothing to
      // resync.
      showToast(e instanceof Error ? e.message : "Couldn't void that entry — please try again.", "error");
      throw e;
    }
    // The void succeeded — sync this tenant's authoritative balance (a no-op for legacy/mixed
    // tenants, matching voidLedgerEntry's own long-standing design of never touching their
    // balance). A sync failure here doesn't undo the void or fail this call — the void itself
    // already committed, so surfacing it as a void error would be misleading; log and move on.
    try {
      await syncTenantBalanceIfNewModel(_tenantId);
    } catch (e) {
      console.error("Failed to sync tenant balance after void", e);
    }
  };

  return (
    <TenantsContext.Provider
      value={{
        tenants,
        isReady,
        addTenant,
        updateTenant,
        deleteTenant,
        moveOutTenant,
        reactivateTenant,
        logPayment,
        logPayments,
        voidLedgerEntry,
        addAdjustment,
        waivePenalty,
      }}
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
