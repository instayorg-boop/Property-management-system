// Initiates a real mobile-money collection from a tenant via Lenco — replaces the old fully
// simulated "pay" flow in TenantBalance.tsx (a fake setTimeout spinner that wrote a ledger row
// with no real payment ever happening).
//
// Requires a verified OTP session (see pay-portal-request-otp/verify-otp) — this moves real money,
// so it's gated the same way the balance-reading RPCs are. The amount is computed server-side from
// the tenant's actual owed_amount/rent_amount, never trusted from the request body — a tampered
// client can't pay a different amount than what's actually due.
//
// The tenant's ledger is updated ONLY by lenco-webhook once Lenco confirms collection.successful —
// never here. This function just kicks off the request and returns pay-offline/pending; the
// frontend polls pay_portal_get_collection_status (via getCollectionStatus in payPortal.ts) until
// the webhook lands.
//
// Endpoint confirmed against this account's live Lenco API reference (v2.0):
//   POST https://api.lenco.co/access/v2/collections/mobile-money
//   body: { amount, reference, phone, operator (mtn|airtel|zamtel), country?, bearer? }
//   -> status is almost always "pay-offline" on success (customer must approve on their phone),
//      not "successful" immediately — that's expected, not an error.
//
// Deploy:  supabase functions deploy pay-portal-collect-payment
// Invoke:  supabase.functions.invoke("pay-portal-collect-payment", { body: { propertySlug, tenantId, phone, operator, sessionToken } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { toE164Zambia } from "../_shared/phone.ts";

type CollectPayload = {
  propertySlug?: string;
  tenantId?: string;
  phone?: string;
  operator?: string;
  sessionToken?: string;
};

const OPERATORS = ["mtn", "airtel", "zamtel"];

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

  // Service-role client — this call happens before any Supabase Auth session exists (the portal is
  // unauthenticated by design), so the OTP session check below is the real gate, not RLS.
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

  const amount = tenant.owed_amount || tenant.rent_amount;
  if (!amount || amount <= 0) {
    return new Response(JSON.stringify({ error: "There's nothing due to pay right now." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: collectionRow, error: insertError } = await supabase
    .from("collections")
    .insert({ tenant_id: tenantId, property_id: property.id, amount, phone, operator, status: "pending" })
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
        amount,
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
    // Preserve Lenco's actual status verbatim — collapsing anything-but-"successful" into
    // "pay-offline" previously hid a real immediate "failed" behind a fake "still waiting" state.
    const storedStatus = lencoStatus === "successful" || lencoStatus === "failed" ? lencoStatus : "pay-offline";
    await supabase
      .from("collections")
      .update({
        status: storedStatus,
        lenco_collection_id: lencoCollectionId ?? null,
        failure_reason: storedStatus === "failed" ? lencoJson.data?.reasonForFailure ?? lencoJson.message ?? null : null,
      })
      .eq("id", collectionRow.id);

    return new Response(JSON.stringify({ ok: true, collectionId: collectionRow.id, status: storedStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await supabase.from("collections").update({ status: "failed", failure_reason: String(err) }).eq("id", collectionRow.id);
    return new Response(JSON.stringify({ error: "Failed to reach Lenco", detail: String(err) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
