// Initiates a payout transfer to the landlord's bank account via Lenco.
//
// PLACEHOLDER — no Lenco account/API key is configured yet, and there's no UI trigger for this
// yet either (PayoutDetailDrawer only shows figures — see Dashboard.tsx's `payout` calc for how
// the net-to-owner amount is derived). This exists so the operation has a real, deployable home
// with the right shape settled ahead of time, since a real money transfer must never be
// initiated from the browser with a secret API key.
//
// To make this real:
//   1. Get a Lenco secret API key (dashboard, not the anon-key-style public one).
//   2. Set secrets:  supabase secrets set LENCO_SECRET_KEY=...
//   3. Replace the stub block below with a fetch() to Lenco's transfer/disbursement endpoint,
//      using LENCO_SECRET_KEY as a Bearer token.
//   4. On success, write a row to a `payouts` table (doesn't exist yet — add it alongside this)
//      so the app has a real payout history instead of only ever showing "next payout".
//   5. Wire a "Send payout now" (or a cron-triggered) call site to invoke this function.
//
// Deploy:  supabase functions deploy lenco-payout
// Invoke:  supabase.functions.invoke("lenco-payout", { body: { propertyId, amount, bankName, accountNumber, accountHolderName } })

import { corsHeaders, handleOptions } from "../_shared/cors.ts";

type LencoPayoutPayload = {
  propertyId: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
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

  let payload: LencoPayoutPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!payload.propertyId || !payload.amount || payload.amount <= 0) {
    return new Response(JSON.stringify({ error: "propertyId and a positive amount are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");

  if (!lencoSecretKey) {
    console.log("[lenco-payout] placeholder — no LENCO_SECRET_KEY set, not initiating a real transfer", payload);
    return new Response(
      JSON.stringify({ ok: false, placeholder: true, message: "Lenco isn't connected yet — no transfer was sent." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // TODO: real transfer once Lenco is connected.
  // const lencoResponse = await fetch("https://api.lenco.co/access/v2/transactions", {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${lencoSecretKey}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({
  //     accountId: payload.accountNumber,
  //     amount: payload.amount,
  //     narration: `Rent payout — ${payload.bankName}`,
  //   }),
  // });
  // const lencoResult = await lencoResponse.json();
  // if (!lencoResponse.ok) return new Response(JSON.stringify({ error: lencoResult }), { status: 502, headers: corsHeaders });
  // TODO: insert a row into a `payouts` table here so the app has real payout history.

  return new Response(JSON.stringify({ ok: false, placeholder: true, message: "Lenco isn't connected yet — no transfer was sent." }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
