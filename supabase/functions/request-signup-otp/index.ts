// Sends a 6-digit OTP to a phone number entered during landlord sign-up (GetStarted.tsx), before
// any account exists yet — there's no session to authenticate this call with, so (like
// pay-portal-request-otp) it runs entirely on the service-role key, keyed by the phone number
// itself rather than a tenant/user id.
//
// Deploy:  supabase functions deploy request-signup-otp
// Invoke:  supabase.functions.invoke("request-signup-otp", { body: { phone } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex, randomOtpCode, maskPhone } from "../_shared/otpCrypto.ts";
import { sendSms } from "../_shared/sms.ts";

const OTP_TTL_MINUTES = 5;
const MAX_REQUESTS_PER_HOUR = 5;

type RequestOtpPayload = { phone?: string };

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

  const phone = payload.phone?.trim() ?? "";
  if (phone.replace(/\D/g, "").length < 7) {
    return new Response(JSON.stringify({ error: "Enter a valid phone number." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentRequestCount } = await supabase
    .from("signup_otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", oneHourAgo);

  if ((recentRequestCount ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return new Response(JSON.stringify({ error: "Too many code requests. Try again in a bit." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const code = randomOtpCode();
  const codeHash = await sha256Hex(`${code}:${phone}`);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("signup_otp_codes")
    .insert({ phone, code_hash: codeHash, expires_at: expiresAt });
  if (insertError) {
    return new Response(JSON.stringify({ error: "Failed to generate a code", detail: insertError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await sendSms(phone, `Your Instay Manage verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`);
  if (!result.ok) {
    console.error("[request-signup-otp] failed to send SMS", result.reason, result.detail);
    return new Response(JSON.stringify({ error: "Failed to send the code. Try again shortly." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, maskedPhone: maskPhone(phone), devCode: result.dev ? code : undefined }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
