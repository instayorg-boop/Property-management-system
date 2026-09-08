// Initiates a payout transfer to the landlord's registered bank account via Lenco.
//
// The recipient is looked up server-side from `payout_recipients` (never trusted from the
// request body) using the caller's own forwarded session, so RLS guarantees a landlord can only
// ever pay out to a property they own, to whichever bank account they've actually registered via
// Settings > Online payments (see resolve-bank-account / create-payout-recipient).
//
// A `payouts` row is written up front with status "pending" so there's a durable record even if
// the Lenco call itself fails outright (network error, wrong endpoint, etc.) — lenco-webhook then
// moves it to "successful"/"failed" once Lenco confirms.
//
// STILL PLACEHOLDER on the actual Lenco call: the exact transfer/transaction endpoint for this
// account hasn't been confirmed against its live API reference the way resolve-bank-account and
// create-payout-recipient were (both had to be corrected after guessing wrong — see their file
// comments). Calling LENCO_API_TRANSFER_PATH below with the wrong path will show up clearly as a
// failed `payouts` row rather than silently doing nothing.
//
// Deploy:  supabase functions deploy lenco-payout
// Invoke:  supabase.functions.invoke("lenco-payout", { body: { propertyId, amount, narration? } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

type LencoPayoutPayload = { propertyId?: string; amount?: number; narration?: string };

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
  if (!propertyId || !amount || amount <= 0) {
    return new Response(JSON.stringify({ error: "propertyId and a positive amount are required" }), {
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

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: "LENCO_SECRET_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Scoped to the caller's own session — every read/write below runs under their RLS policies.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: recipient, error: recipientError } = await supabase
    .from("payout_recipients")
    .select("id, lenco_recipient_id, account_name, account_number")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recipientError) {
    return new Response(JSON.stringify({ error: "Failed to look up payout recipient", detail: recipientError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!recipient) {
    return new Response(JSON.stringify({ error: "No payout recipient is set up for this property yet — add one in Settings > Online payments." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: payoutRow, error: insertError } = await supabase
    .from("payouts")
    .insert({
      property_id: propertyId,
      payout_recipient_id: recipient.id,
      amount,
      status: "pending",
      narration: payload.narration ?? `Rent payout — ${recipient.account_name}`,
    })
    .select()
    .single();

  if (insertError || !payoutRow) {
    return new Response(JSON.stringify({ error: "Failed to record payout", detail: insertError?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Unconfirmed endpoint — see the file-level comment. Update this path once verified against
  // this account's live Lenco API reference (dashboard's API section), the same way
  // resolve-bank-account and create-payout-recipient were confirmed.
  const LENCO_API_TRANSFER_PATH = "https://api.lenco.co/access/v2/transactions";

  try {
    const lencoResponse = await fetch(LENCO_API_TRANSFER_PATH, {
      method: "POST",
      headers: { Authorization: `Bearer ${lencoSecretKey}`, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        recipientId: recipient.lenco_recipient_id,
        amount,
        reference: payoutRow.id,
        narration: payoutRow.narration,
      }),
    });
    const lencoJson = await lencoResponse.json();

    if (!lencoResponse.ok) {
      await supabase.from("payouts").update({ status: "failed", failure_reason: lencoJson.message ?? "Lenco rejected the transfer" }).eq("id", payoutRow.id);
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

    return new Response(JSON.stringify({ ok: true, payoutId: payoutRow.id, lencoTransactionId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await supabase.from("payouts").update({ status: "failed", failure_reason: String(err) }).eq("id", payoutRow.id);
    return new Response(JSON.stringify({ error: "Failed to reach Lenco", detail: String(err) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
