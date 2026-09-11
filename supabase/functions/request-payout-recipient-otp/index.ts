// Sends a 6-digit OTP to a phone number the landlord is trying to add as a mobile-money payout
// recipient — proves they actually control that number before it's saved as somewhere rent money
// could go. Same SMS mechanics as pay-portal-request-otp, but scoped to property_id + phone_number
// instead of tenant_id, since there's no tenant involved here (see the migration's file comment for
// why mobile-money recipients are verified this way instead of a bank-style name resolution).
//
// Deploy:  supabase functions deploy request-payout-recipient-otp
// Invoke:  supabase.functions.invoke("request-payout-recipient-otp", { body: { propertyId, phoneNumber } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex, randomOtpCode, maskPhone } from "../_shared/otpCrypto.ts";
import { toE164Zambia } from "../_shared/phone.ts";

const OTP_TTL_MINUTES = 5;
const MAX_REQUESTS_PER_HOUR = 3;

type RequestOtpPayload = { propertyId?: string; phoneNumber?: string };

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

  const propertyId = payload.propertyId?.trim() ?? "";
  const phoneNumber = payload.phoneNumber?.trim() ?? "";
  if (!propertyId || !phoneNumber) {
    return new Response(JSON.stringify({ error: "propertyId and phoneNumber are required" }), {
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

  // Scoped to the caller's own session — this SELECT only succeeds if they actually own propertyId
  // (payout_recipients_select-style RLS on properties itself), so an arbitrary propertyId can't be
  // used to send an OTP tied to someone else's property.
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

  // payout_recipient_otp_codes has RLS enabled with no policies (see the migration) — only this
  // service-role client can read/write it.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentRequestCount } = await supabase
    .from("payout_recipient_otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("phone_number", phoneNumber)
    .gte("created_at", oneHourAgo);

  if ((recentRequestCount ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return new Response(JSON.stringify({ error: "Too many code requests. Try again in a bit." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const code = randomOtpCode();
  const codeHash = await sha256Hex(`${code}:${propertyId}:${phoneNumber}`);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("payout_recipient_otp_codes")
    .insert({ property_id: propertyId, phone_number: phoneNumber, code_hash: codeHash, expires_at: expiresAt });

  if (insertError) {
    return new Response(JSON.stringify({ error: "Failed to generate a code", detail: insertError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const atApiKey = Deno.env.get("AT_API_KEY");
  const atUsername = Deno.env.get("AT_USERNAME") || "sandbox";

  if (!atApiKey) {
    console.log(`[request-payout-recipient-otp] placeholder — no AT_API_KEY set, code for ${phoneNumber} is ${code} (dev-only, not sent)`);
    return new Response(JSON.stringify({ ok: true, maskedPhone: maskPhone(phoneNumber), devCode: code }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const smsResponse = await fetch(
      atUsername === "sandbox" ? "https://api.sandbox.africastalking.com/version1/messaging" : "https://api.africastalking.com/version1/messaging",
      {
        method: "POST",
        headers: { apiKey: atApiKey, "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          username: atUsername,
          to: toE164Zambia(phoneNumber),
          message: `Your Instay payout verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
        }),
      }
    );
    const smsResponseText = await smsResponse.text();
    let smsRecipientStatus: string | undefined;
    try {
      smsRecipientStatus = JSON.parse(smsResponseText)?.SMSMessageData?.Recipients?.[0]?.status;
    } catch {
      // non-JSON body — leave smsRecipientStatus undefined, handled below
    }
    if (!smsResponse.ok || (smsRecipientStatus && smsRecipientStatus !== "Success")) {
      console.error("[request-payout-recipient-otp] Africa's Talking rejected the SMS", smsResponse.status, smsResponseText);
      return new Response(
        JSON.stringify({ error: "Failed to send the code. Try again shortly.", detail: smsResponseText, atStatus: smsResponse.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("[request-payout-recipient-otp] failed to reach Africa's Talking", String(err));
    return new Response(JSON.stringify({ error: "Failed to send the code. Try again shortly." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, maskedPhone: maskPhone(phoneNumber) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
