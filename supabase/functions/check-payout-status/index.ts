// Fallback for a bank-transfer payout that never resolved past "processing" — the only thing that
// normally moves a payouts row to "successful"/"failed" is lenco-webhook, and if the webhook isn't
// registered with Lenco (or a delivery gets lost), the row sits at "processing" forever with no
// way for the landlord to find out what actually happened, even though Lenco itself knows.
//
// Mirrors pay-portal-check-collection's approach for mobile-money collections: requery Lenco's own
// status endpoint for the transfer (same v2 shape as /collections/status/{reference}) and apply
// whatever it says, same as the webhook would have. Scoped to the caller's own session throughout
// (RLS), not service role — the landlord can only ever check their own property's payouts.
//
// Deploy:  supabase functions deploy check-payout-status
// Invoke:  supabase.functions.invoke("check-payout-status", { body: { payoutId } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { payoutId?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payoutId = payload.payoutId?.trim() ?? "";
  if (!payoutId) {
    return new Response(JSON.stringify({ error: "payoutId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: "LENCO_SECRET_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Scoped to the caller's own session — RLS guarantees this only ever reads/writes a payout
  // belonging to a property they own.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: payout, error: fetchError } = await supabase
    .from("payouts")
    .select("id, status, failure_reason")
    .eq("id", payoutId)
    .maybeSingle();

  if (fetchError || !payout) {
    return new Response(JSON.stringify({ error: "Couldn't find that payout." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (payout.status === "successful" || payout.status === "failed") {
    return new Response(JSON.stringify({ ok: true, status: payout.status, failureReason: payout.failure_reason }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let lencoStatus: string | undefined;
  let reasonForFailure: string | null = null;
  let lencoTransactionId: string | undefined;

  try {
    const lencoResponse = await fetch(`https://api.lenco.co/access/v2/transfers/status/${payout.id}`, {
      headers: { Authorization: `Bearer ${lencoSecretKey}`, accept: "application/json" },
    });
    const lencoJson = await lencoResponse.json();
    if (lencoResponse.ok && lencoJson?.data) {
      lencoStatus = lencoJson.data.status;
      reasonForFailure = lencoJson.data.reasonForFailure ?? lencoJson.data.failure_reason ?? null;
      lencoTransactionId = lencoJson.data.id;
    }
  } catch (err) {
    console.error("[check-payout-status] failed to reach Lenco", err);
  }

  if (lencoStatus !== "successful" && lencoStatus !== "failed") {
    return new Response(JSON.stringify({ ok: true, status: payout.status, failureReason: payout.failure_reason }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase
    .from("payouts")
    .update({
      status: lencoStatus,
      lenco_transaction_id: lencoTransactionId ?? undefined,
      failure_reason: lencoStatus === "failed" ? reasonForFailure : null,
    })
    .eq("id", payout.id)
    .in("status", ["pending", "processing"]);

  return new Response(
    JSON.stringify({ ok: true, status: lencoStatus, failureReason: lencoStatus === "failed" ? reasonForFailure : null }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
