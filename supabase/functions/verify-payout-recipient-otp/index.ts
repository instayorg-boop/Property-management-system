// Verifies the OTP sent by request-payout-recipient-otp and, on success, saves the phone number as
// a mobile-money payout recipient. There is no confirmed Lenco API to resolve a mobile-money
// account holder's name (see the migration's file comment), so this OTP is the verification —
// there's no separate "resolved name" step the way bank accounts get one. A security-alert email is
// sent to the property's registered account email once the recipient is actually saved, so adding a
// new payout destination is never silent even if the phone OTP alone was somehow compromised.
//
// Deploy:  supabase functions deploy verify-payout-recipient-otp
// Invoke:  supabase.functions.invoke("verify-payout-recipient-otp", { body: { propertyId, phoneNumber, code, provider } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/otpCrypto.ts";
import { sendEmail } from "../_shared/email.ts";

const MAX_VERIFY_ATTEMPTS = 5;
const PROVIDERS = ["mtn", "airtel", "zamtel"];

type VerifyOtpPayload = { propertyId?: string; phoneNumber?: string; code?: string; provider?: string };

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

  const propertyId = payload.propertyId?.trim() ?? "";
  const phoneNumber = payload.phoneNumber?.trim() ?? "";
  const code = payload.code?.trim() ?? "";
  const provider = payload.provider?.trim().toLowerCase() ?? "";

  if (!propertyId || !phoneNumber || !/^\d{6}$/.test(code) || !PROVIDERS.includes(provider)) {
    return new Response(
      JSON.stringify({ error: "propertyId, phoneNumber, a 6-digit code, and a valid provider are all required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Scoped to the caller's own session — the payout_recipients insert below runs under
  // payout_recipients_insert RLS, so this can never save a recipient for a property they don't own.
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
    .from("payout_recipient_otp_codes")
    .select("id, code_hash, attempt_count")
    .eq("property_id", propertyId)
    .eq("phone_number", phoneNumber)
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

  const submittedHash = await sha256Hex(`${code}:${propertyId}:${phoneNumber}`);
  if (submittedHash !== otpRow.code_hash) {
    await supabase.from("payout_recipient_otp_codes").update({ attempt_count: otpRow.attempt_count + 1 }).eq("id", otpRow.id);
    return new Response(JSON.stringify({ error: "Incorrect code." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("payout_recipient_otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", otpRow.id);

  // First recipient ever for this property defaults to being the one payouts use; later additions
  // stay non-default until the landlord explicitly switches, via setDefaultPayoutRecipient.
  const { count: existingCount } = await sessionClient
    .from("payout_recipients")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);

  const { data: recipient, error: insertError } = await sessionClient
    .from("payout_recipients")
    .insert({
      property_id: propertyId,
      type: "mobile-money",
      phone_number: phoneNumber,
      provider,
      is_default: (existingCount ?? 0) === 0,
    })
    .select()
    .single();

  if (insertError || !recipient) {
    return new Response(JSON.stringify({ error: "Verified, but failed to save the payout method.", detail: insertError?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: settingsRow } = await sessionClient
    .from("settings")
    .select("account_email")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (settingsRow?.account_email) {
    try {
      await sendEmail(
        settingsRow.account_email,
        "A new payout method was added to your account",
        `A ${provider.toUpperCase()} mobile money number ending in ${phoneNumber.slice(-4)} was just added as a payout destination on your Instay account. If this wasn't you, remove it in Settings > Bank & payouts right away.`
      );
    } catch (err) {
      // The recipient is already saved — a failed alert email shouldn't undo that or fail the
      // request, just log it so it's visible in function logs.
      console.error("[verify-payout-recipient-otp] failed to send security alert email", String(err));
    }
  }

  return new Response(JSON.stringify({ ok: true, recipient }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
