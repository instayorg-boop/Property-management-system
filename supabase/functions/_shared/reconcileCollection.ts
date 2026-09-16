// Shared reconciliation logic for a successful collection — applies the same ledger_entries /
// tenants.owed_amount / property_balances updates, and sends the tenant their payment-receipt SMS,
// regardless of which path confirmed it first:
// lenco-webhook (the real push from Lenco) or pay-portal-check-collection (the polling fallback
// for when the webhook never arrives). Previously these were two separate copies of the same
// logic that had already drifted — this one only fixed the webhook's copy, so a payment
// confirmed via polling instead of the webhook still zeroed owed_amount outright, logged one
// lump ledger row including the sending fee as rent, and never touched property_balances.
// Kept in one place now so that class of bug can't happen again.

import { sendPaymentReceiptSms } from "./paymentReceipt.ts";

export type LineItem = { id: string | null; label: string; amount: number };
export type CollectionForReconciliation = {
  id: string;
  tenant_id: string;
  property_id: string;
  amount: number;
  fee_amount: number | null;
  line_items: unknown;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Decrements a tenant's owed_amount by `rentPortion` (or zeroes it outright when `rentPortion` is
 * null, for the no-line-items "assume it's all rent" branch) without a plain read-then-write —
 * two collections settling for the same tenant in close succession used to be able to race: both
 * read the same starting owed_amount, both computed their own "final" value, and the second write
 * clobbered the first, silently losing one payment's effect on the balance even though both
 * ledger_entries rows existed correctly. This is a compare-and-swap loop instead: read the current
 * row, compute the new values, then write conditioned on owed_amount still matching what was just
 * read (`.eq("owed_amount", ...)` on the update) — if another writer got there first, the update
 * matches zero rows and this retries against the now-current value, rather than overwriting it. */
async function applyTenantSettlement(
  supabase: SupabaseClient,
  tenantId: string,
  rentPortion: number | null
): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("status, owed_amount, days_overdue, on_time_count, total_months_count")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenantRow) return;

    const currentOwed: number = tenantRow.owed_amount ?? 0;
    const newOwed = rentPortion === null ? 0 : Math.max(0, round2(currentOwed - rentPortion));
    const fullyPaid = newOwed <= 0;
    const wasLate = ["overdue", "unpaid"].includes(tenantRow.status);

    const { data: updatedRows, error } = await supabase
      .from("tenants")
      .update({
        status: fullyPaid ? "paid" : "partial",
        owed_amount: newOwed,
        days_overdue: fullyPaid ? 0 : tenantRow.days_overdue,
        on_time_count: fullyPaid && !wasLate ? tenantRow.on_time_count + 1 : tenantRow.on_time_count,
        total_months_count: fullyPaid ? tenantRow.total_months_count + 1 : tenantRow.total_months_count,
      })
      .eq("id", tenantId)
      .eq("owed_amount", tenantRow.owed_amount)
      .select("id");

    if (error) {
      console.error("[reconcileSuccessfulCollection] failed to update tenant balance", tenantId, error.message);
      return;
    }
    // A matched row means the compare-and-swap succeeded (nothing else changed owed_amount
    // between the read and this write) — done. Zero rows means another writer won the race;
    // loop and retry against the value it left behind.
    if (updatedRows && updatedRows.length > 0) return;
  }
  console.error("[reconcileSuccessfulCollection] gave up updating tenant balance after", maxAttempts, "attempts (concurrent writers)", tenantId);
}

/** True when this tenant has no legacy row at all (event_type IS NULL) — the exact eligibility
 * rule sync_tenant_balance_if_new_model enforces in the database (Phase 3E). Checked here, before
 * deciding how to write a NEW Lenco payment, so a legacy/mixed tenant's write path is completely
 * unaffected by this migration; only a tenant with zero pre-event-model history gets the new
 * event-model shape. Never reinterprets or touches any existing row either way. */
