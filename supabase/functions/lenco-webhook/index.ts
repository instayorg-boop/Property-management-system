// Receives payment/payout status webhooks FROM Lenco. This has to be an edge function, not
// client code — Lenco calls this directly over the internet with no browser/session involved, and
// it must verify a signature before trusting anything in the payload.
//
// Verification, per Lenco's docs (Webhooks page):
//   - header `X-Lenco-Signature` = HMAC-SHA512 of the *raw* request body, keyed with a
//     "webhook_hash_key" = SHA256(your API secret key) as a hex string.
//   - Respond 200 fast — Lenco retries every 30 minutes for 24h on anything outside 200/201/202,
//     and may treat a slow response as a timeout, so this does the minimum work before replying.
//
// Handled: transfer.successful / transfer.failed — updates the matching `payouts` row (matched by
// `reference`, which lenco-payout / pay-portal-scheduled-payouts set to the payouts.id they just
// inserted). On failure, releases that payout's claimed collections back to unclaimed via
// pay_portal_release_payout_collections, so the rent isn't stranded waiting on a transfer that
// never went through.
//
// Handled: collection.successful / collection.failed — this is NOT the only place a collection
// gets confirmed: pay-portal-check-collection polls Lenco's status endpoint directly as a
// fallback for when this webhook never arrives at all (not yet registered, delivery failure,
// etc). Both paths call the SAME reconcileSuccessfulCollection (../_shared/reconcileCollection.ts)
// so they can't drift into different accounting logic again, and both guard their `collections`
// status update with `.in("status", ["pending", "pay-offline"])` — whichever path lands first
// flips the row to a terminal state and runs reconciliation exactly once; if the other path
// arrives afterward (a legitimate case: Lenco retries webhooks, or both paths race close
// together), its update matches zero rows and it skips reconciliation entirely rather than
// double-crediting the ledger, double-decrementing owed_amount, or double-incrementing
// property_balances.
//
// collection.settled / transaction.* are logged but not acted on — settlement confirms money
// already reflected as "successful" actually reached the account, no further tenant-facing state
// change needed.
//
// Register this function's URL with Lenco by emailing support@lenco.co (per their docs — there's
// no self-serve webhook URL setting).
//
// Deploy:  supabase functions deploy lenco-webhook --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { reconcileSuccessfulCollection } from "../_shared/reconcileCollection.ts";

type LencoEvent = {
  event: "transfer.successful" | "transfer.failed" | "collection.successful" | "collection.failed" | string;
  data: {
    id: string;
    reference: string | null;
    reasonForFailure: string | null;
    status: "pending" | "successful" | "failed" | "pay-offline";
  };
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha512Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) {
    console.log("[lenco-webhook] LENCO_SECRET_KEY not set — can't verify signature, ignoring payload");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-lenco-signature");
  const webhookHashKey = await sha256Hex(lencoSecretKey);
  const expectedSignature = await hmacSha512Hex(webhookHashKey, rawBody);

  if (!signature || signature !== expectedSignature) {
    console.log("[lenco-webhook] signature mismatch — rejecting");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let event: LencoEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (event.event === "transfer.successful" || event.event === "transfer.failed") {
    const { data } = event;
    const status = event.event === "transfer.successful" ? "successful" : "failed";
    const matchColumn = data.reference ? "id" : "lenco_transaction_id";
    const matchValue = data.reference ?? data.id;

    const { data: payoutRow, error } = await supabase
      .from("payouts")
      .update({
        status,
        lenco_transaction_id: data.id,
        failure_reason: data.reasonForFailure ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq(matchColumn, matchValue)
      .in("status", ["pending", "processing"])
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[lenco-webhook] failed to update payouts row", error.message);
    } else if (status === "failed" && payoutRow) {
      const { error: releaseError } = await supabase.rpc("pay_portal_release_payout_collections", {
        p_payout_id: payoutRow.id,
      });
      if (releaseError) {
        console.error("[lenco-webhook] failed to release collections for failed payout", payoutRow.id, releaseError.message);
      }
    }
  } else if (event.event === "collection.successful" || event.event === "collection.failed") {
    const { data } = event;
    const success = event.event === "collection.successful";
    const matchColumn = data.reference ? "id" : "lenco_collection_id";
    const matchValue = data.reference ?? data.id;

    const { data: updatedRow, error: updateError } = await supabase
      .from("collections")
      .update({
        status: success ? "successful" : "failed",
        lenco_collection_id: data.id,
        failure_reason: data.reasonForFailure ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq(matchColumn, matchValue)
      .in("status", ["pending", "pay-offline"])
      .select("id, tenant_id, property_id, amount, fee_amount, line_items")
      .maybeSingle();

    if (updateError) {
      console.error("[lenco-webhook] failed to update collections row", updateError.message);
    } else if (!updatedRow) {
      console.log("[lenco-webhook] collection already resolved (by this or the polling fallback) — skipping reconciliation", matchColumn, matchValue);
    } else if (success) {
      await reconcileSuccessfulCollection(supabase, updatedRow);
    }
  } else {
    console.log(`[lenco-webhook] received ${event.event} — not acted on`);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
