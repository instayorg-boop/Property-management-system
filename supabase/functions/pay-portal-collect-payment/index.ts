// Initiates a real mobile-money collection from a tenant via Lenco — replaces the old fully
// simulated "pay" flow in TenantBalance.tsx (a fake setTimeout spinner that wrote a ledger row
// with no real payment ever happening).
//
// Requires a verified OTP session (see pay-portal-request-otp/verify-otp) — this moves real money,
// so it's gated the same way the balance-reading RPCs are.
//
// Fee model (locked in): tenant pays a flat 1.3% sending fee on top of whatever they choose to pay.
// Real Lenco collection cost is 1% — the extra 0.3% is IPM margin. Partial payments are allowed
// down to a K50 floor; the amount is clamped server-side against the tenant's real owed_amount, a
// tampered client can shrink the amount but never inflate it past what's actually due.
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

type CollectPayload = {
  propertySlug?: string;
  tenantId?: string;
  phone?: string;
  operator?: string;
  sessionToken?: string;
  amount?: number;
};

const OPERATORS = ["mtn", "airtel", "zamtel"];
const FEE_RATE = 0.013;
const MIN_PARTIAL_AMOUNT = 50;

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
    .select("id, owed_amount, rent_amount")
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

  const owedBefore: number = tenant.owed_amount || tenant.rent_amount || 0;
  if (!owedBefore || owedBefore <= 0) {
    return new Response(JSON.stringify({ error: "There's nothing due to pay right now." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestedAmount = typeof payload.amount === "number" && Number.isFinite(payload.amount) ? payload.amount : owedBefore;
  const rentPortion = Math.min(owedBefore, Math.max(MIN_PARTIAL_AMOUNT, round2(requestedAmount)));

  const feeAmount = round2(rentPortion * FEE_RATE);
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