export async function isNewModelTenant(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("event_type", null)
    .limit(1);
  if (error) {
    console.error("[reconcileSuccessfulCollection] failed to check legacy-row eligibility, treating as legacy", tenantId, error.message);
    return false; // conservative: any read failure keeps the tenant on the always-safe legacy path
  }
  return !data || data.length === 0;
}

/** Phase E charge matching, reused as-is from the manual-payment path (TenantsContext.tsx's
 * logPayments): prefer the tenant's own open charge for the CURRENT calendar billing period only —
 * no cross-period inference, no allocation table. Returns null (a standalone payment) when no such
 * charge exists or it's already fully settled by other events. */
export async function findCurrentPeriodOpenChargeId(supabase: SupabaseClient, tenantId: string): Promise<string | null> {
  const now = new Date();
  const currentBillingPeriodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: chargeRow } = await supabase
    .from("ledger_entries")
    .select("id, amount")
    .eq("tenant_id", tenantId)
    .eq("event_type", "charge")
    .eq("billing_period_id", currentBillingPeriodId)
    .is("voided_at", null)
    .maybeSingle();
  if (!chargeRow) return null;

  const { data: linked } = await supabase
    .from("ledger_entries")
    .select("amount")
    .eq("charge_id", chargeRow.id)
    .is("voided_at", null)
    .eq("affects_balance", true);
  const remaining = Number(chargeRow.amount) + (linked ?? []).reduce((sum: number, ev: { amount: number }) => sum + Number(ev.amount), 0);
  return remaining > 0 ? chargeRow.id : null;
}

/** Phase A — records a NEW Lenco-confirmed payment using the same financial-event model manual
 * payments already use (Phase 3D), instead of the old charge-shaped ledger_entries write. Only
 * ever called for a tenant already confirmed new-model-only by the caller; does NOT create a
 * legacy paid_amount/status row. `rentPortion` is the actual amount received toward rent (the
 * sending fee is never part of this — it's tracked separately via property_balances only).
 *
 * Idempotency: `idempotencyKey` is `lenco_payment:<collections.id>` — deterministic from the
 * collection this reconciliation is for, so a retried/duplicate call for the very same collection
 * (both lenco-webhook and pay-portal-check-collection racing, or Lenco retrying its webhook) hits
 * the Phase 3A unique index (tenant_id, idempotency_key) and is reported back as a duplicate rather
 * than double-crediting the tenant — this is on top of, not instead of, the existing
 * `.in("status", ["pending", "pay-offline"])` guard on the `collections` row itself that already
 * makes reconcileSuccessfulCollection run at most once per collection in practice. */
export async function recordNewModelLencoPayment(
  supabase: SupabaseClient,
  collectionRow: CollectionForReconciliation,
  rentPortion: number
): Promise<void> {
  const chargeId = await findCurrentPeriodOpenChargeId(supabase, collectionRow.tenant_id);
  const idempotencyKey = `lenco_payment:${collectionRow.id}`;

  const { error: insertError } = await supabase.from("ledger_entries").insert({
    tenant_id: collectionRow.tenant_id,
    label: "Mobile money payment",
    amount: -rentPortion, // negative actual payment amount — never the legacy "amount owed" convention
    event_type: "payment",
    affects_balance: true,
    origin: "lenco_webhook",
    source: "lenco",
    method: "mobile-money",
    charge_id: chargeId,
    idempotency_key: idempotencyKey,
    // paid_amount/status are deliberately omitted (stay NULL) — legacy-only fields a new-model
    // payment event never populates, matching Phase 3D's manual-payment event shape exactly.
  });

  if (insertError) {
    if (insertError.code === "23505") {
      console.log("[reconcileSuccessfulCollection] duplicate Lenco payment event ignored (idempotency)", idempotencyKey);
      return;
    }
    console.error("[reconcileSuccessfulCollection] failed to insert Lenco payment event", collectionRow.tenant_id, insertError.message);
    return;
  }

  const { data: syncData, error: syncError } = await supabase
    .rpc("sync_tenant_balance_if_new_model", { p_tenant_id: collectionRow.tenant_id })
    .maybeSingle();
  if (syncError) {
    console.error("[reconcileSuccessfulCollection] failed to sync balance after Lenco payment", collectionRow.tenant_id, syncError.message);
    return;
  }
  if (!syncData?.synchronized) {
    // Shouldn't happen — isNewModelTenant just confirmed no legacy row exists — but if a legacy
    // row was written for this tenant in the narrow window between that check and this insert,
    // fall back to the old CAS-based settlement rather than leaving owed_amount stale.
    console.error(
      "[reconcileSuccessfulCollection] expected new-model tenant but sync reported not synchronized — falling back to legacy settlement",
      collectionRow.tenant_id,
      syncData?.skip_reason
    );
    await applyTenantSettlement(supabase, collectionRow.tenant_id, rentPortion);
  }
}

