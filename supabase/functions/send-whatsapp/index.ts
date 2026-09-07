// Sends an invoice/reminder message via the WhatsApp Business Cloud API.
//
// PLACEHOLDER — no WhatsApp Business account is configured yet. This exists so the app has a real
// call site to invoke (src/landlord/invoiceUtils.ts's sendInvoiceViaWhatsApp) instead of a fake
// setTimeout, and so the shape of the request/response is settled ahead of time.
//
// To make this real:
//   1. Get a WhatsApp Business Cloud API phone number + permanent access token from Meta.
//   2. Set secrets:  supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=...
//   3. Replace the stub block below with a fetch() to
//      https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
//      using WHATSAPP_TOKEN as a Bearer token, sending a template message (invoices need an
//      approved template, not free-form text, outside the 24h customer-service window).
//
// Deploy:  supabase functions deploy send-whatsapp
// Invoke from the app:  supabase.functions.invoke("send-whatsapp", { body: { phone, tenantName, propertyName, invoiceNumber, total, dueDate } })

import { corsHeaders, handleOptions } from "../_shared/cors.ts";

type SendWhatsAppPayload = {
  phone: string;
  tenantName: string;
  propertyName: string;
  invoiceNumber: string;
  total: number;
  dueDate: string;
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

  let payload: SendWhatsAppPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!payload.phone) {
    return new Response(JSON.stringify({ error: "phone is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const whatsappToken = Deno.env.get("WHATSAPP_TOKEN");
  const whatsappPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!whatsappToken || !whatsappPhoneNumberId) {
    // Not configured yet — succeed as a no-op rather than breaking the invoice-send flow the UI
    // already depends on. Remove this branch once real credentials are set.
    console.log("[send-whatsapp] placeholder — no WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID set, skipping real send", payload);
    return new Response(JSON.stringify({ ok: true, placeholder: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // TODO: real send once WhatsApp Business is connected.
  // const waResponse = await fetch(`https://graph.facebook.com/v20.0/${whatsappPhoneNumberId}/messages`, {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${whatsappToken}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({
  //     messaging_product: "whatsapp",
  //     to: payload.phone,
  //     type: "template",
  //     template: { name: "invoice_ready", language: { code: "en" }, components: [...] },
  //   }),
  // });
  // const waResult = await waResponse.json();
  // if (!waResponse.ok) return new Response(JSON.stringify({ error: waResult }), { status: 502, headers: corsHeaders });

  return new Response(JSON.stringify({ ok: true, placeholder: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
