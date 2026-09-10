// Fallback for pay_portal_get_collection_status: that RPC only ever reads our own `collections`
// row, which is only written by lenco-webhook — if the webhook never arrives (not registered with
// Lenco yet, delivery failure, etc.) a collection sits at "pay-offline" forever with nothing to
// show the tenant, even after they've approved or declined on their phone.
//
// Lenco's own docs recommend this exact fallback: "listen for webhook notification or requery the
// collection request status endpoint at interval" — GET /access/v2/collections/status/{reference},
// where {reference} is the value we sent as `reference` in the original collect-payment call
// (our collections.id). This function does that requery, and — same as the webhook — applies the
// result to our `collections` row and marks the tenant paid on success, so whichever of the two
// (webhook or this) lands first wins and the other becomes a no-op.
//
// Deploy:  supabase functions deploy pay-portal-check-collection
// Invoke:  supabase.functions.invoke("pay-portal-check-collection", { body: { tenantId, collectionId, sessionToken } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

type CheckPayload = {
  tenantId?: string;
  collectionId?: string;
  sessionToken?: string;
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: CheckPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tenantId = payload.tenantId?.trim() ?? "";
  const collectionId = payload.collectionId?.trim() ?? "";
  const sessionToken = payload.sessionToken?.trim() ?? "";

  if (!tenantId || !collectionId || !sessionToken) {
    return new Response(JSON.stringify({ error: "tenantId, collectionId and sessionToken are all required" }), {
      status: 400,
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

  const { data: collectionRow, error: fetchError } = await supabase
    .from("collections")
    .select("id, tenant_id, amount, status, failure_reason")
    .eq("id", collectionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchError || !collectionRow) {
    return new Response(JSON.stringify({ error: "Couldn't find that payment." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Already resolved (by the webhook, or an earlier requery) — nothing to do.
  if (collectionRow.status === "successful" || collectionRow.status === "failed") {
    return new Response(
      JSON.stringify({ ok: true, status: collectionRow.status, failureReason: collectionRow.failure_reason }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let lencoStatus: string | undefined;
  let reasonForFailure: string | null = null;
  let lencoCollectionId: string | undefined;

  try {
    const lencoResponse = await fetch(`https://api.lenco.co/access/v2/collections/status/${collectionRow.id}`, {
      headers: { Authorization: `Bearer ${lencoSecretKey}`, accept: "application/json" },
    });
    const lencoJson = await lencoResponse.json();
    if (lencoResponse.ok && lencoJson?.data) {
      lencoStatus = lencoJson.data.status;
      reasonForFailure = lencoJson.data.reasonForFailure ?? null;
      lencoCollectionId = lencoJson.data.id;
    }
  } catch (err) {
    console.error("[pay-portal-check-collection] failed to reach Lenco", err);
  }

  if (lencoStatus !== "successful" && lencoStatus !== "failed") {
    // Still pending/pay-offline (or Lenco didn't answer) — report current state, unchanged.
    return new Response(
      JSON.stringify({ ok: true, status: collectionRow.status, failureReason: collectionRow.failure_reason }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Guard against a race with lenco-webhook landing at the same moment: only apply this update (and
  // only credit the tenant) if the row is still in a non-terminal state.
  const { data: updatedRows } = await supabase
    .from("collections")
    .update({
      status: lencoStatus,
      lenco_collection_id: lencoCollectionId ?? null,
      failure_reason: lencoStatus === "failed" ? reasonForFailure : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", collectionRow.id)
    .in("status", ["pending", "pay-offline"])
    .select("id");

  if (updatedRows && updatedRows.length > 0 && lencoStatus === "successful") {
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
        status: "paid",
        method: "mobile-money",
        source: "lenco",
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, status: lencoStatus, failureReason: lencoStatus === "failed" ? reasonForFailure : null }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
