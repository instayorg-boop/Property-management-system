// Public (no login) status lookup for the subscription payment link a landlord gets by SMS. The
// token is the whole trust boundary, same reasoning as pay-portal-resolve-token for tenants: it
// only ever reaches the landlord via an SMS to their own phone, so there's no separate OTP.
//
// Called twice by the frontend: once to load the page (amount owed, due date), and again every
// few seconds while a payment is in flight to see if it has gone through yet.
//
// Deploy:  supabase functions deploy pay-subscription-get-status
// Invoke:  POST { token }

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

  let payload: { token?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = payload.token?.trim().toUpperCase() ?? "";
  if (!token) {
    return new Response(JSON.stringify({ error: "token is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: settings } = await supabase
    .from("settings")
    .select("property_id, properties(name)")
    .eq("subscription_pay_token", token)
    .maybeSingle();

  if (!settings) {
    return new Response(JSON.stringify({ error: "This link isn't valid anymore." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const propertyName = (settings.properties as { name: string } | null)?.name ?? "Your property";

  const { data: invoice } = await supabase
    .from("subscription_invoices")
    .select("id, amount, due_date, status")
    .eq("property_id", settings.property_id)
    .neq("status", "paid")
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!invoice) {
    return new Response(
      JSON.stringify({ ok: true, propertyName, allPaid: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: latestPayment } = await supabase
    .from("subscription_payments")
    .select("id, status")
    .eq("invoice_id", invoice.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Poll Lenco directly if something's still in flight, same fallback pattern
  // generate-subscription-invoices already uses, since there's no webhook wired for this
  // collection type yet. Keeps the figure the landlord sees current without them refreshing.
  let paymentStatus: string | null = latestPayment?.status ?? null;
  if (latestPayment && ["pending", "pay-offline"].includes(latestPayment.status)) {
    await checkSubscriptionPayment(supabase, latestPayment.id);
    const { data: refreshed } = await supabase
      .from("subscription_payments")
      .select("status")
      .eq("id", latestPayment.id)
      .maybeSingle();
    paymentStatus = refreshed?.status ?? paymentStatus;
  }

  const { data: refreshedInvoice } = await supabase
    .from("subscription_invoices")
    .select("status")
    .eq("id", invoice.id)
    .maybeSingle();

  return new Response(
    JSON.stringify({
      ok: true,
      propertyName,
      allPaid: false,
      amount: invoice.amount,
      dueDate: invoice.due_date,
      invoiceStatus: refreshedInvoice?.status ?? invoice.status,
      paymentId: latestPayment?.id ?? null,
      paymentStatus,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
