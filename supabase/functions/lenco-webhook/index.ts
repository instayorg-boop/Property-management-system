// Receives payment/payout status webhooks FROM Lenco. This has to be an edge function, not
// client code, Lenco calls this directly over the internet with no browser/session involved, and
// it must verify a signature before trusting anything in the payload.
//
// Verification, per Lenco's docs (Webhooks page):
//   - header `X-Lenco-Signature` = HMAC-SHA512 of the *raw* request body, keyed with a
//     "webhook_hash_key" = SHA256(your API secret key) as a hex string.
//   - Respond 200 fast, Lenco retries every 30 minutes for 24h on anything outside 200/201/202.
//
// Handled: transfer.successful / transfer.failed. First tries to match the matching `payouts` row
// (matched by `reference`). On failure, releases that payout's claimed collections back to unclaimed via
// pay_portal_release_payout_collections. If no payout matches, tries `company_revenue_sweeps` instead. On a
// failed sweep, clears swept_at on every row it claimed so the next sweep picks that revenue back up. Every sweep
// result (successful or failed) also emails COMPANY_ALERT_EMAIL.
//
// Lenco's own charge: when the payload carries `fee`, it is stored as lenco_fee on the payout, collection or sweep, so
// the revenue sweep can move real profit (our fee minus Lenco's fee) instead of the whole fee.
//
// Handled: collection.successful / collection.failed, shared with the polling fallback through
// reconcileSuccessfulCollection (../_shared/reconcileCollection.ts), each guarded so reconciliation runs exactly once.
//
// collection.settled / transaction.* are logged but not acted on.
//
// Deploy:  supabase functions deploy lenco-webhook --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { reconcileSuccessfulCollection } from "../_shared/reconcileCollection.ts";
import { alertCompany } from "../_shared/companyAlert.ts";

type LencoEvent = {
  event: "transfer.successful" | "transfer.failed" | "collection.successful" | "collection.failed" | string;
  data: {
    id: string;
    reference: string | null;
    reasonForFailure: string | null;
    status: "pending" | "successful" | "failed" | "pay-offline";
    fee?: string | number | null;
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

// Lenco's charge from the payload, or null when it is absent or not a number.
function lencoFeeOf(data: LencoEvent["data"]): number | null {
  if (data.fee === undefined || data.fee === null || data.fee === "") return null;
  const n = Number(data.fee);
  return Number.isFinite(n) && n >= 0 ? n : null;
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
    console.log("[lenco-webhook] LENCO_SECRET_KEY not set, can't verify signature, ignoring payload");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-lenco-signature");
  const webhookHashKey = await sha256Hex(lencoSecretKey);
  const expectedSignature = await hmacSha512Hex(webhookHashKey, rawBody);

  if (!signature || signature !== expectedSignature) {
    console.log("[lenco-webhook] signature mismatch, rejecting");
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
    const lencoFee = lencoFeeOf(data);

    const { data: payoutRow, error } = await supabase
      .from("payouts")
      .update({
        status,
        lenco_transaction_id: data.id,
        failure_reason: data.reasonForFailure ?? null,
        updated_at: new Date().toISOString(),
        ...(lencoFee !== null ? { lenco_fee: lencoFee } : {}),
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
    } else if (!payoutRow) {
      // No payout matched this transfer, it's most likely the IPM revenue sweep instead.
      const { data: sweepRow, error: sweepError } = await supabase
        .from("company_revenue_sweeps")
        .update({
          status,
          lenco_transaction_id: data.id,
          failure_reason: data.reasonForFailure ?? null,
          updated_at: new Date().toISOString(),
          ...(lencoFee !== null ? { lenco_fee: lencoFee } : {}),
        })
        .eq(matchColumn, matchValue)
        .eq("status", "processing")
        .select("id, amount, collection_ids, payout_ids, subscription_payment_ids")
        .maybeSingle();

      if (sweepError) {
        console.error("[lenco-webhook] failed to update company_revenue_sweeps row", sweepError.message);
      } else if (sweepRow) {
        if (status === "failed") {
          // The transfer never reached the company's bank account, clear swept_at on every row this
          // sweep claimed so the next sweep run picks this revenue back up.
          if (sweepRow.collection_ids?.length) {
            await supabase.from("collections").update({ swept_at: null }).in("id", sweepRow.collection_ids);
          }
          if (sweepRow.payout_ids?.length) {
            await supabase.from("payouts").update({ swept_at: null }).in("id", sweepRow.payout_ids);
          }
          if (sweepRow.subscription_payment_ids?.length) {
            await supabase.from("subscription_payments").update({ swept_at: null }).in("id", sweepRow.subscription_payment_ids);
          }
        }
        const amountText = "K" + Number(sweepRow.amount).toFixed(2);
        await alertCompany(
          status === "successful" ? "Sweep complete" : "Sweep failed",
          status === "successful" ? "Sweep complete" : "Sweep failed",
          status === "successful"
            ? `${amountText} of profit reached the company account.`
            : `The ${amountText} sweep did not reach the company account. The rows go back into the next sweep.`,
          [
            { label: "Amount", value: amountText },
            ...(lencoFee !== null ? [{ label: "Lenco fee", value: "K" + lencoFee.toFixed(2) }] : []),
            ...(data.reasonForFailure ? [{ label: "Reason", value: String(data.reasonForFailure) }] : []),
          ],
        );
      }
    }
  } else if (event.event === "collection.successful" || event.event === "collection.failed") {
    const { data } = event;
    const success = event.event === "collection.successful";
    const matchColumn = data.reference ? "id" : "lenco_collection_id";
    const matchValue = data.reference ?? data.id;
    const lencoFee = lencoFeeOf(data);

    const { data: updatedRow, error: updateError } = await supabase
      .from("collections")
      .update({
        status: success ? "successful" : "failed",
        lenco_collection_id: data.id,
        failure_reason: data.reasonForFailure ?? null,
        updated_at: new Date().toISOString(),
        ...(success && lencoFee !== null ? { lenco_fee: lencoFee } : {}),
      })
      .eq(matchColumn, matchValue)
      .in("status", success ? ["pending", "pay-offline", "failed"] : ["pending", "pay-offline"])
      .select("id, tenant_id, property_id, amount, fee_amount, line_items")
      .maybeSingle();

    if (updateError) {
      console.error("[lenco-webhook] failed to update collections row", updateError.message);
    } else if (!updatedRow) {
      console.log("[lenco-webhook] collection already resolved (by this or the polling fallback), skipping reconciliation", matchColumn, matchValue);
    } else if (success) {
      await reconcileSuccessfulCollection(supabase, updatedRow);
    }
  } else {
    console.log(`[lenco-webhook] received ${event.event}, not acted on`);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
