// Shared reconciliation logic for a successful collection — applies the same ledger_entries /
// tenants.owed_amount / property_balances updates regardless of which path confirmed it first:
// lenco-webhook (the real push from Lenco) or pay-portal-check-collection (the polling fallback
// for when the webhook never arrives). Previously these were two separate copies of the same
// logic that had already drifted — this one only fixed the webhook's copy, so a payment
// confirmed via polling instead of the webhook still zeroed owed_amount outright, logged one
// lump ledger row including the sending fee as rent, and never touched property_balances.
// Kept in one place now so that class of bug can't happen again.

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
export async function reconcileSuccessfulCollection(supabase: any, collectionRow: CollectionForReconciliation): Promise<void> {
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

  if (lineItems && lineItems.length > 0) {
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

    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("status, owed_amount, days_overdue, on_time_count, total_months_count")
      .eq("id", collectionRow.tenant_id)
      .maybeSingle();
    if (tenantRow) {
      const newOwed = Math.max(0, round2(Number(tenantRow.owed_amount ?? 0) - rentPortion));
      const fullyPaid = newOwed <= 0;
      const wasLate = ["overdue", "unpaid"].includes(tenantRow.status);
      await supabase
        .from("tenants")
        .update({
          status: fullyPaid ? "paid" : "partial",
          owed_amount: newOwed,
          days_overdue: fullyPaid ? 0 : tenantRow.days_overdue,
          on_time_count: fullyPaid && !wasLate ? tenantRow.on_time_count + 1 : tenantRow.on_time_count,
          total_months_count: fullyPaid ? tenantRow.total_months_count + 1 : tenantRow.total_months_count,
        })
        .eq("id", collectionRow.tenant_id);
    }
  } else {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("status, on_time_count, total_months_count")
      .eq("id", collectionRow.tenant_id)
      .maybeSingle();
    if (tenantRow) {
      const wasLate = ["overdue", "unpaid"].includes(tenantRow.status);
      await supabase
        .from("tenants")
        .update({
          status: "paid",
          owed_amount: 0,
          on_time_count: wasLate ? tenantRow.on_time_count : tenantRow.on_time_count + 1,
          total_months_count: tenantRow.total_months_count + 1,
        })
        .eq("id", collectionRow.tenant_id);
      await supabase.from("ledger_entries").insert({
        tenant_id: collectionRow.tenant_id,
        label: "Rent payment",
        amount: collectionRow.amount,
        paid_amount: collectionRow.amount,
        status: "paid",
        method: "mobile-money",
        source: "lenco",
      });
    }
  }
}
