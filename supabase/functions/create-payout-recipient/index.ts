// Creates a Lenco transfer recipient and saves it as the property's payout destination.
//
// Note on the payload shape: the task brief describes `{ accountNumber, bankCode, landlordId }`,
// but this app has no separate landlords/users table — every table (including the new
// `payout_recipients`) is scoped by `property_id`, matching the rest of the schema (see
// docs/BACKEND.md and supabase/migrations/20260907020000_auth_and_onboarding.sql). So this takes
// `propertyId` instead of `landlordId`. `accountName` isn't sent to Lenco here (it doesn't take
// one on this endpoint — it returns its own resolved name), but is still required from the caller
// so we can store what the landlord actually confirmed, matched against what Lenco returns.
//
// Endpoint confirmed against this account's live Lenco API reference (v2.0):
//   POST https://api.lenco.co/access/v2/transfer-recipients/bank-account
//   body: { accountNumber, bankId, country? }   -- note: bankId, not bankCode; no "type" field
//   200: { status, message, data: { id, currency, type, country, details: { accountName, accountNumber, bank } } }
//   400: { status: false, message: "Account Details could not be verified", data: null }
//
// Auth: the request is made with the signed-in landlord's own session (forwarded via the
// Authorization header), so the DB insert runs under their RLS policy — `payout_recipients_insert`
// only allows rows where `property_id` belongs to a property they own. No service-role key is used
// for the Lenco/DB parts; only for burning the confirmationToken (see below), since
// payout_withdrawal_otp_codes has no RLS policies at all.
//
// `confirmationToken` (purpose "add_recipient") is required and re-validated here, same boundary
// lenco-payout applies to an actual withdrawal — adding a payout destination decides where future
// money CAN go, so it gets the same "prove it's really you via a code emailed to the account" step
// rather than just an after-the-fact alert email. Checked before the Lenco call, not after, so an
// unauthorized attempt never even creates a Lenco transfer-recipient.
//
// Deploy:  supabase functions deploy create-payout-recipient
// Invoke:  supabase.functions.invoke("create-payout-recipient", { body: { accountNumber, bankCode, accountName, propertyId, confirmationToken } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { sha256Hex } from "../_shared/otpCrypto.ts";

type CreateRecipientPayload = {
  accountNumber?: string;
  bankCode?: string;
  accountName?: string;
  propertyId?: string;
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

  let payload: CreateRecipientPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const accountNumber = payload.accountNumber?.trim() ?? "";
  const bankCode = payload.bankCode?.trim() ?? "";
  const accountName = payload.accountName?.trim() ?? "";
  const propertyId = payload.propertyId?.trim() ?? "";
  const confirmationToken = payload.confirmationToken?.trim() ?? "";

  if (!/^\d{5,20}$/.test(accountNumber) || !bankCode || !accountName || !propertyId) {
    return new Response(
      JSON.stringify({ error: "A valid accountNumber, bankCode, accountName and propertyId are all required" }),
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

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: "LENCO_SECRET_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Client scoped to the caller's own session — the insert below runs under their RLS policy,
  // so this can never write a payout recipient for a property they don't own.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  // The actual authorization check — see this file's top comment. payout_withdrawal_otp_codes has
  // no RLS policies at all, hence the service-role client; validates + immediately burns the token
  // in one update so it can't be replayed.
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

  let lencoRecipientId: string;
  try {
    const lencoResponse = await fetch("https://api.lenco.co/access/v2/transfer-recipients/bank-account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lencoSecretKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ accountNumber, bankId: bankCode, country: "zm" }),
    });
    const lencoJson = await lencoResponse.json();
    if (!lencoResponse.ok) {
      return new Response(JSON.stringify({ error: lencoJson.message ?? "Lenco rejected the recipient request", detail: lencoJson }), {
        status: lencoResponse.status === 400 ? 400 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    lencoRecipientId = lencoJson.data?.id;
    if (!lencoRecipientId) {
      return new Response(JSON.stringify({ error: "Lenco didn't return a recipient id", detail: lencoJson }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to reach Lenco", detail: String(err) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // First recipient ever for this property defaults to being the one payouts use; later additions
  // (e.g. adding a mobile money number alongside an existing bank account) stay non-default until
  // the landlord explicitly switches, via setDefaultPayoutRecipient.
  const { count: existingCount } = await supabase
    .from("payout_recipients")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);

  const { data, error } = await supabase
    .from("payout_recipients")
    .insert({
      property_id: propertyId,
      type: "bank",
      lenco_recipient_id: lencoRecipientId,
      account_name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
      is_default: (existingCount ?? 0) === 0,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Recipient was created with Lenco but failed to save", detail: error.message }), {
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
        `A bank account ending in ${accountNumber.slice(-4)} was just added as a payout destination on your Instay account. If this wasn't you, remove it in Settings > Bank & payouts right away.`
      );
    } catch (err) {
      console.error("[create-payout-recipient] failed to send security alert email", String(err));
    }
  }

  return new Response(JSON.stringify({ ok: true, recipient: data }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
