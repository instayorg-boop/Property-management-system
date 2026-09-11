// Saves a mobile money number as a payout recipient, after the caller has already resolved its
// account holder name via resolve-mobile-money and had the landlord confirm it — same two-step
// shape as the bank flow (resolve-bank-account -> create-payout-recipient). No Lenco
// transfer-recipient creation call here: Lenco's mobile-money transfer endpoint takes phone +
// operator directly (see lenco-payout's file comment) rather than needing a pre-registered
// recipient id the way bank transfers do.
//
// Auth: request is made with the caller's own session (forwarded via Authorization), so the insert
// runs under their RLS policy — payout_recipients_insert only allows rows where property_id belongs
// to a property they own.
//
// `confirmationToken` (purpose "add_recipient") is required and re-validated here, same boundary
// create-payout-recipient applies — see that file's comment for why adding a recipient gets this
// treatment rather than just an after-the-fact alert email.
//
// Deploy:  supabase functions deploy create-mobile-money-recipient
// Invoke:  supabase.functions.invoke("create-mobile-money-recipient", { body: { propertyId, phoneNumber, provider, accountName, confirmationToken } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { sha256Hex } from "../_shared/otpCrypto.ts";

const PROVIDERS = ["mtn", "airtel", "zamtel"];

type CreatePayload = {
  propertyId?: string;
  phoneNumber?: string;
  provider?: string;
  accountName?: string;
  confirmationToken?: string;
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: CreatePayload;
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
  const provider = payload.provider?.trim().toLowerCase() ?? "";
  const accountName = payload.accountName?.trim() ?? "";
  const confirmationToken = payload.confirmationToken?.trim() ?? "";

  if (!propertyId || phoneNumber.length < 9 || !PROVIDERS.includes(provider) || !accountName) {
    return new Response(
      JSON.stringify({ error: "propertyId, phoneNumber, a valid provider, and accountName are all required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!confirmationToken) {
    return new Response(JSON.stringify({ error: "A confirmation is required — verify the code emailed to your account first." }), {
      status: 401,
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

  // Scoped to the caller's own session — the insert below runs under their RLS policy, so this can
  // never write a payout recipient for a property they don't own.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  // The actual authorization check — see this file's top comment.
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const confirmationTokenHash = await sha256Hex(confirmationToken);
  const { data: burnedConfirmation } = await serviceClient
    .from("payout_withdrawal_otp_codes")
    .update({ confirmation_token_hash: null })
    .eq("property_id", propertyId)
    .eq("purpose", "add_recipient")
    .eq("confirmation_token_hash", confirmationTokenHash)
    .gt("confirmation_expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (!burnedConfirmation) {
    return new Response(JSON.stringify({ error: "That confirmation has expired or was already used. Request a new code." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // First recipient ever for this property defaults to being the one payouts use; later additions
  // stay non-default until the landlord explicitly switches, via setDefaultPayoutRecipient.
  const { count: existingCount } = await supabase
    .from("payout_recipients")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);

  const { data: recipient, error: insertError } = await supabase
    .from("payout_recipients")
    .insert({
      property_id: propertyId,
      type: "mobile-money",
      phone_number: phoneNumber,
      provider,
      account_name: accountName,
      is_default: (existingCount ?? 0) === 0,
    })
    .select()
    .single();

  if (insertError || !recipient) {
    return new Response(JSON.stringify({ error: "Failed to save the payout method.", detail: insertError?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: settingsRow } = await supabase.from("settings").select("account_email").eq("property_id", propertyId).maybeSingle();
  if (settingsRow?.account_email) {
    try {
      await sendEmail(
        settingsRow.account_email,
        "A new payout method was added to your account",
        `A ${provider.toUpperCase()} mobile money number ending in ${phoneNumber.slice(-4)} (${accountName}) was just added as a payout destination on your Instay account. If this wasn't you, remove it in Settings > Bank & payouts right away.`
      );
    } catch (err) {
      console.error("[create-mobile-money-recipient] failed to send security alert email", String(err));
    }
  }

  return new Response(JSON.stringify({ ok: true, recipient }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
