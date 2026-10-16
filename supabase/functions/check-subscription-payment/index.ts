// Polls Lenco directly for a subscription payment's real status — there's no webhook wired for
// this collection type yet (see generate-subscription-invoices' top comment), so the Billing page
// calls this a few times after "Pay now" while the row sits pending/pay-offline, same UX pattern
// pay-portal-check-collection already gives tenants on the payment portal.
//
// Deploy:  supabase functions deploy check-subscription-payment
// Invoke:  supabase.functions.invoke("check-subscription-payment", { body: { paymentId } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { checkSubscriptionPayment } from "../_shared/subscriptionCollect.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { paymentId?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const paymentId = payload.paymentId?.trim() ?? "";
  if (!paymentId) {
    return new Response(JSON.stringify({ error: "paymentId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Confirm the caller actually owns this payment before polling/mutating it on their behalf.
  const scopedClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: payment } = await scopedClient.from("subscription_payments").select("id, status").eq("id", paymentId).maybeSingle();
  if (!payment) {
    return new Response(JSON.stringify({ error: "We couldn't find that payment" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await checkSubscriptionPayment(serviceClient, paymentId);

  const { data: fresh } = await scopedClient.from("subscription_payments").select("status, failure_reason").eq("id", paymentId).maybeSingle();

  return new Response(JSON.stringify({ ok: true, status: fresh?.status ?? payment.status, failureReason: fresh?.failure_reason ?? null }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
