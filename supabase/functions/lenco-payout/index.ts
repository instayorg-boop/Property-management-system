// Initiates a payout transfer to one of the landlord's registered payout recipients via Lenco —
// a bank account or a mobile money number.
//
// The recipient is looked up server-side from `payout_recipients` (never trusted from the
// request body) using the caller's own forwarded session, so RLS guarantees a landlord can only
// ever pay out to a property they own, to whichever destination they've actually registered via
// Settings > Bank & payouts. `recipientId` in the payload picks WHICH of the property's (possibly
// several) recipients to use — omit it to fall back to the default one.
//
// Processing fee: Lenco charges a tiered flat fee per transfer (see FEE_TIERS below, K8.50 at
// the low end up to K35 at the high end). This function is the ON-DEMAND path — reached only by a
// landlord actively confirming a withdrawal via OTP, as opposed to the scheduled batch payout on
// `settings.payout_day` (pay-portal-scheduled-payouts) — so it adds ON_DEMAND_MARKUP on top of the
// real fee as the cost of choosing "pay me now" instead of waiting for the schedule.
//
// `amount` in the request is treated as a CAP, not a guaranteed figure: pay_portal_claim_payout_
// collections (see migration payout_claim_tracking) atomically claims real unclaimed successful
// collections for this property, oldest first, up to that cap, and returns what was actually
// available. A landlord can never withdraw more than has genuinely been collected and not already
// paid out — the previous version of this function transferred whatever number was in the request
// body with no verification against real collected funds at all, which meant a landlord (or
// anyone with a valid withdrawal confirmation) could trigger a transfer for an amount that was
// never actually collected. fee_amount/net_amount are itemized on the payouts row using the real
// claimed amount; net_amount = claimed amount - fee_amount is what Lenco is actually told to send.
//
// `confirmationToken` is required and re-validated here (not just checked client-side), scoped to
// purpose "withdrawal" — it's issued by verify-withdrawal-otp only after the landlord entered a code
// emailed to the property's registered account address. This is deliberately the actual
// authorization boundary for moving money, not just a UI step: a request that skips straight to
// this function without ever verifying a code has no valid token to present and is rejected before
// anything else happens.
//
// A `payouts` row is written up front with status "pending" so there's a durable record even if
// the Lenco call itself fails outright (network error, wrong endpoint, etc.) — lenco-webhook then
// moves it to "successful"/"failed" once Lenco confirms.
//
// Endpoints confirmed against this account's live Lenco API reference (v2.0):
//   POST https://api.lenco.co/access/v2/transfers/bank-account
//   body: { accountId, amount, reference, narration?, transferRecipientId }
//   POST https://api.lenco.co/access/v2/transfers/mobile-money
//   body: { accountId, amount, reference, narration?, phone, operator, country }
//     - accountId: the LENCO ACCOUNT to debit from (your own Lenco wallet, not the recipient) —
//       fetched from GET /access/v2/accounts below rather than hardcoded, since we don't have a
//       reliable way to know it ahead of time and this account only has one Lenco account anyway.
//     - transferRecipientId: payout_recipients.lenco_recipient_id (bank only — mobile-money
//       recipients were never registered as a Lenco transfer-recipient, so phone/operator are sent
//       directly instead, exactly as Lenco's docs describe for when you don't have one).
//     - reference: must be unique, alphanumeric plus -._  — payouts.id (a uuid) satisfies this.
//
// Deploy:  supabase functions deploy lenco-payout
// Invoke:  supabase.functions.invoke("lenco-payout", { body: { propertyId, amount, confirmationToken, narration?, recipientId? } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/otpCrypto.ts";

type LencoPayoutPayload = {
  propertyId?: string;
  amount?: number;
  narration?: string;
  recipientId?: string;
  confirmationToken?: string;
};

const FEE_TIERS: { upTo: number; fee: number }[] = [
  { upTo: 150, fee: 8.5 },
  { upTo: 300, fee: 10 },
  { upTo: 500, fee: 11 },
  { upTo: 1_000, fee: 12 },
  { upTo: 3_000, fee: 15 },
  { upTo: 5_000, fee: 18 },
  { upTo: 10_000, fee: 20 },
  { upTo: 50_000, fee: 25 },
  { upTo: 100_000_000, fee: 35 },
];

function lencoTransferFee(amount: number): number {
  const tier = FEE_TIERS.find((t) => amount <= t.upTo);
  return tier ? tier.fee : FEE_TIERS[FEE_TIERS.length - 1].fee;
}

