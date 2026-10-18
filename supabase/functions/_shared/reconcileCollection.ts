// Settles a successful Lenco collection: records what it paid for, updates the tenant's balance,
// and sends the receipt SMS. Shared by lenco-webhook, pay-portal-check-collection,
// pay-portal-reconcile-pending and pay-portal-collect-payment (dev mode). Each function bundles its
// own copy at deploy time, so redeploy ALL FOUR whenever this file changes, otherwise they drift
// apart and the same payment gets recorded differently depending on which one confirmed it.
//
// What a payment pays for is decided once, when it starts (allocate_payment in the database,
// stored as collections.line_items). This file only records that decision: every line item becomes
// a payment linked to the exact ledger row it paid (a monthly rent charge or a one-off charge such
// as a broken window), so the landlord ledger, the portal, the PDF receipt and the SMS all agree.
//
// Idempotency: callers only run this after winning the guarded status update on `collections`,
// and every payment row carries idempotency_key `lenco_payment:<collection id>:<line index>`, so a
// repeat run stops at the first duplicate before touching balances or sending another SMS.

import { sendPaymentReceiptSms } from "./paymentReceipt.ts";

export type LineItem = { id: string | null; label: string; amount: number; kind?: string };
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

// Collections started before allocate_payment stored their leftover under this generic label.
// Those are recorded as a plain "Mobile money payment" so the database trigger names them properly
// (towards the balance, or rent for a specific month paid in advance).
const LEGACY_ADVANCE_LABEL = "Rent paid in advance";

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
    if (updatedRows && updatedRows.length > 0) return;
  }
  console.error("[reconcileSuccessfulCollection] gave up updating tenant balance after", maxAttempts, "attempts (concurrent writers)", tenantId);
}

export async function isNewModelTenant(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("event_type", null)
    .limit(1);
  if (error) {
    console.error("[reconcileSuccessfulCollection] failed to check legacy-row eligibility, treating as legacy", tenantId, error.message);
    return false;
  }
  return !data || data.length === 0;
}

/** Short "what this paid for" text for the SMS: the one thing, or the first plus a count. */
export function receiptSummary(labels: string[]): string {
  const clean = labels.map((l) => l.replace(/^Mobile money payment, /, "")).filter((l) => l.trim() !== "");
  if (clean.length === 0) return "rent";
  if (clean.length === 1) return clean[0];
  const others = clean.length - 1;
  return `${clean[0]} and ${others} other item${others === 1 ? "" : "s"}`;
}

type InsertResult = { ok: true; label: string } | { ok: false; duplicate: boolean };

async function insertPayment(
  supabase: SupabaseClient,
  collectionRow: CollectionForReconciliation,
  index: number,
  amount: number,
  chargeId: string | null,
  label: string
): Promise<InsertResult> {
  const idempotencyKey = `lenco_payment:${collectionRow.id}:${index}`;
  const { data, error } = await supabase
    .from("ledger_entries")
    .insert({
      tenant_id: collectionRow.tenant_id,
      label,
      amount: -amount,
      event_type: "payment",
      affects_balance: true,
      origin: "lenco_webhook",
      source: "lenco",
      method: "mobile-money",
      charge_id: chargeId,
      idempotency_key: idempotencyKey,
    })
    .select("label")
    .single();
  if (error) {
    if (error.code === "23505") {
      console.log("[reconcileSuccessfulCollection] duplicate Lenco payment event ignored (idempotency)", idempotencyKey);
      return { ok: false, duplicate: true };
    }
    console.error("[reconcileSuccessfulCollection] failed to insert Lenco payment event", collectionRow.tenant_id, error.message);
    return { ok: false, duplicate: false };
  }
  return { ok: true, label: data?.label ?? label };
}

export async function reconcileSuccessfulCollection(supabase: SupabaseClient, collectionRow: CollectionForReconciliation): Promise<void> {
  const feeAmount = collectionRow.fee_amount ?? 0;
  const rentPortion = round2(collectionRow.amount - feeAmount);
  const stored: LineItem[] = Array.isArray(collectionRow.line_items) ? (collectionRow.line_items as LineItem[]) : [];
  const items: LineItem[] = stored.length > 0 ? stored : [{ id: null, label: LEGACY_ADVANCE_LABEL, amount: rentPortion }];

  // Decided before any write, the way the balance gets updated afterwards depends on what the
  // ledger looked like before this payment, not after.
  const newModel = await isNewModelTenant(supabase, collectionRow.tenant_id);
  const paidFor: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const amount = round2(Number(item.amount));
    if (!(amount > 0)) continue;

    let chargeId: string | null = null;
    let label = item.label === LEGACY_ADVANCE_LABEL || !item.label ? "Mobile money payment" : item.label;

    if (item.id) {
      const { data: entry } = await supabase
        .from("ledger_entries")
        .select("event_type, amount, paid_amount, label, voided_at")
        .eq("id", item.id)
        .maybeSingle();
      if (entry && entry.event_type === null && !entry.voided_at) {
        // An old-style row tracks its own paid_amount: settle it in place.
        const newPaid = round2(Number(entry.paid_amount ?? 0) + amount);
        const newStatus = newPaid >= Number(entry.amount) ? "paid" : "partial";
        await supabase
          .from("ledger_entries")
          .update({ paid_amount: newPaid, status: newStatus, method: "mobile-money", source: "lenco" })
          .eq("id", item.id);
        paidFor.push(entry.label);
        continue;
      }
      if (entry && !entry.voided_at) {
        // A rent charge or one-off charge: a payment linked to it. The trigger names it
        // "Mobile money payment, <what it paid>".
        chargeId = item.id;
        label = "Mobile money payment";
      } else {
        // The row was voided or removed after the payment started. The money still arrived, so it
        // is recorded as a general payment against the balance rather than dropped.
        console.error("[reconcileSuccessfulCollection] line item points at a missing or voided ledger row, recording as a general payment", item.id);
        label = "Mobile money payment";
      }
    }

    const result = await insertPayment(supabase, collectionRow, i, amount, chargeId, label);
    if (!result.ok) {
      // Already recorded by an earlier run: stop before touching balances or sending another SMS.
      if (result.duplicate) return;
      continue;
    }
    paidFor.push(result.label);
  }

  const { error: balanceError } = await supabase.rpc("pay_portal_increment_property_balance", {
    p_property_id: collectionRow.property_id,
    p_amount: rentPortion,
  });
  if (balanceError) {
    console.error("[reconcileSuccessfulCollection] failed to increment property balance", collectionRow.property_id, balanceError.message);
  }

  if (newModel) {
    const { data: syncData, error: syncError } = await supabase
      .rpc("sync_tenant_balance_if_new_model", { p_tenant_id: collectionRow.tenant_id })
      .maybeSingle();
    if (syncError || !syncData?.synchronized) {
      console.error("[reconcileSuccessfulCollection] balance sync did not run, falling back to subtracting the payment", collectionRow.tenant_id, syncError?.message ?? syncData?.skip_reason);
      await applyTenantSettlement(supabase, collectionRow.tenant_id, rentPortion);
    }
  } else {
    await applyTenantSettlement(supabase, collectionRow.tenant_id, rentPortion);
  }

  await sendPaymentReceiptSms(supabase, supabase, collectionRow.tenant_id, rentPortion, receiptSummary(paidFor));

  const { error: syncTasksError } = await supabase.rpc("sync_tasks", { p_property_id: collectionRow.property_id });
  if (syncTasksError) {
    console.error("[reconcileSuccessfulCollection] failed to resync tasks after payment", collectionRow.property_id, syncTasksError.message);
  }
}
