// Tenant-facing payment receipt for manual/cash payments the landlord logs directly (online
// mobile-money payments get this automatically from reconcileCollection.ts — this covers the other
// path). Invoked by TenantsContext.tsx's logPayments right after a manual payment is recorded.
//
// Server-side re-checks everything (frontend state is not a security control): the caller must own
// the tenant's property (enforced via RLS on the forwarded session), and settings.send_payment_
// receipt_sms is re-read here, not trusted from the client.
//
// Deploy:  supabase functions deploy send-payment-receipt-sms
// Invoke:  supabase.functions.invoke("send-payment-receipt-sms", { body: { tenantId, amount } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendPaymentReceiptSms } from "../_shared/paymentReceipt.ts";

type Payload = { tenantId?: string; amount?: number };

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
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tenantId = payload.tenantId?.trim();
  const amount = typeof payload.amount === "number" && Number.isFinite(payload.amount) ? payload.amount : null;
  if (!tenantId || amount === null) {
    return new Response(JSON.stringify({ error: "tenantId and amount are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Bound by the caller's own session — RLS means this simply no-ops for a tenant the caller
  // doesn't own, same pattern as send-tenant-onboarding-sms.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  await sendPaymentReceiptSms(supabase, serviceClient, tenantId, amount);

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
