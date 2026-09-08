// Resolves a bank account number to the account holder's name via Lenco, so the Settings page can
// show "Confirm this is you: JOHN M BANDA" before the landlord commits to saving a payout
// recipient. Read-only — never touches the database.
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
  if (!/^\d{10}$/.test(accountNumber) || !bankCode) {
    return new Response(JSON.stringify({ error: "A 10-digit accountNumber and a bankCode are required" }), {
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
    const url = new URL("https://api.lenco.co/access/v2/resolve");
    url.searchParams.set("accountNumber", accountNumber);
    url.searchParams.set("bankCode", bankCode);

    const lencoResponse = await fetch(url, { headers: { Authorization: `Bearer ${lencoSecretKey}` } });
    const lencoJson = await lencoResponse.json();

    if (lencoResponse.status === 400) {
      return new Response(
        JSON.stringify({ error: lencoJson.message ?? "Couldn't resolve that account — check the account number and bank." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!lencoResponse.ok) {
      return new Response(JSON.stringify({ error: "Lenco rejected the resolve request", detail: lencoJson }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountName: string | undefined = lencoJson.data?.accountName ?? lencoJson.data?.account_name;
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
