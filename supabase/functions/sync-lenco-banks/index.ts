// Refreshes the local `banks` cache from Lenco's bank list. Banks rarely change, so the Settings
// page's bank picker reads from this table instead of hitting Lenco on every page load — this is
// the only thing that talks to GET /banks.
//
// Auth: verifies the caller's Supabase JWT (default edge-function behavior) then writes with the
// service-role key, since `banks` isn't scoped to any one property/owner — every signed-in user
// reads the same shared list (see the RLS policy on `banks` in
// supabase/migrations/20260908010000_payout_recipients.sql).
//
// Deploy:  supabase functions deploy sync-lenco-banks
// Invoke:  supabase.functions.invoke("sync-lenco-banks")   (manually, or on a schedule via
//          `supabase functions schedule` / an external cron hitting this URL with the anon key)

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

type LencoBank = {
  code?: string;
  bankCode?: string;
  name?: string;
  bankName?: string;
  logo?: string;
  logoUrl?: string;
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const lencoSecretKey = Deno.env.get("LENCO_SECRET_KEY");
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: "LENCO_SECRET_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let lencoJson: { data?: LencoBank[] };
  try {
    const lencoResponse = await fetch("https://api.lenco.co/access/v1/banks", {
      headers: { Authorization: `Bearer ${lencoSecretKey}` },
    });
    lencoJson = await lencoResponse.json();
    if (!lencoResponse.ok) {
      return new Response(JSON.stringify({ error: "Lenco rejected the bank list request", detail: lencoJson }), {
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

  const banks = (lencoJson.data ?? [])
    .map((b) => ({
      code: b.code ?? b.bankCode ?? "",
      name: b.name ?? b.bankName ?? "",
      logo_url: b.logo ?? b.logoUrl ?? null,
    }))
    .filter((b) => b.code && b.name);

  if (banks.length === 0) {
    return new Response(JSON.stringify({ error: "Lenco returned no usable banks", detail: lencoJson }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supabase.from("banks").upsert(banks, { onConflict: "code" });
  if (error) {
    return new Response(JSON.stringify({ error: "Failed to save banks", detail: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, count: banks.length }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
