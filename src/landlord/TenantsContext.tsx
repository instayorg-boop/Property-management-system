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
  /** Returns the new tenant immediately (for optimistic UI / its id), plus `saved` — a promise
   * that resolves once the INSERT actually commits. A caller that needs to write anything that
   * depends on this tenant already existing in the DB (a ledger row via `updateTenant`/
   * `logPayment`, which has a `tenant_id` FK) must await `saved` first — those writes and the
   * INSERT above used to fire concurrently with no ordering guarantee, so the dependent write
   * could reach Postgres before the tenant row committed and fail the FK check silently after
   * the caller had already navigated away. */
  addTenant: (t: Omit<Tenant, "id">) => Tenant & { saved: Promise<void> };
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
    // One logical action (log payment, add adjustment, void) writes to `ledger_entries` and then
    // `tenants` as separate sequential statements — each lands its own postgres_changes event, so
    // an unguarded refetch here fires 2-3 near-simultaneous full-list refetches per action, each
    // replacing the whole array and re-rendering everything reading useTenants(). That's the
    // "flicker": an in-between refetch can land after the ledger write but before the tenants
    // balance write, painting a stale intermediate state for one render before the next refetch
    // corrects it. Debouncing collapses a burst of events (well within one action's round trip)
    // into a single refetch of the settled state.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void listTenants(propertyId, propertyName)
          .then((rows) => {
            setTenants(rows);
            void writeCachedView(TENANTS_VIEW_KEY, propertyId, rows);
          })
          .catch((e) => console.error("Failed to refresh tenants after a live update", e));
      }, 250);
    };
    const channel = supabase
      .channel(`tenants-ledger:${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants", filter: `property_id=eq.${propertyId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries" }, refetch)
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const addTenant = (t: Omit<Tenant, "id">): Tenant & { saved: Promise<void> } => {
    const tenant: Tenant = { ...t, id: crypto.randomUUID(), portalToken: t.portalToken ?? generatePortalToken() };
    commitTenants((prev) => [tenant, ...prev]);
    let saved: Promise<void>;
    if (propertyId) {
      saved = insertTenant(propertyId, tenant.id, tenant)
        .then(() => {
          showToast(`${t.name || "Tenant"} added`, "success");
        })
        .catch((e) => {
          console.error("Failed to save tenant", e);
          commitTenants((prev) => prev.filter((x) => x.id !== tenant.id));
          showToast(`Couldn't save ${t.name || "this tenant"} — please try again.`, "error");
          throw e;
        });
    } else {
      // propertyId isn't loaded yet, so this save has nowhere to go — don't let it disappear silently on reload.
      commitTenants((prev) => prev.filter((x) => x.id !== tenant.id));
      showToast(`Couldn't save ${t.name || "this tenant"} — the app is still loading. Please wait a moment and try again.`, "error");
      saved = Promise.reject(new Error("propertyId not loaded"));
    }
    return { ...tenant, saved };
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

          // Fire-and-forget, after the balance write above has landed — send-payment-receipt-sms
          // reads tenants.owed_amount fresh, so this must come after the sync/fallback write, not
          // before, or the receipt would quote the tenant's pre-payment balance.
          payments.forEach(({ amount }) => {
            void supabase.functions
              .invoke("send-payment-receipt-sms", { body: { tenantId: id, amount } })
              .catch((e) => console.error("Failed to send payment receipt SMS", e));
          });

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
  // Phase B (financial event migration): a NEW adjustment/credit is now written as an event-model
  // row (event_type='adjustment' for a positive charge, 'credit' for a negative one), then
  // syncTenantBalanceIfNewModel is called exactly like logPayments already does — authoritative
  // for a new-model-only tenant, a no-op (falls back to the manual patch below) for anyone with
  // legacy history. This never touches historical adjustment rows; it only changes what a NEW one
  // looks like going forward.
  const addAdjustment = (id: string, input: { amount: number; label: string }) => {
    if (!navigator.onLine) {
      showToast("Reconnect to add a charge or credit.", "info");
      return;
    }
    let updated: Tenant | undefined;
    let newEntry: LedgerRow | undefined;
    let newEvent: NewLedgerEventInsert | undefined;
    commitTenants((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const nextOwed = Math.max(0, t.owedAmount + input.amount);
        const nextStatus: PaymentStatus = nextOwed === 0 ? "paid" : t.status === "paid" ? "unpaid" : t.status;
        const entryId = crypto.randomUUID();
        // A real financial effect either way — an ad-hoc charge increases what's owed, a credit
        // decreases it — so both affect the balance, distinguished only by event_type/sign.
        const eventType: "adjustment" | "credit" = input.amount >= 0 ? "adjustment" : "credit";
        const entry: LedgerRow = {
          id: entryId,
          label: input.label,
          amount: input.amount,
          source: "adjustment",
          createdAt: new Date().toISOString(),
          eventType,
          affectsBalance: true,
          origin: "landlord_manual",
        };
        newEvent = {
          id: entryId,
          tenantId: id,
          label: input.label,
          amount: input.amount,
          eventType,
          affectsBalance: true,
          origin: "landlord_manual",
          source: "adjustment",
          // No forced allocation against a specific charge — same "don't invent historical
          // allocation" rule the charge-matching design already applies to payments.
          chargeId: null,
          idempotencyKey: `${eventType}:${entryId}`,
        };
        const next: Tenant = { ...t, owedAmount: nextOwed, status: nextStatus, ledger: [entry, ...t.ledger] };
        updated = next;
        newEntry = entry;
        return next;
      })
    );
    if (propertyId && updated && newEntry && newEvent) {
      const finalUpdated = updated;
      const finalEvent = newEvent;
      void (async () => {
        try {
          await addLedgerEvent(finalEvent);

          let syncResult: { synchronized: boolean } | null = null;
          try {
            syncResult = await syncTenantBalanceIfNewModel(id);
          } catch (e) {
            console.error("Failed to sync tenant balance after adjustment", e);
          }
          if (needsBalanceFallbackWrite(syncResult)) {
            await updateTenantRow(propertyId, id, { status: finalUpdated.status, owedAmount: finalUpdated.owedAmount });
          }
          showToast(input.amount >= 0 ? "Charge added" : "Credit applied", "success");
        } catch (e) {
          console.error("Failed to add adjustment", e);
          showToast("Couldn't save that change — please try again.", "error");
        }
      })();
    }
  };

  // The late penalty isn't stored anywhere — calcPenalty derives it live from daysOverdue every
  // time (see invoiceUtils.ts) — so "waiving" it doesn't touch owedAmount at all; it just resets
  // daysOverdue so the live formula stops accruing it, plus an audit-only ledger row explaining
  // where the K-amount that used to show up went, so it isn't just silently gone from history.
  // Phase B: the waiver row is audit-only (affects_balance=false) — waiving the live penalty never
  // touches owedAmount (it never included the penalty to begin with; see the comment above), so
  // this event must NOT contribute to calculate_tenant_balance's sum. daysOverdue=0 is still the
  // real effect (stops the live formula from accruing it further) and is written the same way as
  // before; sync_tenant_balance_if_new_model recomputes days_overdue itself for a new-model tenant
  // (from the open charge's grace period), so the manual daysOverdue write only actually matters as
  // the legacy/mixed-tenant fallback.
  const waivePenalty = (id: string, reason: string) => {
    if (!navigator.onLine) {
      showToast("Reconnect to waive a penalty.", "info");
      return;
    }
    let updated: Tenant | undefined;
    let newEntry: LedgerRow | undefined;
    let newEvent: NewLedgerEventInsert | undefined;
    commitTenants((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const penalty = calcPenalty(t);
        if (penalty <= 0) return t;
        const entryId = crypto.randomUUID();
        const label = `Late penalty waived (${t.daysOverdue}d${reason ? `, ${reason}` : ""})`;
        // The charge this penalty is actually accruing against — the same open-rent-charge lookup
        // sync_tenant_balance_if_new_model itself uses (most recent due date among charges still
        // owing something). Linking the waiver to it (via charge_id, origin='penalty_waiver') is
        // what lets that RPC recognize the waiver and stop recomputing overdue days from the
        // charge's original grace period alone — without this link, the sync call this function
        // triggers right after would immediately recompute the same overdue days and undo the
        // waiver before it ever reached the screen.
        const openCharge = [...t.ledger]
          .filter((row) => row.eventType === "charge" && row.status !== "paid")
          .sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""))[0];
        const entry: LedgerRow = {
          id: entryId,
          label,
          amount: -penalty,
          source: "adjustment",
          createdAt: new Date().toISOString(),
          eventType: "adjustment",
          affectsBalance: false,
          origin: "penalty_waiver",
          chargeId: openCharge?.id ?? null,
        };
        newEvent = {
          id: entryId,
          tenantId: id,
          label,
          amount: -penalty,
          eventType: "adjustment",
          affectsBalance: false,
          origin: "penalty_waiver",
          source: "adjustment",
          chargeId: openCharge?.id ?? null,
          idempotencyKey: `penalty_waiver:${entryId}`,
        };
        // 0, not undefined — tenantPatchToRow only writes daysOverdue to the DB when it's
        // !== undefined, so undefined here would silently no-op instead of actually clearing it.
        const next: Tenant = { ...t, daysOverdue: 0, ledger: [entry, ...t.ledger] };
        updated = next;
        newEntry = entry;
        return next;
      })
    );
    if (propertyId && updated && newEntry && newEvent) {
      const finalEvent = newEvent;
      void (async () => {
        try {
          await addLedgerEvent(finalEvent);

          let syncResult: { synchronized: boolean } | null = null;
          try {
            syncResult = await syncTenantBalanceIfNewModel(id);
          } catch (e) {
            console.error("Failed to sync tenant balance after penalty waiver", e);
          }
          if (needsBalanceFallbackWrite(syncResult)) {
            await updateTenantRow(propertyId, id, { daysOverdue: 0 });
          }
          showToast("Late penalty waived", "success");
        } catch (e) {
          console.error("Failed to waive penalty", e);
          showToast("Couldn't save that change — please try again.", "error");
        }
      })();
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
