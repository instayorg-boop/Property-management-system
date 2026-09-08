// Verifies the OTP sent by pay-portal-request-otp and, on success, issues a portal_sessions token.
// That token is what pay_portal_get_tenant_v2 / pay_portal_get_ledger_v2 / pay_portal_log_payment_v2
// require — this is the actual identity-proof boundary, not just a UI gate.
//
// Deploy:  supabase functions deploy pay-portal-verify-otp
// Invoke:  supabase.functions.invoke("pay-portal-verify-otp", { body: { propertySlug, tenantId, code } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex, randomSessionToken } from "../_shared/otpCrypto.ts";

const SESSION_TTL_MINUTES = 30;
const MAX_VERIFY_ATTEMPTS = 5;

type VerifyOtpPayload = { propertySlug?: string; tenantId?: string; code?: string };

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: VerifyOtpPayload;
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
  const code = payload.code?.trim() ?? "";
  if (!propertySlug || !tenantId || !/^\d{6}$/.test(code)) {
    return new Response(JSON.stringify({ error: "propertySlug, tenantId and a 6-digit code are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: property } = await supabase.from("properties").select("id").eq("slug", propertySlug).maybeSingle();
  if (!property) {
    return new Response(JSON.stringify({ error: "Incorrect code." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: otpRow, error: otpError } = await supabase
    .from("portal_otp_codes")
    .select("id, code_hash, attempt_count")
    .eq("tenant_id", tenantId)
    .eq("property_id", property.id)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpError || !otpRow) {
    return new Response(JSON.stringify({ error: "That code has expired. Request a new one." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (otpRow.attempt_count >= MAX_VERIFY_ATTEMPTS) {
    return new Response(JSON.stringify({ error: "Too many incorrect attempts. Request a new code." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const submittedHash = await sha256Hex(`${code}:${tenantId}`);
  if (submittedHash !== otpRow.code_hash) {
    await supabase.from("portal_otp_codes").update({ attempt_count: otpRow.attempt_count + 1 }).eq("id", otpRow.id);
    return new Response(JSON.stringify({ error: "Incorrect code." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("portal_otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", otpRow.id);

  const sessionToken = randomSessionToken();
  const tokenHash = await sha256Hex(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: sessionError } = await supabase
    .from("portal_sessions")
    .insert({ tenant_id: tenantId, property_id: property.id, token_hash: tokenHash, expires_at: expiresAt });

  if (sessionError) {
    return new Response(JSON.stringify({ error: "Verified, but failed to start a session. Try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, sessionToken, expiresAt }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
