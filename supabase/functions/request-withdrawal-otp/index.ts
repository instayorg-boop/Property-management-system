// Sends a 6-digit confirmation code to the property's registered account email — the second factor
// required before either of two sensitive actions: actually moving money out (purpose:
// "withdrawal") or adding a new payout destination (purpose: "add_recipient", the default). Both
// share this one function/table rather than duplicating it, but a code and the confirmationToken it
// produces are scoped to the purpose they were requested for — see verify-withdrawal-otp and the
// migration adding the `purpose` column for how that's enforced, and lenco-payout /
// create-payout-recipient / create-mobile-money-recipient for how each consumer checks it.
//
// Deploy:  supabase functions deploy request-withdrawal-otp
// Invoke:  supabase.functions.invoke("request-withdrawal-otp", { body: { propertyId, purpose? } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex, randomOtpCode } from "../_shared/otpCrypto.ts";
import { sendEmail } from "../_shared/email.ts";

const OTP_TTL_MINUTES = 5;
const MAX_REQUESTS_PER_HOUR = 5;
const PURPOSES = ["withdrawal", "add_recipient"];

type RequestPayload = { propertyId?: string; purpose?: string };

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const propertyId = payload.propertyId?.trim() ?? "";
  const purpose = payload.purpose?.trim() || "add_recipient";
  if (!propertyId || !PURPOSES.includes(purpose)) {
    return new Response(JSON.stringify({ error: "propertyId is required, and purpose must be 'withdrawal' or 'add_recipient'" }), {
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
  const { data: settingsRow } = await sessionClient
    .from("settings")
    .select("account_email")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!settingsRow) {
    return new Response(JSON.stringify({ error: "You don't have access to that property." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!settingsRow.account_email) {
    return new Response(JSON.stringify({ error: "Add an account email in Settings first." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // payout_withdrawal_otp_codes has RLS enabled with no policies — only this service-role client
  // can read/write it.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentRequestCount } = await supabase
    .from("payout_withdrawal_otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("purpose", purpose)
    .gte("created_at", oneHourAgo);

  if ((recentRequestCount ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return new Response(JSON.stringify({ error: "Too many code requests. Try again in a bit." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const code = randomOtpCode();
  const codeHash = await sha256Hex(`${code}:${propertyId}:${purpose}`);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("payout_withdrawal_otp_codes")
    .insert({ property_id: propertyId, purpose, code_hash: codeHash, expires_at: expiresAt });
  if (insertError) {
    return new Response(JSON.stringify({ error: "Failed to generate a code", detail: insertError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const subject = purpose === "withdrawal" ? "Confirm your withdrawal" : "Confirm this new payout method";
  const body =
    purpose === "withdrawal"
      ? `Your withdrawal confirmation code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, ignore this email — no money moves without this code.`
      : `Your confirmation code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. Someone is adding a new bank account or mobile money number as a payout destination on your Instay account. If this wasn't you, ignore this email — nothing is added without this code.`;

  try {
    const result = await sendEmail(settingsRow.account_email, subject, body);
    if (result.dev) {
      // Same "no provider configured yet" convention as SMS — hand the code back so the flow can
      // still be exercised end-to-end. Never present once RESEND_API_KEY is actually set.
      return new Response(JSON.stringify({ ok: true, maskedEmail: maskEmail(settingsRow.account_email), devCode: code }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[request-withdrawal-otp] failed to send email", String(err));
    return new Response(JSON.stringify({ error: "Failed to send the code. Try again shortly." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, maskedEmail: maskEmail(settingsRow.account_email) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "••••";
  return `${user.slice(0, 2)}••••@${domain}`;
}
