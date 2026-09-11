// Verifies the code sent by request-withdrawal-otp and, on success, issues a short-lived
// confirmationToken scoped to the same `purpose` it was requested for ("withdrawal" or
// "add_recipient", default). This token — not just "a correct code was entered at some point" — is
// what lenco-payout / create-payout-recipient / create-mobile-money-recipient each require and
// re-validate server-side (matching both the token AND the purpose) before doing anything sensitive,
// so a client that calls one of those directly, or reuses a token issued for the other purpose,
// still can't trigger the action. The token is single-use: the consuming function clears
// confirmation_token_hash the moment it's spent.
//
// Deploy:  supabase functions deploy verify-withdrawal-otp
// Invoke:  supabase.functions.invoke("verify-withdrawal-otp", { body: { propertyId, code, purpose? } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex, randomSessionToken } from "../_shared/otpCrypto.ts";

const MAX_VERIFY_ATTEMPTS = 5;
const CONFIRMATION_TTL_MINUTES = 3;
const PURPOSES = ["withdrawal", "add_recipient"];

type VerifyPayload = { propertyId?: string; code?: string; purpose?: string };

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
  const purpose = payload.purpose?.trim() || "add_recipient";
  if (!propertyId || !/^\d{6}$/.test(code) || !PURPOSES.includes(purpose)) {
    return new Response(JSON.stringify({ error: "propertyId, a 6-digit code, and a valid purpose are required" }), {
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
    .eq("purpose", purpose)
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

  const submittedHash = await sha256Hex(`${code}:${propertyId}:${purpose}`);
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
