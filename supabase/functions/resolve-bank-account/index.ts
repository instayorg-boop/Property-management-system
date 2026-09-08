// Resolves a bank account number to the account holder's name via Lenco, so the Settings page can
// show "Confirm this is you: JOHN M BANDA" before the landlord commits to saving a payout
// recipient. Read-only — never touches the database.
//
// Endpoint confirmed against this account's live Lenco API reference (v2.0):
//   POST https://api.lenco.co/access/v2/resolve/bank-account
//   body: { accountNumber, bankId, country? }   -- note: bankId, not bankCode
//   200: { status, message, data: { type, accountName, accountNumber, bank: { id, name, country } } }
//   400: { status: false, message: "Account details was not found", data: null }
//
// Deploy:  supabase functions deploy resolve-bank-account
// Invoke:  supabase.functions.invoke("resolve-bank-account", { body: { accountNumber, bankCode } })

import { corsHeaders, handleOptions } from "../_shared/cors.ts";

type ResolvePayload = { accountNumber?: string; bankCode?: string };

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: ResolvePayload;
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
  // Zambian bank account numbers aren't a fixed 10-digit NUBAN format (that's Nigeria's convention) —
  // just require digits of a plausible length and let Lenco itself be the source of truth on validity.
  if (!/^\d{5,20}$/.test(accountNumber) || !bankCode) {
    return new Response(JSON.stringify({ error: "A valid accountNumber and a bankCode are required" }), {
      status: 400,
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

  try {
    const lencoResponse = await fetch("https://api.lenco.co/access/v2/resolve/bank-account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lencoSecretKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ accountNumber, bankId: bankCode, country: "zm" }),
    });
    const lencoJson = await lencoResponse.json();

    if (lencoResponse.status === 400) {
      return new Response(
        JSON.stringify({ error: lencoJson.message ?? "Couldn't resolve that account — check the account number and bank." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!lencoResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Lenco rejected the resolve request", lencoStatus: lencoResponse.status, detail: lencoJson }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountName: string | undefined = lencoJson.data?.accountName;
    if (!accountName) {
      return new Response(JSON.stringify({ error: "Couldn't resolve that account — check the account number and bank." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ accountName }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to reach Lenco", detail: String(err) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
