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
// `reference`, which lenco-payout sets to the payouts.id it just inserted).
//
// Handled: collection.successful / collection.failed — updates the matching `collections` row
// (matched by `reference`, which pay-portal-collect-payment sets to the collections.id it just
// inserted) and, on success, marks the tenant paid + inserts a ledger entry directly — this is the
// ONLY place a real tenant payment ever updates the ledger; TenantBalance.tsx's "Pay" button never
// writes to the ledger itself, it just polls collections.status until this webhook lands.
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

  // Service-role client — Lenco calls this with no landlord session, so there's no user JWT to
  // scope an RLS-respecting client with. Every write below is matched against a specific existing
  // payouts row (by reference/lenco_transaction_id), not an open-ended write.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (event.event === "transfer.successful" || event.event === "transfer.failed") {
    const { data } = event;
    const status = event.event === "transfer.successful" ? "successful" : "failed";
    const matchColumn = data.reference ? "id" : "lenco_transaction_id";
    const matchValue = data.reference ?? data.id;

    const { error } = await supabase
      .from("payouts")
      .update({
        status,
        lenco_transaction_id: data.id,
        failure_reason: data.reasonForFailure ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq(matchColumn, matchValue);

    if (error) {
      console.error("[lenco-webhook] failed to update payouts row", error.message);
    }
  } else if (event.event === "collection.successful" || event.event === "collection.failed") {
    const { data } = event;
    const success = event.event === "collection.successful";
    const matchColumn = data.reference ? "id" : "lenco_collection_id";
    const matchValue = data.reference ?? data.id;

    const { data: collectionRow, error: fetchError } = await supabase
      .from("collections")
      .select("id, tenant_id, amount")
      .eq(matchColumn, matchValue)
      .maybeSingle();

    if (fetchError || !collectionRow) {
      console.error("[lenco-webhook] no matching collections row", matchColumn, matchValue, fetchError?.message);
    } else {
      await supabase
        .from("collections")
        .update({
          status: success ? "successful" : "failed",
          lenco_collection_id: data.id,
          failure_reason: data.reasonForFailure ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", collectionRow.id);

      if (success) {
        // Same effect as the old pay_portal_log_payment_v2 (mark paid + insert a ledger entry) —
        // done directly here with the service-role key since this webhook, not a tenant session,
        // is the actual source of truth for "did the money really arrive".
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
          });
        }
      }
    }
  } else {
    console.log(`[lenco-webhook] received ${event.event} — not acted on`);
  }

  // Always 200 once the signature checks out — per Lenco's docs, anything else queues a retry
  // every 30 minutes for 24h, and there's nothing more useful this response body could carry.
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
