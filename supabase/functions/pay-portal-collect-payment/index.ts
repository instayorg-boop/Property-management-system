// Initiates a real mobile-money collection from a tenant via Lenco — replaces the old fully
// simulated "pay" flow in TenantBalance.tsx (a fake setTimeout spinner that wrote a ledger row
// with no real payment ever happening).
//
// Requires a verified OTP session (see pay-portal-request-otp/verify-otp) — this moves real money,
// so it's gated the same way the balance-reading RPCs are.
//
// Fee model: tenant pays a sending fee on top of whatever they choose to pay, at a rate that
// declines as their contracted monthly rent rises (see ONLINE_FEE_BANDS below — kept in sync by
// hand with src/lib/pricing.ts's ONLINE_FEE_BANDS, since this Deno function can't import frontend
// code; same pattern already used for the late-penalty formula duplicated across invoiceUtils.ts,
// payPortal.ts, and this file). The band is chosen by the tenant's rent_amount, not by the amount
// being paid in this one transaction, so a partial payment can't be split to reach a lower band.
// Real Lenco collection cost is ~1% — the rest of each band's rate is IPM margin. Partial payments
// are allowed down to a K50 floor; the amount is clamped server-side against the tenant's real
// owed_amount, a tampered client can shrink the amount but never inflate it past what's actually due.
//
// line_items / fee_amount / owed_before are snapshotted on the collections row at this point (not
// by lenco-webhook, which only confirms an outcome and has no idea what was being paid toward).
// line_items is a FIFO allocation of the rent portion of the payment across the tenant's open
// ledger_entries, oldest first — each item carries the ledger_entries.id it applies to (or null
// for a paid-in-advance amount with no existing entry) so lenco-webhook can update the exact row,
// not just match on label text.
//
// Endpoint confirmed against this account's live Lenco API reference (v2.0):
//   POST https://api.lenco.co/access/v2/collections/mobile-money
//   body: { amount, reference, phone, operator (mtn|airtel|zamtel), country?, bearer? }
//   -> status is almost always "pay-offline" on success (customer must approve on their phone),
//      not "successful" immediately — that's expected, not an error.
//
// Deploy:  supabase functions deploy pay-portal-collect-payment
// Invoke:  supabase.functions.invoke("pay-portal-collect-payment", { body: { propertySlug, tenantId, phone, operator, sessionToken, amount? } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { toE164Zambia } from "../_shared/phone.ts";
import { reconcileSuccessfulCollection } from "../_shared/reconcileCollection.ts";

type CollectPayload = {
  propertySlug?: string;
  tenantId?: string;
  phone?: string;
  operator?: string;
  sessionToken?: string;
  amount?: number;
  /** Skips the real Lenco call entirely and fakes the outcome instead — only honored when the
   * DEV_MODE_PAYMENTS function secret is set to "true". Lenco has no sandbox on this account, so
   * this is the only way to preview the success/failure/receipt UI without moving real money.
   * "success" still runs the real settlement (ledger_entries, tenants.owed_amount,
   * property_balances all update for real) so the generated receipt reflects a real row — only the
   * actual mobile-money charge is skipped. Test against a scratch tenant, not a real occupied unit. */
  devSimulate?: "success" | "failed";
};

const OPERATORS = ["mtn", "airtel", "zamtel"];
const MIN_PARTIAL_AMOUNT = 50;

// Mirror of src/lib/pricing.ts's ONLINE_FEE_BANDS — see the fee-model comment above.
const ONLINE_FEE_BANDS: { upToRent: number; rate: number }[] = [
  { upToRent: 2000, rate: 0.02 },
  { upToRent: 2500, rate: 0.019 },
  { upToRent: 3000, rate: 0.018 },
  { upToRent: 3500, rate: 0.017 },
  { upToRent: 4000, rate: 0.016 },
  { upToRent: 4500, rate: 0.015 },
  { upToRent: 5000, rate: 0.014 },
  { upToRent: 5500, rate: 0.013 },
  { upToRent: 6000, rate: 0.0125 },
];
const RATE_ABOVE_TOP_BAND = 0.0125;