const ON_DEMAND_MARKUP = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: LencoPayoutPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const propertyId = payload.propertyId?.trim() ?? "";
  const amount = payload.amount;
  const confirmationToken = payload.confirmationToken?.trim() ?? "";
  const recipientId = payload.recipientId?.trim() || null;
  if (!propertyId || !amount || amount <= 0) {
    return new Response(JSON.stringify({ error: "propertyId and a positive amount are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!confirmationToken) {
    return new Response(JSON.stringify({ error: "A withdrawal confirmation is required — verify the code emailed to your account first." }), {
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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const confirmationTokenHash = await sha256Hex(confirmationToken);
  const { data: burnedConfirmation } = await serviceClient
    .from("payout_withdrawal_otp_codes")
    .update({ confirmation_token_hash: null })
    .eq("property_id", propertyId)
    .eq("purpose", "withdrawal")
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

  let recipientQuery = supabase
    .from("payout_recipients")
    .select("id, type, lenco_recipient_id, account_name, account_number, phone_number, provider")
    .eq("property_id", propertyId);
  recipientQuery = recipientId ? recipientQuery.eq("id", recipientId) : recipientQuery.eq("is_default", true);
  const { data: recipient, error: recipientError } = await recipientQuery.limit(1).maybeSingle();

  if (recipientError) {
    return new Response(JSON.stringify({ error: "Failed to look up payout recipient", detail: recipientError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!recipient) {
    return new Response(JSON.stringify({ error: "No payout recipient is set up for this property yet — add one in Settings > Bank & payouts." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (recipient.type === "bank" && !recipient.lenco_recipient_id) {
    return new Response(JSON.stringify({ error: "This bank recipient is missing its Lenco reference — re-add it in Settings." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (recipient.type === "mobile-money" && (!recipient.phone_number || !recipient.provider)) {
    return new Response(JSON.stringify({ error: "This mobile money recipient is missing its phone or provider — re-add it in Settings." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: payoutRow, error: insertError } = await supabase
    .from("payouts")
    .insert({
      property_id: propertyId,
      payout_recipient_id: recipient.id,
      amount: 0,
      status: "pending",
      narration: payload.narration ?? "On-demand rent payout",
    })
    .select()
    .single();

  if (insertError || !payoutRow) {
    return new Response(JSON.stringify({ error: "Failed to record payout", detail: insertError?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: claimedRaw, error: claimError } = await supabase.rpc("pay_portal_claim_payout_collections", {
    p_property_id: propertyId,
    p_payout_id: payoutRow.id,
    p_max_amount: amount,
  });

  if (claimError) {
    await supabase.from("payouts").delete().eq("id", payoutRow.id);
    return new Response(JSON.stringify({ error: "Failed to check available balance", detail: claimError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const claimedAmount = round2(Number(claimedRaw ?? 0));
  if (claimedAmount <= 0) {
    await supabase.from("payouts").delete().eq("id", payoutRow.id);
    return new Response(JSON.stringify({ error: "There's nothing available to pay out right now." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const feeAmount = round2(lencoTransferFee(claimedAmount) + ON_DEMAND_MARKUP);
  const netAmount = round2(claimedAmount - feeAmount);
  if (netAmount <= 0) {
    await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: payoutRow.id });
    await supabase.from("payouts").delete().eq("id", payoutRow.id);
    return new Response(JSON.stringify({ error: "That amount is too small to cover the transfer fee." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const narration =
    payload.narration ?? `Rent payout — ${recipient.account_name ?? recipient.phone_number} (fee K${feeAmount.toFixed(2)})`;
  await supabase
    .from("payouts")
    .update({ amount: claimedAmount, fee_amount: feeAmount, net_amount: netAmount, narration })
    .eq("id", payoutRow.id);

  try {
    const accountsResponse = await fetch("https://api.lenco.co/access/v2/accounts", {
      headers: { Authorization: `Bearer ${lencoSecretKey}`, accept: "application/json" },
    });
    const accountsJson = await accountsResponse.json();
    const accountId: string | undefined = accountsJson.data?.[0]?.id;
    if (!accountsResponse.ok || !accountId) {
      await supabase.from("payouts").update({ status: "failed", failure_reason: "Couldn't find a Lenco account to pay out from" }).eq("id", payoutRow.id);
      await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: payoutRow.id });
      return new Response(
        JSON.stringify({ error: "Couldn't find a Lenco account to pay out from", detail: accountsJson }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isMobileMoney = recipient.type === "mobile-money";
    const lencoResponse = await fetch(
      `https://api.lenco.co/access/v2/transfers/${isMobileMoney ? "mobile-money" : "bank-account"}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${lencoSecretKey}`, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify(
          isMobileMoney
            ? {
                accountId,
                amount: netAmount,
                reference: payoutRow.id,
                narration: payoutRow.narration,
                phone: recipient.phone_number,
                operator: recipient.provider,
                country: "zm",
              }
            : {
                accountId,
                amount: netAmount,
                reference: payoutRow.id,
                narration: payoutRow.narration,
                transferRecipientId: recipient.lenco_recipient_id,
                country: "zm",
              }
        ),
      }
    );
    const lencoJson = await lencoResponse.json();

    if (!lencoResponse.ok) {
      await supabase.from("payouts").update({ status: "failed", failure_reason: lencoJson.message ?? "Lenco rejected the transfer" }).eq("id", payoutRow.id);
      await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: payoutRow.id });
      return new Response(
        JSON.stringify({ error: lencoJson.message ?? "Lenco rejected the transfer request", lencoStatus: lencoResponse.status, detail: lencoJson }),
        { status: lencoResponse.status === 400 ? 400 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lencoTransactionId: string | undefined = lencoJson.data?.id;
    await supabase
      .from("payouts")
      .update({ status: "processing", lenco_transaction_id: lencoTransactionId ?? null })
      .eq("id", payoutRow.id);

    return new Response(
      JSON.stringify({ ok: true, payoutId: payoutRow.id, lencoTransactionId, amount: claimedAmount, feeAmount, netAmount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await supabase.from("payouts").update({ status: "failed", failure_reason: String(err) }).eq("id", payoutRow.id);
    await supabase.rpc("pay_portal_release_payout_collections", { p_payout_id: payoutRow.id });
    return new Response(JSON.stringify({ error: "Failed to reach Lenco", detail: String(err) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
