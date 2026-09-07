// Receives payment/payout status webhooks FROM Lenco (collections confirmed, transfers settled,
// failures, etc.). This has to be an edge function, not client code — Lenco calls this directly
// over the internet, there's no browser involved, and it needs to verify a webhook signature using
// a secret that must never reach the client.
//
// PLACEHOLDER — no Lenco account is configured yet, so there's nothing calling this. It's created
// now so the URL/shape exists ahead of time and is ready to register with Lenco once connected.
//
// IMPORTANT: deploy this with --no-verify-jwt. Lenco won't send a Supabase auth header — it sends
// its own signature header instead, which this function must verify before trusting the payload.
//
// To make this real:
//   1. Set secrets:  supabase secrets set LENCO_WEBHOOK_SECRET=...
//   2. Verify the signature Lenco sends (check their webhook docs for the exact header name/scheme)
//      before processing anything below.
//   3. On a confirmed rent payment, call a SECURITY DEFINER Postgres function (same pattern as
//      pay_portal_log_payment, see docs/BACKEND.md) to update the tenant's ledger/status — don't
//      write directly with the anon key from here, this function should use the service-role key.
//   4. On a confirmed payout, update / insert into a `payouts` table (see lenco-payout's TODO).
//   5. Register this function's URL with Lenco as the webhook endpoint for your account.
//
// Deploy:  supabase functions deploy lenco-webhook --no-verify-jwt

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

  const webhookSecret = Deno.env.get("LENCO_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.log("[lenco-webhook] placeholder — no LENCO_WEBHOOK_SECRET set, ignoring webhook payload");
    return new Response(JSON.stringify({ ok: true, placeholder: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // TODO: verify Lenco's signature header against webhookSecret before trusting `body`.
  // const signature = req.headers.get("x-lenco-signature");
  // if (!isValidSignature(signature, await req.text(), webhookSecret)) {
  //   return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  // }
  //
  // const event = JSON.parse(body);
  // switch (event.type) {
  //   case "collection.successful": /* call a SECURITY DEFINER SQL fn to log the payment */ break;
  //   case "transaction.successful": /* mark payout as settled */ break;
  // }

  return new Response(JSON.stringify({ ok: true, placeholder: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