function onlineFeeRateForRent(monthlyRent: number): number {
  for (const band of ONLINE_FEE_BANDS) {
    if (monthlyRent <= band.upToRent) return band.rate;
  }
  return RATE_ABOVE_TOP_BAND;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: CollectPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const propertySlug = payload.propertySlug?.trim() ?? "";
  const tenantId = payload.tenantId?.trim() ?? "";
  const phone = payload.phone?.trim() ?? "";
  const operator = payload.operator?.trim().toLowerCase() ?? "";
  const sessionToken = payload.sessionToken?.trim() ?? "";

  if (!propertySlug || !tenantId || !phone || !OPERATORS.includes(operator) || !sessionToken) {
    return new Response(
      JSON.stringify({ error: "propertySlug, tenantId, phone, a valid operator and sessionToken are all required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: "LENCO_SECRET_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: sessionValid } = await supabase.rpc("pay_portal_verify_session", {
    p_tenant_id: tenantId,
    p_session_token: sessionToken,
  });
  if (!sessionValid) {
    return new Response(JSON.stringify({ error: "Your session has expired. Verify your code again." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: property } = await supabase.from("properties").select("id").eq("slug", propertySlug).maybeSingle();
  if (!property) {
    return new Response(JSON.stringify({ error: "We couldn't find that account." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, owed_amount, rent_amount, days_overdue, status")
    .eq("id", tenantId)
    .eq("property_id", property.id)
    .eq("active", true)
    .maybeSingle();

  if (!tenant) {
    return new Response(JSON.stringify({ error: "We couldn't find that account." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Same late-penalty formula as invoiceUtils.ts's calcLatePenalty and payPortal.ts's mirror of it
  // — days overdue x daily rate for this tenant's rent — kept in sync by hand across the three
  // spots since this edge function can't import frontend code. Without folding it in here, a
  // tenant with an accrued penalty could pay off owed_amount in full via mobile money and still
  // never actually cover the penalty (server clamps the charge to owedBefore, so it must include it).
  const daysOverdue: number = tenant.days_overdue ?? 0;
  const daysInThisMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const penaltyAmount = tenant.status === "paid" || daysOverdue <= 0 ? 0 : Math.round(daysOverdue * (tenant.rent_amount / daysInThisMonth));
  const owedBefore: number = tenant.status === "paid" ? 0 : (tenant.owed_amount || tenant.rent_amount || 0) + penaltyAmount;
  if (!owedBefore || owedBefore <= 0) {
    return new Response(JSON.stringify({ error: "There's nothing due to pay right now." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestedAmount = typeof payload.amount === "number" && Number.isFinite(payload.amount) ? payload.amount : owedBefore;
  const rentPortion = Math.min(owedBefore, Math.max(MIN_PARTIAL_AMOUNT, round2(requestedAmount)));

  const feeRate = onlineFeeRateForRent(tenant.rent_amount ?? 0);
  const feeAmount = round2(rentPortion * feeRate);
  const totalAmount = round2(rentPortion + feeAmount);

  const { data: openEntries } = await supabase
    .from("ledger_entries")
    .select("id, label, amount, paid_amount, status, created_at")
    .eq("tenant_id", tenantId)
    .in("status", ["unpaid", "overdue", "partial"])
    .order("created_at", { ascending: true });

  const lineItems: { id: string | null; label: string; amount: number }[] = [];
  let remaining = rentPortion;
  for (const entry of openEntries ?? []) {
    if (remaining <= 0) break;
    const outstanding = round2(Number(entry.amount) - Number(entry.paid_amount ?? 0));
    if (outstanding <= 0) continue;
    const applied = Math.min(outstanding, remaining);
    lineItems.push({ id: entry.id, label: entry.label, amount: applied });
    remaining = round2(remaining - applied);
  }
  if (remaining > 0) {
    lineItems.push({ id: null, label: "Rent paid in advance", amount: remaining });
  }

  const { data: collectionRow, error: insertError } = await supabase
    .from("collections")
    .insert({
      tenant_id: tenantId,
      property_id: property.id,
      amount: totalAmount,
      phone,
      operator,
      status: "pending",
      line_items: lineItems,
      fee_amount: feeAmount,
      owed_before: owedBefore,
    })
    .select()
    .single();

  if (insertError || !collectionRow) {
    return new Response(JSON.stringify({ error: "Failed to start the payment", detail: insertError?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const devModeEnabled = Deno.env.get("DEV_MODE_PAYMENTS") === "true";
  if (devModeEnabled && payload.devSimulate) {
    if (payload.devSimulate === "success") {
      await supabase
        .from("collections")
        .update({ status: "successful", lenco_collection_id: "DEV-SIMULATED" })
        .eq("id", collectionRow.id);
      await reconcileSuccessfulCollection(supabase, collectionRow);
      return new Response(
        JSON.stringify({ ok: true, collectionId: collectionRow.id, status: "successful", amount: totalAmount, feeAmount, rentPortion, isPartial: rentPortion < owedBefore }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    await supabase
      .from("collections")
      .update({ status: "failed", failure_reason: "Simulated failure (dev mode)" })
      .eq("id", collectionRow.id);
    return new Response(
      JSON.stringify({ ok: true, collectionId: collectionRow.id, status: "failed", failureReason: "Simulated failure (dev mode)" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
        amount: totalAmount,
        reference: collectionRow.id,
        phone: toE164Zambia(phone),
        operator,
        country: "zm",
        bearer: "merchant",
      }),
    });
    const lencoJson = await lencoResponse.json();

    if (!lencoResponse.ok) {
      await supabase
        .from("collections")
        .update({ status: "failed", failure_reason: lencoJson.message ?? "Lenco rejected the collection request" })
        .eq("id", collectionRow.id);
      return new Response(
        JSON.stringify({ error: lencoJson.message ?? "Failed to start the payment", detail: lencoJson }),
        { status: lencoResponse.status === 400 ? 400 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lencoStatus: string | undefined = lencoJson.data?.status;
    const lencoCollectionId: string | undefined = lencoJson.data?.id;
    const storedStatus = lencoStatus === "successful" || lencoStatus === "failed" ? lencoStatus : "pay-offline";
    await supabase
      .from("collections")
      .update({
        status: storedStatus,
        lenco_collection_id: lencoCollectionId ?? null,
        failure_reason: storedStatus === "failed" ? lencoJson.data?.reasonForFailure ?? lencoJson.message ?? null : null,
      })
      .eq("id", collectionRow.id);

    return new Response(
      JSON.stringify({
        ok: true,
        collectionId: collectionRow.id,
        status: storedStatus,
        amount: totalAmount,
        feeAmount,
        rentPortion,
        isPartial: rentPortion < owedBefore,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await supabase.from("collections").update({ status: "failed", failure_reason: String(err) }).eq("id", collectionRow.id);
    return new Response(JSON.stringify({ error: "Failed to reach Lenco", detail: String(err) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
