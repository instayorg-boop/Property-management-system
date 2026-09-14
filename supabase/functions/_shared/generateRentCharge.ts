// Phase 3B — rent-charge-generation logic (design approved in chat history). Computes and
// idempotently inserts exactly one 'charge' ledger event for one tenant + one billing period.
// Never loops over historical periods itself: the caller decides which single billing_period_id
// to target (normally "this month"), and planRentCharge below only ever evaluates that one period
// against that tenant's move-in/move-out dates — there is no month-by-month backfill anywhere in
// this file. Does NOT touch tenants.owed_amount/status; the new charge coexists with the legacy
// stored balance until a later phase makes the event stream authoritative.

export type SettingsForBilling = { due_day: number; grace_period_days: number };

export type TenantForCharge = {
  id: string;
  rent_amount: number;
  move_in_date: string | null;
  move_out_date: string | null;
  active: boolean;
  due_day: number | null;
  grace_period_days: number | null;
};

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** Formats a Date's own local Y/M/D as 'YYYY-MM-DD' — never `.toISOString().slice(0, 10)`, which
 * converts to UTC first and silently shifts the date back a day for any positive UTC offset (e.g.
 * a local-midnight Sept 5 becomes "2026-09-04" once converted to UTC). due_date/grace_period_end
 * are calendar dates, not instants, so they must be read directly off the Date's local fields. */
function formatYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Tenant.move_in_date/move_out_date are stored as the same free-text display date the rest of
 * the app uses (e.g. "12 Jan 2025"), not ISO — mirrors invoiceUtils.ts's parseDisplayDate exactly,
 * so proration/eligibility here agrees with what invoice generation already computes. */
function parseDisplayDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type ChargePlan = {
  tenantId: string;
  billingPeriodId: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  gracePeriodEnd: string; // YYYY-MM-DD
  idempotencyKey: string;
  label: string;
};

/** Pure calculation, no DB access, so it can be dry-run/unit-tested without touching anything.
 * `periodDate` is any date inside the target billing month — only its year/month are used.
 * Returns null when this tenant shouldn't get a charge for this period at all (not yet moved in,
 * already moved out, inactive, or an unparseable move-in date). */
export function planRentCharge(tenant: TenantForCharge, settings: SettingsForBilling, periodDate: Date): ChargePlan | null {
  if (!tenant.active) return null;

  const year = periodDate.getFullYear();
  const month = periodDate.getMonth();
  const billingPeriodId = `${year}-${String(month + 1).padStart(2, "0")}`;
  const totalDays = daysInMonth(year, month);
  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month, totalDays);

  const moveIn = parseDisplayDate(tenant.move_in_date);
  if (!moveIn) return null; // can't safely decide proration/eligibility without a real move-in date
  if (moveIn > periodEnd) return null; // hadn't moved in yet as of this billing period

  const moveOut = parseDisplayDate(tenant.move_out_date);
  if (moveOut && moveOut < periodStart) return null; // already moved out before this billing period started

  // Mirrors invoiceUtils.ts's getProrataInfo: pro-rata only for the tenant's first period, and
  // only when they didn't move in on the 1st (the billing cycle's own start).
  const isFirstPeriod = moveIn.getFullYear() === year && moveIn.getMonth() === month;
  const isProrata = isFirstPeriod && moveIn.getDate() !== 1;
  const amount = isProrata ? Math.round((tenant.rent_amount / totalDays) * (totalDays - moveIn.getDate() + 1)) : tenant.rent_amount;

  // Mirrors invoiceUtils.ts's computeInvoiceDates: due day clamped to the days actually in this
  // month (e.g. a due_day of 31 in a 30-day month falls on the 30th).
  const dueDay = tenant.due_day ?? settings.due_day;
  const gracePeriodDays = tenant.grace_period_days ?? settings.grace_period_days;
  const clampedDueDay = Math.min(dueDay, totalDays);
  const dueDate = new Date(year, month, clampedDueDay);
  const gracePeriodEnd = new Date(dueDate);
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

  const monthLabel = periodDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const label = isProrata ? `${monthLabel} rent, partial month` : `${monthLabel} rent`;

  return {
    tenantId: tenant.id,
    billingPeriodId,
    amount,
    dueDate: formatYMD(dueDate),
    gracePeriodEnd: formatYMD(gracePeriodEnd),
    idempotencyKey: `rent_charge:${tenant.id}:${billingPeriodId}`,
    label,
  };
}

export type GenerateResult =
  | { tenantId: string; status: "created"; ledgerEntryId: string; billingPeriodId: string }
  | { tenantId: string; status: "already_exists"; billingPeriodId: string }
  | { tenantId: string; status: "skipped"; reason: string }
  | { tenantId: string; status: "dry_run"; plan: ChargePlan }
  | { tenantId: string; status: "error"; message: string };

/** Inserts exactly one 'charge' ledger event. Idempotency comes from the unique
 * (tenant_id, idempotency_key) index added in Phase 3A
 * (20260919000000_phase3a_financial_events.sql) — running this twice for the same tenant+period,
 * even concurrently, is always safe: the second insert hits that constraint (Postgres error code
 * 23505) and is reported as "already_exists" rather than creating a second charge. */
export async function generateRentCharge(
  supabase: SupabaseClient,
  tenant: TenantForCharge,
  settings: SettingsForBilling,
  periodDate: Date,
  options: { dryRun?: boolean } = {}
): Promise<GenerateResult> {
  const plan = planRentCharge(tenant, settings, periodDate);
  if (!plan) return { tenantId: tenant.id, status: "skipped", reason: "not active/eligible for this billing period" };
  if (options.dryRun) return { tenantId: tenant.id, status: "dry_run", plan };

  const { data, error } = await supabase
    .from("ledger_entries")
    .insert({
      tenant_id: plan.tenantId,
      label: plan.label,
      amount: plan.amount,
      source: "manual",
      event_type: "charge",
      affects_balance: true,
      origin: "billing_cycle",
      billing_period_id: plan.billingPeriodId,
      due_date: plan.dueDate,
      grace_period_end: plan.gracePeriodEnd,
      idempotency_key: plan.idempotencyKey,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { tenantId: tenant.id, status: "already_exists", billingPeriodId: plan.billingPeriodId };
    return { tenantId: tenant.id, status: "error", message: error.message };
  }

  // Phase 3E: sync this tenant's authoritative balance now that the charge is durably written —
  // a no-op for legacy/mixed tenants (sync_tenant_balance_if_new_model's own eligibility check).
  // Never mutates tenant balance directly here, matching this function's existing design; a sync
  // failure is logged, not treated as the charge itself having failed — it was already created.
  const { error: syncError } = await supabase.rpc("sync_tenant_balance_if_new_model", { p_tenant_id: tenant.id });
  if (syncError) {
    console.error("[generateRentCharge] charge created but balance sync failed", tenant.id, syncError.message);
  }

  return { tenantId: tenant.id, status: "created", ledgerEntryId: data!.id as string, billingPeriodId: plan.billingPeriodId };
}
