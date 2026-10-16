// Internal (no landlord session) income vs expenses summary, built for one trigger: the
// 100%-paid milestone in send-notification-digests/index.ts. Rather than producing a PDF (that's
// the dashboard's own "Generate a document" flow in generate-report/index.ts, a much larger file
// this deliberately stays separate from), this just computes the month's numbers and stores them
// as data in report_links, behind a public_token. The no-login page at /report/:token (resolved
// by report-link-get) renders those numbers directly, no file, no PDF rendering needed.
//
// Deploy:  supabase functions deploy generate-auto-report
// Invoke:  POST with header x-cron-secret: <CRON_SECRET>, body { property_id, date_from, date_to }
//          date_from/date_to are "YYYY-MM-DD"; date_to defaults to today, date_from to the 1st of
//          date_to's month.
// Response: { ok: true, token: string } or { error: string }.

import { createClient } from "npm:@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

type Payload = { property_id?: string; date_from?: string; date_to?: string };

function monthYearLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** Same shape as generate-report's fetchIncomeVsExpenses, trimmed to just the period totals and
 * a category breakdown, no month-by-month series, this summary is always a single period. */
async function computeIncomeVsExpenses(supabase: SupabaseClient, propertyId: string, dateFrom: string, dateTo: string) {
  const { data: ledger } = await supabase
    .from("ledger_entries")
    .select("amount, paid_amount, status, source, event_type, origin, affects_balance, voided_at, created_at, tenants!inner(property_id)")
    .eq("tenants.property_id", propertyId)
    .gte("created_at", `${dateFrom}T00:00:00+02:00`)
    .lte("created_at", `${dateTo}T23:59:59+02:00`)
    .limit(20000);

  type LedgerRow = {
    amount: number; paid_amount: number | null; status: string | null; source: string | null; event_type: string | null;
    origin: string | null; affects_balance: boolean | null; voided_at: string | null; created_at: string;
  };
  let rentCollected = 0;
  for (const r of (ledger ?? []) as LedgerRow[]) {
    if (r.voided_at || r.affects_balance === false) continue;
    if (r.event_type === "payment") {
      if (r.origin === "penalty_waiver" || r.origin === "import" || Number(r.amount) >= 0) continue;
      rentCollected += -Number(r.amount);
    } else if (r.event_type == null && (r.source === "manual" || r.source === "lenco")) {
      if (r.status === "paid") rentCollected += Number(r.paid_amount ?? r.amount);
      else if (r.status === "partial") rentCollected += Number(r.paid_amount ?? 0);
    }
  }

  const { data: expenses } = await supabase
    .from("expenses")
    .select("name, amount, category_id, expense_categories(name)")
    .eq("property_id", propertyId)
    .gte("date", dateFrom)
    .lte("date", dateTo);

  type ExpenseRow = { name: string; amount: number; category_id: string | null; expense_categories: { name: string } | null };
  const byCategory = new Map<string, number>();
  for (const e of (expenses ?? []) as ExpenseRow[]) {
    const categoryName = e.expense_categories?.name ?? "Uncategorised";
    byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + Number(e.amount));
  }
  const breakdown = Array.from(byCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const totalExpenses = breakdown.reduce((s, b) => s + b.amount, 0);

  return { rentCollected, totalExpenses, net: rentCollected - totalExpenses, breakdown, periodLabel: monthYearLabel(dateFrom) };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const propertyId = payload.property_id?.trim();
  if (!propertyId) {
    return new Response(JSON.stringify({ error: "property_id is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateTo = payload.date_to?.trim() || today;
  const dateFrom = payload.date_from?.trim() || `${dateTo.slice(0, 7)}-01`;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let summary: Awaited<ReturnType<typeof computeIncomeVsExpenses>>;
  try {
    summary = await computeIncomeVsExpenses(supabase, propertyId, dateFrom, dateTo);
  } catch (e) {
    console.error("generate-auto-report: compute failed", e);
    return new Response(JSON.stringify({ error: "Couldn't build the report." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const { data: row, error } = await supabase
    .from("report_links")
    .insert({
      property_id: propertyId,
      period_label: summary.periodLabel,
      date_from: dateFrom,
      date_to: dateTo,
      rent_collected: summary.rentCollected,
      total_expenses: summary.totalExpenses,
      net: summary.net,
      breakdown: summary.breakdown,
    })
    .select("public_token")
    .single();

  if (error || !row) {
    console.error("generate-auto-report: insert failed", error);
    return new Response(JSON.stringify({ error: "Report computed, but couldn't be saved." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true, token: row.public_token }), { headers: { "Content-Type": "application/json" } });
});
