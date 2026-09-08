// Creates a Lenco transfer recipient and saves it as the property's payout destination.
//
// Note on the payload shape: the task brief describes `{ accountNumber, bankCode, landlordId }`,
// but this app has no separate landlords/users table — every table (including the new
// `payout_recipients`) is scoped by `property_id`, matching the rest of the schema (see
// docs/BACKEND.md and supabase/migrations/20260907020000_auth_and_onboarding.sql). So this takes
// `propertyId` instead of `landlordId`. `accountName` is also required — it's the resolved name
// from `resolve-bank-account`, shown to the landlord for confirmation before this call is made,
// and Lenco's own /recipients endpoint needs it too.
//
// Auth: the request is made with the signed-in landlord's own session (forwarded via the
// Authorization header), so the DB insert runs under their RLS policy — `payout_recipients_insert`
// only allows rows where `property_id` belongs to a property they own. No service-role key is used
// here; only the Lenco secret key needs elevated trust, and that never leaves this function.
//
// Deploy:  supabase functions deploy create-payout-recipient
// Invoke:  supabase.functions.invoke("create-payout-recipient", { body: { accountNumber, bankCode, accountName, propertyId } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

type CreateRecipientPayload = {
  accountNumber?: string;
  bankCode?: string;
  accountName?: string;
  propertyId?: string;
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

  if (!/^\d{5,20}$/.test(accountNumber) || !bankCode || !accountName || !propertyId) {
    return new Response(
      JSON.stringify({ error: "A valid accountNumber, bankCode, accountName and propertyId are all required" }),
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

  let lencoRecipientId: string;
  try {
    const lencoResponse = await fetch("https://api.lenco.co/access/v2/recipients", {
      method: "POST",
      headers: { Authorization: `Bearer ${lencoSecretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bank", accountNumber, bankCode, accountName }),
    });
    const lencoJson = await lencoResponse.json();
    if (!lencoResponse.ok) {
      return new Response(JSON.stringify({ error: lencoJson.message ?? "Lenco rejected the recipient request", detail: lencoJson }), {
        status: lencoResponse.status === 400 ? 400 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    lencoRecipientId = lencoJson.data?.id ?? lencoJson.data?.recipientId;
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

  const { data, error } = await supabase
    .from("payout_recipients")
    .insert({
      property_id: propertyId,
      lenco_recipient_id: lencoRecipientId,
      account_name: accountName,
      account_number: accountNumber,
      bank_code: bankCode,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Recipient was created with Lenco but failed to save", detail: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, recipient: data }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
