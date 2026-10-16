// Saves a mobile money number as a payout recipient, after the caller has already resolved its
// account holder name via resolve-mobile-money and had the landlord confirm it. No Lenco
// transfer-recipient creation call here: Lenco's mobile-money transfer endpoint takes phone +
// operator directly rather than needing a pre-registered recipient id the way bank transfers do.
//
// Auth: request is made with the caller's own session (forwarded via Authorization), so the insert
// runs under their RLS policy.
//
// `confirmationToken` (purpose "add_recipient") is required and re-validated here, with one
// exception: the property's very first payout method during setup. With no existing recipients
// there is nothing to hijack, so no emailed code is asked for. Every later addition needs the code.
//
// Duplicates: the same number on the same network is refused (409) before the confirmation token is
// spent, matching create-payout-recipient's dedupe for bank accounts.

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const last9 = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-9);

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: CreatePayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const propertyId = payload.propertyId?.trim() ?? "";
  const phoneNumber = payload.phoneNumber?.trim() ?? "";
  const provider = payload.provider?.trim().toLowerCase() ?? "";
  const accountName = payload.accountName?.trim() ?? "";
  const confirmationToken = payload.confirmationToken?.trim() ?? "";

  if (!propertyId || phoneNumber.length < 9 || !PROVIDERS.includes(provider) || !accountName) {
    return json({ error: "propertyId, phoneNumber, a valid provider, and accountName are all required" }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { count: existingCount } = await supabase
    .from("payout_recipients")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);

  if (!confirmationToken && (existingCount ?? 0) > 0) {
    return json({ error: "A confirmation is required. Verify the code emailed to your account first." }, 401);
  }

  // Duplicate check first, so a refused duplicate doesn't burn the landlord's confirmation code.
  const { data: sameNetwork } = await supabase
    .from("payout_recipients")
    .select("id, phone_number")
    .eq("property_id", propertyId)
    .eq("type", "mobile-money")
    .eq("provider", provider);
  if ((sameNetwork ?? []).some((r) => last9(r.phone_number) === last9(phoneNumber))) {
    return json({ error: "That number is already saved as a payment method." }, 409);
  }

  if (confirmationToken) {
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
      return json({ error: "That confirmation has expired or was already used. Request a new code." }, 401);
    }
  }

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
    return json({ error: "Failed to save the payout method.", detail: insertError?.message }, 500);
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

  return json({ ok: true, recipient });
});
