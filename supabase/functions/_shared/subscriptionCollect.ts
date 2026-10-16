// Shared Lenco mobile-money call for IPM's OWN subscription fee (the property owner paying us),
// used by both pay-subscription-invoice (the landlord's own "Pay now" button) and
// generate-subscription-invoices (the autopay cron sweep) so the two never drift into different
// Lenco-calling logic. Deliberately separate from pay-portal-collect-payment, which is for a
// tenant paying rent to their landlord — a different payer, payee, and ledger entirely.

import { toE164Zambia } from "./phone.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type SubscriptionCollectResult =
  | { ok: true; paymentId: string; status: "pending" | "pay-offline" | "successful" | "failed"; failureReason?: string | null }
  | { ok: false; error: string };

/** Starts (or re-attempts) a mobile-money collection against a specific invoice. Assumes the
 * caller has already checked the invoice is still pending/overdue and belongs to the right
 * property — this just creates the subscription_payments row and talks to Lenco. */
export async function collectSubscriptionPayment(
  supabase: SupabaseClient,
  opts: { invoiceId: string; propertyId: string; amount: number; phone: string; operator: string; triggeredBy: "manual" | "autopay" }
): Promise<SubscriptionCollectResult> {
  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) return { ok: false, error: "LENCO_SECRET_KEY is not configured" };

  const { data: paymentRow, error: insertError } = await supabase
    .from("subscription_payments")
    .insert({
      invoice_id: opts.invoiceId,
      property_id: opts.propertyId,
      amount: opts.amount,
      phone: opts.phone,
      operator: opts.operator,
      status: "pending",
      triggered_by: opts.triggeredBy,
    })
    .select()
    .single();

  if (insertError || !paymentRow) {
    return { ok: false, error: insertError?.message ?? "Failed to start the payment" };
  }

  const devModeEnabled = Deno.env.get("DEV_MODE_PAYMENTS") === "true";
  if (devModeEnabled && Deno.env.get("DEV_SIMULATE_SUBSCRIPTION_PAYMENTS") === "true") {
    await supabase
      .from("subscription_payments")
      .update({ status: "successful", lenco_collection_id: "DEV-SIMULATED", updated_at: new Date().toISOString() })
      .eq("id", paymentRow.id);
    await supabase
      .from("subscription_invoices")
      .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: "lenco_mobile_money" })
      .eq("id", opts.invoiceId);
    return { ok: true, paymentId: paymentRow.id, status: "successful" };
  }

  try {
    const lencoResponse = await fetch("https://api.lenco.co/access/v2/collections/mobile-money", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lencoSecretKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        amount: opts.amount,
        reference: paymentRow.id,
        phone: toE164Zambia(opts.phone),
        operator: opts.operator,
        country: "zm",
        bearer: "merchant",
      }),
    });
    const lencoJson = await lencoResponse.json();

    if (!lencoResponse.ok && lencoResponse.status >= 500) {
      // Unknown outcome — leave pending, the poll/cron sweep will catch up with Lenco later.
      return { ok: true, paymentId: paymentRow.id, status: "pending" };
    }

    if (!lencoResponse.ok) {
      const reason = lencoJson.message ?? "Lenco rejected the collection request";
      await supabase
        .from("subscription_payments")
        .update({ status: "failed", failure_reason: reason, updated_at: new Date().toISOString() })
        .eq("id", paymentRow.id);
      return { ok: false, error: reason };
    }

    const lencoStatus: string | undefined = lencoJson.data?.status;
    const lencoCollectionId: string | undefined = lencoJson.data?.id;
    const storedStatus = lencoStatus === "successful" || lencoStatus === "failed" ? lencoStatus : "pay-offline";
    await supabase
      .from("subscription_payments")
      .update({
        status: storedStatus,
        lenco_collection_id: lencoCollectionId ?? null,
        failure_reason: storedStatus === "failed" ? lencoJson.data?.reasonForFailure ?? lencoJson.message ?? null : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentRow.id);

    if (storedStatus === "successful") {
      await supabase
        .from("subscription_invoices")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: "lenco_mobile_money" })
        .eq("id", opts.invoiceId);
    }

    return { ok: true, paymentId: paymentRow.id, status: storedStatus };
  } catch (err) {
    console.error("[subscriptionCollect] unknown outcome reaching Lenco", String(err));
    return { ok: true, paymentId: paymentRow.id, status: "pending" };
  }
}

/** Polls Lenco directly for a still-pending subscription payment's real status — the fallback for
 * when there's no webhook wired for this collection type yet (see generate-subscription-invoices'
 * top comment). Mirrors pay-portal-check-collection's polling approach. */
export async function checkSubscriptionPayment(supabase: SupabaseClient, paymentId: string): Promise<void> {
  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) return;

  const { data: payment } = await supabase
    .from("subscription_payments")
    .select("id, invoice_id, lenco_collection_id, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || !payment.lenco_collection_id || !["pending", "pay-offline"].includes(payment.status)) return;

  try {
    const res = await fetch(`https://api.lenco.co/access/v2/collections/status/${payment.lenco_collection_id}`, {
      headers: { Authorization: `Bearer ${lencoSecretKey}`, accept: "application/json" },
    });
    const json = await res.json();
    const status: string | undefined = json.data?.status;
    if (status !== "successful" && status !== "failed") return;

    const { data: updated } = await supabase
      .from("subscription_payments")
      .update({
        status,
        failure_reason: status === "failed" ? json.data?.reasonForFailure ?? null : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .in("status", ["pending", "pay-offline"])
      .select("invoice_id")
      .maybeSingle();

    if (updated && status === "successful") {
      await supabase
        .from("subscription_invoices")
        .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: "lenco_mobile_money" })
        .eq("id", payment.invoice_id);
    }
  } catch (err) {
    console.error("[subscriptionCollect] poll failed", String(err));
  }
}
