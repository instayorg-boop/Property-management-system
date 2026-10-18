// supabase/functions/dashboard-collections-trend/index.ts
//
// Total rent collected (every method — cash, mobile money, bank transfer, not just online
// collections) vs expenses, one figure per month, for the dashboard's "Payments vs expenses"
// bar chart. Reuses report_facts (the same RPC the weekly/monthly property reports are built
// from) instead of re-deriving ledger math client-side — report_facts is already the one place
// that correctly sums every payment method and every ledger event type, legacy and current.
//
// Invoke: supabase.functions.invoke('dashboard-collections-trend', { body: { propertyId, months } })
//   months: 3 | 6 | 12, trailing, current month included. Returns:
//   { months: [{ month: 'Jan', collected: number, expenses: number }, ...] }

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function monthRange(d: Date): { from: string; to: string; label: string } {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: ymd(from), to: ymd(to), label: d.toLocaleDateString("en-GB", { month: "short" }) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { propertyId?: string; months?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const propertyId = String(body.propertyId ?? "").trim();
  const months = [3, 6, 12].includes(body.months ?? 0) ? (body.months as number) : 3;
  if (!propertyId) return json({ error: "propertyId is required" }, 400);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Please sign in again." }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Same access check as everywhere else: the owner, or an active team member on this property.
  const { data: prop } = await admin.from("properties").select("id,owner_id").eq("id", propertyId).maybeSingle();
  if (!prop) return json({ error: "Property not found." }, 404);
  let authorized = prop.owner_id === userData.user.id;
  if (!authorized) {
    const { data: member } = await admin
      .from("team_members").select("id").eq("property_id", propertyId).eq("user_id", userData.user.id).eq("status", "active").maybeSingle();
    authorized = Boolean(member);
  }
  if (!authorized) return json({ error: "You don't have access to that property." }, 403);

  const now = new Date();
  const ranges = Array.from({ length: months }, (_, i) => monthRange(new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)));

  const results = await Promise.all(
    ranges.map(async (r) => {
      const { data, error } = await admin.rpc("report_facts", {
        p_property: propertyId,
        p_from: r.from,
        p_to: r.to,
        p_prev_from: r.from,
        p_prev_to: r.to,
        p_weeks: false,
      });
      if (error) {
        console.error("[dashboard-collections-trend] report_facts failed", propertyId, r.from, error.message);
        return { month: r.label, collected: 0, expenses: 0 };
      }
      const facts = data as { collected?: number; expenses_total?: number };
      return { month: r.label, collected: Math.round(Number(facts?.collected ?? 0)), expenses: Math.round(Number(facts?.expenses_total ?? 0)) };
    }),
  );

  return json({ months: results });
});
