// Verifies the code sent by request-withdrawal-otp and, on success, issues a short-lived
// confirmationToken. This token — not just "a correct code was entered at some point" — is what
// lenco-payout requires and re-validates server-side before it will move any money, so a client
// that calls lenco-payout directly without ever going through this verification still can't trigger
// a real transfer. The token is single-use: lenco-payout clears confirmation_token_hash the moment
// it's spent.
//
// Deploy:  supabase functions deploy verify-withdrawal-otp
// Invoke:  supabase.functions.invoke("verify-withdrawal-otp", { body: { propertyId, code } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex, randomSessionToken } from "../_shared/otpCrypto.ts";

const MAX_VERIFY_ATTEMPTS = 5;
const CONFIRMATION_TTL_MINUTES = 3;

type VerifyPayload = { propertyId?: string; code?: string };

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: VerifyPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const propertyId = payload.propertyId?.trim() ?? "";
  const code = payload.code?.trim() ?? "";
  if (!propertyId || !/^\d{6}$/.test(code)) {
    return new Response(JSON.stringify({ error: "propertyId and a 6-digit code are required" }), {
      status: 400,
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

  const sessionClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: property } = await sessionClient.from("properties").select("id").eq("id", propertyId).maybeSingle();
  if (!property) {
    return new Response(JSON.stringify({ error: "You don't have access to that property." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: otpRow, error: otpError } = await supabase
    .from("payout_withdrawal_otp_codes")
    .select("id, code_hash, attempt_count")
    .eq("property_id", propertyId)
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

  const submittedHash = await sha256Hex(`${code}:${propertyId}`);
  if (submittedHash !== otpRow.code_hash) {
    await supabase.from("payout_withdrawal_otp_codes").update({ attempt_count: otpRow.attempt_count + 1 }).eq("id", otpRow.id);
    return new Response(JSON.stringify({ error: "Incorrect code." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const confirmationToken = randomSessionToken();
  const confirmationTokenHash = await sha256Hex(confirmationToken);
  const confirmationExpiresAt = new Date(Date.now() + CONFIRMATION_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: updateError } = await supabase
    .from("payout_withdrawal_otp_codes")
    .update({
      consumed_at: new Date().toISOString(),
      confirmation_token_hash: confirmationTokenHash,
      confirmation_expires_at: confirmationExpiresAt,
    })
    .eq("id", otpRow.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: "Verified, but failed to issue a confirmation. Try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, confirmationToken, expiresAt: confirmationExpiresAt }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
