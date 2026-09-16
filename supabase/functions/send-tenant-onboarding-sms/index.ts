// Sends a one-time welcome SMS to a newly-added tenant: a first-name greeting, the property name,
// and their portal link. Invoked by the landlord dashboard (AddTenant.tsx) right after the tenant
// insert succeeds — but the frontend toggle is not a security control, so everything that decides
// whether to actually send is re-checked here, server-side, against the DB:
//   settings.send_onboarding_sms = true
//   AND tenants.onboarding_sms_sent_at IS NULL   (idempotency — never send twice)
//   AND tenant has a phone on file
//   AND the tenant belongs to a property the calling landlord owns (enforced by forwarding the
//       caller's own session to a client bound by RLS, same pattern as create-payout-recipient)
//
// onboarding_sms_sent_at is only set AFTER the provider send succeeds (or in dev mode) — a failed
// send must remain retryable, not silently marked as done.
//
// Deploy:  supabase functions deploy send-tenant-onboarding-sms
// Invoke:  supabase.functions.invoke("send-tenant-onboarding-sms", { body: { tenantId } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendSms } from "../_shared/sms.ts";
import { withinDailySmsCap } from "../_shared/smsCap.ts";

type Payload = { tenantId?: string };

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
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "tenantId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Bound by the caller's own session — RLS (tenants_select/settings_select, both scoped to
  // `properties.owner_id = auth.uid()`) means this simply returns nothing for a tenant the caller
  // doesn't own, rather than needing an explicit ownership check here.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  // increment_sms_daily_counter's EXECUTE is revoked from authenticated/anon (see
  // 20260926000000_notification_digests.sql) so a landlord can't bump another property's cap
  // counter via RPC — the cap check itself needs the service-role client.
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, phones, rent_amount, due_day, portal_token, onboarding_sms_sent_at, property_id, properties(name)")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    return new Response(JSON.stringify({ error: "Tenant not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (tenant.onboarding_sms_sent_at) {
    return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const phone = tenant.phones?.[0];
  if (!phone) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_phone" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("send_onboarding_sms")
    .eq("property_id", tenant.property_id)
    .maybeSingle();

  if (settings && settings.send_onboarding_sms === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "disabled" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const property = tenant.properties as unknown as { name: string } | null;
  const portalLink = `https://pay.instay.co/p/${tenant.portal_token}`;
  const message = `Hi ${firstName(tenant.name)}, welcome to ${property?.name ?? "your new home"}, glad to have you with us. Use this link for future payments: ${portalLink}`;

  if (!(await withinDailySmsCap(serviceClient, tenant.property_id))) {
    await supabase.from("sms_send_log").insert({ property_id: tenant.property_id, recipient_phone: phone, category: "onboarding", status: "skipped_cap", message });
    return new Response(JSON.stringify({ ok: true, skipped: "daily_cap" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await sendSms(phone, message);
  await supabase.from("sms_send_log").insert({ property_id: tenant.property_id, recipient_phone: phone, category: "onboarding", status: result.ok ? "sent" : "failed", message });

  if (!result.ok) {
    console.error("[send-tenant-onboarding-sms] send failed", tenantId, result.reason, result.detail);
    return new Response(JSON.stringify({ error: "Failed to send the welcome SMS", detail: result.detail }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("tenants").update({ onboarding_sms_sent_at: new Date().toISOString() }).eq("id", tenantId);

  return new Response(JSON.stringify({ ok: true, dev: "dev" in result ? result.dev : undefined }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

/** First word of the tenant's full name — see send-rent-reminders' identical helper for why this
 * isn't a real first_name/last_name column. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}
