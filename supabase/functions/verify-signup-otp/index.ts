// Verifies the OTP sent by request-signup-otp during landlord sign-up. On success, the client is
// trusted to proceed with supabase.auth.signUp() for the same phone number in the same browser
// session — there's no account yet to attach a session token to, so (unlike pay-portal's OTP flow)
// this just confirms "yes, that code was correct for that phone" and nothing more.
//
// Deploy:  supabase functions deploy verify-signup-otp
// Invoke:  supabase.functions.invoke("verify-signup-otp", { body: { phone, code } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/otpCrypto.ts";

const MAX_VERIFY_ATTEMPTS = 5;

type VerifyOtpPayload = { phone?: string; code?: string };

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

  const phone = payload.phone?.trim() ?? "";
  const code = payload.code?.trim() ?? "";
  if (!phone || !/^\d{6}$/.test(code)) {
    return new Response(JSON.stringify({ error: "phone and a 6-digit code are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: otpRow, error: otpError } = await supabase
    .from("signup_otp_codes")
    .select("id, code_hash, attempt_count")
    .eq("phone", phone)
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

  const submittedHash = await sha256Hex(`${code}:${phone}`);
  if (submittedHash !== otpRow.code_hash) {
    await supabase.from("signup_otp_codes").update({ attempt_count: otpRow.attempt_count + 1 }).eq("id", otpRow.id);
    return new Response(JSON.stringify({ error: "Incorrect code." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("signup_otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", otpRow.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
