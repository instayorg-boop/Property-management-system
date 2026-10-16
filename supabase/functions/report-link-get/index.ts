// Public (no login) lookup for the auto-generated income vs expenses report link the 100%-paid
// milestone texts to the landlord. Same trust-boundary reasoning as pay-subscription-get-status
// and pay-portal-resolve-token: the token only ever reaches the landlord via an SMS to their own
// phone, so there is no separate OTP step.
//
// Deploy:  supabase functions deploy report-link-get
// Invoke:  POST { token }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { token?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = payload.token?.trim() ?? "";
  if (!token) {
    return new Response(JSON.stringify({ error: "token is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: link } = await supabase
    .from("report_links")
    .select("property_id, period_label, date_from, date_to, rent_collected, total_expenses, net, breakdown, created_at, properties(name)")
    .eq("public_token", token)
    .maybeSingle();

  if (!link) {
    return new Response(JSON.stringify({ error: "This link isn't valid anymore." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const propertyName = (link.properties as { name: string } | null)?.name ?? "Your property";

  return new Response(
    JSON.stringify({
      ok: true,
      propertyName,
      periodLabel: link.period_label,
      dateFrom: link.date_from,
      dateTo: link.date_to,
      rentCollected: Number(link.rent_collected),
      totalExpenses: Number(link.total_expenses),
      net: Number(link.net),
      breakdown: link.breakdown ?? [],
      createdAt: link.created_at,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