export async function reconcileSuccessfulCollection(supabase: SupabaseClient, collectionRow: CollectionForReconciliation): Promise<void> {
  const feeAmount = collectionRow.fee_amount ?? 0;
  const rentPortion = round2(collectionRow.amount - feeAmount);
  const lineItems: LineItem[] | null = Array.isArray(collectionRow.line_items) ? (collectionRow.line_items as LineItem[]) : null;

  const { error: balanceError } = await supabase.rpc("pay_portal_increment_property_balance", {
    p_property_id: collectionRow.property_id,
    p_amount: rentPortion,
  });
  if (balanceError) {
    console.error("[reconcileSuccessfulCollection] failed to increment property balance", collectionRow.property_id, balanceError.message);
  }

  // Phase A: a tenant with zero legacy history gets the new financial-event shape instead of the
  // old charge-shaped ledger writes below — property_balances (above) and provider verification/
  // idempotency are completely unaffected either way; only how the tenant's own ledger/balance
  // gets written changes.
  if (await isNewModelTenant(supabase, collectionRow.tenant_id)) {
    await recordNewModelLencoPayment(supabase, collectionRow, rentPortion);
  } else if (lineItems && lineItems.length > 0) {
    for (const item of lineItems) {
      if (item.id) {
        const { data: entry } = await supabase.from("ledger_entries").select("amount, paid_amount").eq("id", item.id).maybeSingle();
        if (entry) {
          const newPaid = round2(Number(entry.paid_amount ?? 0) + item.amount);
          const newStatus = newPaid >= Number(entry.amount) ? "paid" : "partial";
          await supabase
            .from("ledger_entries")
            .update({ paid_amount: newPaid, status: newStatus, method: "mobile-money", source: "lenco" })
            .eq("id", item.id);
        } else {
          console.error("[reconcileSuccessfulCollection] line item referenced a ledger entry that no longer exists", item.id);
        }
      } else {
        await supabase.from("ledger_entries").insert({
          tenant_id: collectionRow.tenant_id,
          label: item.label,
          amount: item.amount,
          paid_amount: item.amount,
          status: "paid",
          method: "mobile-money",
          source: "lenco",
        });
      }
    }

    await applyTenantSettlement(supabase, collectionRow.tenant_id, rentPortion);
  } else {
    await supabase.from("ledger_entries").insert({
      tenant_id: collectionRow.tenant_id,
      label: "Rent payment",
      amount: collectionRow.amount,
      paid_amount: collectionRow.amount,
      status: "paid",
      method: "mobile-money",
      source: "lenco",
    });
    // No line items to attribute this to a specific existing balance, but it's still a full
    // settlement — pass `null` so the helper zeroes owed_amount outright (matching the old
    // behavior) while still resetting days_overdue and updating on_time/total_months_count
    // through the same race-safe path as the line-items branch above.
    await applyTenantSettlement(supabase, collectionRow.tenant_id, null);
  }

  // Fires after every branch above — each one has fully applied this payment's effect on
  // owed_amount by this point, so the balance in the receipt is always the real post-payment one.
  await sendPaymentReceiptSms(supabase, supabase, collectionRow.tenant_id, rentPortion);
}
