// Public (no login) mobile-money collection for the subscription payment link a landlord gets by
// SMS, the same Lenco-calling logic pay-subscription-invoice uses for the signed-in "Pay now"
// button, but gated by the property's subscription_pay_token instead of an auth session, so the
// landlord never has to open the dashboard to pay IPM's own fee. Mirrors how a tenant pays rent
// from their own SMS link without signing in either (pay-portal-collect-payment).
//
// Deploy:  supabase functions deploy pay-subscription-collect
// Invoke:  POST { token, phone, operator }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { collectSubscriptionPayment } from "../_shared/subscriptionCollect.ts";

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

  let payload: { token?: string; phone?: string; operator?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = payload.token?.trim().toUpperCase() ?? "";
  const phone = payload.phone?.trim() ?? "";
  const operator = payload.operator?.trim().toLowerCase() ?? "";
  if (!token || !phone || !OPERATORS.includes(operator)) {
    return new Response(JSON.stringify({ error: "token, phone and a valid operator are all required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: settings } = await supabase
    .from("settings")
    .select("property_id")
    .eq("subscription_pay_token", token)
    .maybeSingle();

  if (!settings) {
    return new Response(JSON.stringify({ error: "This link isn't valid anymore." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: invoice } = await supabase
    .from("subscription_invoices")
    .select("id, amount, status")
    .eq("property_id", settings.property_id)
    .neq("status", "paid")
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!invoice) {
    return new Response(JSON.stringify({ error: "Nothing is currently owed on this account." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Same guard the autopay cron uses before it fires: never start a second collection while one
  // from this same link (or the dashboard's own "Pay now") is still in flight.
  const { data: inFlight } = await supabase
    .from("subscription_payments")
    .select("id")
    .eq("invoice_id", invoice.id)
    .in("status", ["pending", "pay-offline"])
    .limit(1)
    .maybeSingle();
  if (inFlight) {
    return new Response(JSON.stringify({ error: "A payment for this invoice is already in progress." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await collectSubscriptionPayment(supabase, {
    invoiceId: invoice.id,
    propertyId: settings.property_id,
    amount: invoice.amount,
    phone,
    operator,
    triggeredBy: "manual",
  });

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, paymentId: result.paymentId, status: result.status }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
