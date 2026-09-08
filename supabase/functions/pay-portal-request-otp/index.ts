// Sends a 6-digit OTP to a tenant's phone via Africa's Talking, as the identity-proof step before
// the tenant payment portal (/pay/:propertySlug/...) reveals any balance data. Picking a name from
// the search screen (pay_portal_search_tenants_v2) only claims an identity — this is what actually
// verifies it, before pay-portal-verify-otp issues a session token that pay_portal_get_tenant_v2 /
// pay_portal_get_ledger_v2 / pay_portal_log_payment_v2 require.
//
// Uses the service-role key (not a forwarded user session — there's no session at this point,
// that's the whole point) to look up the tenant's phone directly, bypassing RLS deliberately and
// carefully: only ever returns a masked phone, never the tenant row itself.
//
// SMS via Africa's Talking sandbox: POST https://api.sandbox.africastalking.com/version1/messaging
// (form-encoded: username, to, message), header apiKey: <AT_API_KEY>. Sandbox username is
// literally "sandbox" unless AT_USERNAME is set otherwise.
//
// Deploy:  supabase functions deploy pay-portal-request-otp
// Invoke:  supabase.functions.invoke("pay-portal-request-otp", { body: { propertySlug, tenantId } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex, randomOtpCode, maskPhone } from "../_shared/otpCrypto.ts";

const OTP_TTL_MINUTES = 5;
const MAX_REQUESTS_PER_HOUR = 3;

type RequestOtpPayload = { propertySlug?: string; tenantId?: string };

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: RequestOtpPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const propertySlug = payload.propertySlug?.trim() ?? "";
  const tenantId = payload.tenantId?.trim() ?? "";
  if (!propertySlug || !tenantId) {
    return new Response(JSON.stringify({ error: "propertySlug and tenantId are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: property } = await supabase.from("properties").select("id").eq("slug", propertySlug).maybeSingle();
  if (!property) {
    return new Response(JSON.stringify({ error: "We couldn't find that account. Check the number and try again." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, phones")
    .eq("id", tenantId)
    .eq("property_id", property.id)
    .eq("active", true)
    .maybeSingle();

  const phone = tenant?.phones?.[0];
  // Deliberately the same error for "no such tenant" and "tenant has no phone on file" — don't
  // let the response shape confirm/deny which one it was.
  if (!tenant || !phone) {
    return new Response(JSON.stringify({ error: "We couldn't send a code for that account. Contact your landlord to update your phone number." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentRequestCount } = await supabase
    .from("portal_otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", oneHourAgo);

  if ((recentRequestCount ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return new Response(JSON.stringify({ error: "Too many code requests. Try again in a bit." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const code = randomOtpCode();
  const codeHash = await sha256Hex(`${code}:${tenantId}`);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("portal_otp_codes")
    .insert({ tenant_id: tenantId, property_id: property.id, code_hash: codeHash, expires_at: expiresAt });

  if (insertError) {
    return new Response(JSON.stringify({ error: "Failed to generate a code", detail: insertError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const atApiKey = Deno.env.get("AT_API_KEY");
  const atUsername = Deno.env.get("AT_USERNAME") || "sandbox";

  if (!atApiKey) {
    console.log(`[pay-portal-request-otp] placeholder — no AT_API_KEY set, code for ${tenantId} is ${code} (dev-only, not sent)`);
    // Same "keep working end-to-end with no real delivery" convention as the other placeholder
    // functions (see supabase/functions/README.md) — surfaced in the response, not just logs,
    // since function logs aren't easily readable outside the dashboard. Never present once
    // AT_API_KEY is actually set (the real SMS path below never includes this).
    return new Response(JSON.stringify({ ok: true, maskedPhone: maskPhone(phone), devCode: code }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } else {
    try {
      const smsResponse = await fetch(
        atUsername === "sandbox" ? "https://api.sandbox.africastalking.com/version1/messaging" : "https://api.africastalking.com/version1/messaging",
        {
          method: "POST",
          headers: {
            apiKey: atApiKey,
            "Content-Type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: new URLSearchParams({
            username: atUsername,
            to: phone,
            message: `Your Instay verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
          }),
        }
      );
      if (!smsResponse.ok) {
        const detail = await smsResponse.text();
        console.error("[pay-portal-request-otp] Africa's Talking rejected the SMS", smsResponse.status, detail);
        // A key is configured but the send genuinely failed — don't tell the tenant a code is on
        // its way when it isn't. The stored code/row is harmless to leave; it'll just expire unused.
        return new Response(JSON.stringify({ error: "Failed to send the code. Try again shortly." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("[pay-portal-request-otp] failed to reach Africa's Talking", String(err));
      return new Response(JSON.stringify({ error: "Failed to send the code. Try again shortly." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, maskedPhone: maskPhone(phone) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
