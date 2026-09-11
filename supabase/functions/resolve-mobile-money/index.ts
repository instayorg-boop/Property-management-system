// Resolves a mobile money number to the account holder's name via Lenco, so Settings can show
// "Confirm this is you: BEATA JEAN" before the landlord saves it as a payout recipient — the exact
// same pattern resolve-bank-account already uses for bank accounts, now that this endpoint is
// confirmed. Read-only — never touches the database.
//
// Endpoint confirmed by the caller against Lenco's live API reference (v2.0):
//   POST https://api.lenco.co/access/v2/resolve/mobile-money
//   body: { phone, operator, country? }   -- operator: "mtn" | "airtel" | "zamtel"
//   200: { status, message, data: { type, accountName, phone, operator, country } }
//   400: { status: false, message: string, data: null }
//
// Deploy:  supabase functions deploy resolve-mobile-money
// Invoke:  supabase.functions.invoke("resolve-mobile-money", { body: { phone, operator } })

import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const OPERATORS = ["mtn", "airtel", "zamtel"];

type ResolvePayload = { phone?: string; operator?: string };

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

  const phone = payload.phone?.trim() ?? "";
  const operator = payload.operator?.trim().toLowerCase() ?? "";
  if (phone.length < 9 || !OPERATORS.includes(operator)) {
    return new Response(JSON.stringify({ error: "A valid phone number and operator (mtn, airtel, or zamtel) are required" }), {
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
    const lencoResponse = await fetch("https://api.lenco.co/access/v2/resolve/mobile-money", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lencoSecretKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ phone, operator, country: "zm" }),
    });
    const lencoJson = await lencoResponse.json();

    if (lencoResponse.status === 400) {
      return new Response(
        JSON.stringify({ error: lencoJson.message ?? "Couldn't resolve that number — check the number and provider." }),
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
      return new Response(JSON.stringify({ error: "Couldn't resolve that number — check the number and provider." }), {
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
