// The landlord's own "Pay now" button on the Billing page — a manual mobile-money collection of
// IPM's subscription fee for one of their own invoices. Not the tenant-rent flow (that's
// pay-portal-collect-payment) and not the autopay cron (that's generate-subscription-invoices) —
// both share the actual Lenco-calling logic via _shared/subscriptionCollect.ts, but this is the
// one triggered live from the signed-in landlord's own session.
//
// Deploy:  supabase functions deploy pay-subscription-invoice
// Invoke:  supabase.functions.invoke("pay-subscription-invoice", { body: { invoiceId, phone, operator } })

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { invoiceId?: string; phone?: string; operator?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const invoiceId = payload.invoiceId?.trim() ?? "";
  const phone = payload.phone?.trim() ?? "";
  const operator = payload.operator?.trim().toLowerCase() ?? "";
  if (!invoiceId || !phone || !OPERATORS.includes(operator)) {
    return new Response(JSON.stringify({ error: "invoiceId, phone and a valid operator are all required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Scoped to the caller's own session — the select below runs under subscription_invoices_select,
  // so a landlord can never pay (or even see) an invoice belonging to a property they don't own.
  const scopedClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: invoice } = await scopedClient
    .from("subscription_invoices")
    .select("id, property_id, amount, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) {
    return new Response(JSON.stringify({ error: "We couldn't find that invoice" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (invoice.status === "paid") {
    return new Response(JSON.stringify({ error: "That invoice is already paid" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Writes go through the service-role client — subscription_payments has no insert policy for
  // landlords (it's always written by this function or the autopay cron, never directly).
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const result = await collectSubscriptionPayment(serviceClient, {
    invoiceId: invoice.id,
    propertyId: invoice.property_id,
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
