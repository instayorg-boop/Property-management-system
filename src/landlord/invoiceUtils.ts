import type { Tenant } from "./TenantsContext";

export function slugify(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function periodLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function previousMonthDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

/** Tenant.moveInDate is stored as a formatted display string (e.g. "12 Jan 2025"), not ISO — this
 * parses that back into a Date, returning null if it's not in a recognizable form. */
function parseDisplayDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A tenant's first invoice period is pro-rata only when their move-in month/year matches the
 * invoice period exactly and they didn't move in on the 1st (the billing cycle's start). */
export function getProrataInfo(tenant: Tenant, periodDate: Date): { isProrata: boolean; days: number; totalDays: number } {
  const moveIn = parseDisplayDate(tenant.moveInDate);
  if (!moveIn) return { isProrata: false, days: 0, totalDays: 0 };
  const sameMonth = moveIn.getFullYear() === periodDate.getFullYear() && moveIn.getMonth() === periodDate.getMonth();
  if (!sameMonth || moveIn.getDate() === 1) return { isProrata: false, days: 0, totalDays: 0 };
  const totalDays = daysInMonth(periodDate.getFullYear(), periodDate.getMonth());
  const days = totalDays - moveIn.getDate() + 1;
  return { isProrata: true, days, totalDays };
}

/** A tenant's own room rate, prorated to a daily figure against the current calendar month — e.g.
 * K1400/mo in a 30-day month is K46.67/day. This is the daily late-penalty rate, room-type-specific
 * rather than one flat K/day figure set globally in Settings. */
export function dailyRentRate(tenant: Tenant, now: Date = new Date()): number {
  return tenant.rentAmount / daysInMonth(now.getFullYear(), now.getMonth());
}

export type LateFeeMode = "fixed" | "percent_of_rent" | "prorated_rent";

export type LateFeeConfig = {
  /** Whether this property charges automatic late fees at all — off means calcLatePenalty always
   * returns 0, regardless of mode (a property that simply doesn't do late fees). */
  enabled: boolean;
  mode: LateFeeMode;
  /** K/day, used when mode = "fixed" (Settings' `dailyPenaltyRate`). */
  fixedAmountPerDay: number;
  /** % of rent/day, used when mode = "percent_of_rent". */
  percentPerDay: number;
  capEnabled: boolean;
  /** Max total accrued fee, enforced when capEnabled. */
  capAmount: number | null;
};

/** The original, and still the default, behavior: rent / days-in-month per day overdue. Used
 * whenever no landlord-configured mode is available yet (e.g. before settings have loaded). */
export const DEFAULT_LATE_FEE_CONFIG: LateFeeConfig = {
  enabled: true,
  mode: "prorated_rent",
  fixedAmountPerDay: 0,
  percentPerDay: 1,
  capEnabled: false,
  capAmount: null,
};

// Landlord-app call sites (Dashboard, Rent, Rooms, TenantProfile, reports, drawers, ...) all derive
// the penalty from just a tenant object, with no settings in hand at the call site — rather than
// threading the landlord's chosen late-fee config through every one of them, SettingsContext pushes
// it in here once (see its lateFeeConfig effect) and every landlord-side caller reads the latest
// value automatically. The tenant portal (payPortal.ts) isn't mounted under SettingsProvider, so it
// always passes its own config explicitly instead of relying on this.
let activeLateFeeConfig: LateFeeConfig = DEFAULT_LATE_FEE_CONFIG;

export function setLateFeeConfig(config: LateFeeConfig): void {
  activeLateFeeConfig = config;
}

/** Late fee accrued so far under the given (or currently active) config — days overdue × the
 * configured daily rate, capped if a cap is set. The one canonical formula so invoicing, the
 * landlord's Rent list, and the tenant payment portal (see payPortal.ts, which mirrors this for the
 * differently-shaped PortalTenant/DB row) all agree on what's owed right now. */
export function calcLatePenalty(
  rentAmount: number,
  daysOverdue: number | undefined,
  config: LateFeeConfig = activeLateFeeConfig,
  now: Date = new Date()
): number {
  if (!config.enabled || !daysOverdue || daysOverdue <= 0) return 0;

  let raw: number;
  switch (config.mode) {
    case "fixed":
      raw = daysOverdue * config.fixedAmountPerDay;
      break;
    case "percent_of_rent":
      raw = daysOverdue * (rentAmount * (config.percentPerDay / 100));
      break;
    case "prorated_rent":
    default:
      raw = daysOverdue * (rentAmount / daysInMonth(now.getFullYear(), now.getMonth()));
      break;
  }

  raw = Math.max(0, Math.round(raw));
  if (config.capEnabled && config.capAmount != null) raw = Math.min(raw, config.capAmount);
  return raw;
}

export function calcPenalty(tenant: Tenant): number {
  return calcLatePenalty(tenant.rentAmount, tenant.daysOverdue);
}

/** Human-readable late-fee rate for the invoice footer disclaimer — format depends on the
 * configured mode (a flat/prorated rate reads as "K.../day", a percentage doesn't have a fixed
 * K amount since it scales with rent). Mirrors whatever mode is currently active. */
export function lateFeeDisclaimerLabel(tenant: Tenant, config: LateFeeConfig = activeLateFeeConfig, now: Date = new Date()): string {
  if (!config.enabled) return "";
  switch (config.mode) {
    case "fixed":
      return `K${config.fixedAmountPerDay.toFixed(2)}/day`;
    case "percent_of_rent":
      return `${config.percentPerDay}% of rent/day`;
    case "prorated_rent":
    default:
      return `K${dailyRentRate(tenant, now).toFixed(2)}/day`;
  }
}

/** A tenant's true total outstanding balance right now: carried-over arrears (`owedAmount` already
 * rolls forward month to month, see the note on `calcTenantInvoice` below) plus any penalty accrued
 * since their grace period lapsed. Reads `owedAmount` directly rather than short-circuiting on
 * `status === "paid"` — a charge/adjustment added after a tenant is marked paid flips `owedAmount`
 * positive again before the server has a chance to also flip `status`, and this must reflect that
 * immediately rather than showing 0 until the status catches up. */
export function calcTotalOwed(tenant: Tenant): number {
  return Math.max(0, tenant.owedAmount) + calcPenalty(tenant);
}

export type InvoiceLineItem = { label: string; amount: number; tint?: boolean };

export type TenantInvoiceCalc = {
  tenant: Tenant;
  rentAmount: number;
  isProrata: boolean;
  prorataDays: number;
  prorataTotalDays: number;
  outstanding: number;
  penalty: number;
  total: number;
  lineItems: InvoiceLineItem[];
};

/** Builds the rent/outstanding/penalty breakdown for one tenant's invoice in a given period.
 * `rentOverride` lets the landlord adjust the base rent line before generating (edit-in-place on
 * the review screen) without touching the tenant's actual agreed rent. */
export function calcTenantInvoice(tenant: Tenant, periodDate: Date, rentOverride?: number): TenantInvoiceCalc {
  const { isProrata, days, totalDays } = getProrataInfo(tenant, periodDate);
  const fullRent = rentOverride ?? tenant.rentAmount;
  const rentAmount = isProrata ? Math.round((fullRent / totalDays) * days) : fullRent;

  // The data model only tracks one rolled-up `owedAmount`/`daysOverdue` per tenant (no per-period
  // ledger breakdown of "how much was outstanding" vs "how much was penalty"), so for a tenant who
  // isn't paid up, `owedAmount` is treated as the carried-over outstanding balance from before this
  // invoice, and any penalty is derived from `daysOverdue` × the configured daily rate.
  const outstanding = tenant.status === "paid" ? 0 : tenant.owedAmount;
  const penalty = calcPenalty(tenant);
  const total = rentAmount + outstanding + penalty;

  const rentLabel = isProrata
    ? `${periodLabel(periodDate)} rent, partial month (${days} days)`
    : `${periodLabel(periodDate)} rent`;

  const lineItems: InvoiceLineItem[] = [{ label: rentLabel, amount: rentAmount }];
  if (outstanding > 0) {
    lineItems.push({ label: `Outstanding balance (${periodLabel(previousMonthDate(periodDate)).split(" ")[0]})`, amount: outstanding, tint: true });
  }
  if (penalty > 0) {
    lineItems.push({ label: `Late penalty (${tenant.daysOverdue} days overdue)`, amount: penalty, tint: true });
  }

  return { tenant, rentAmount, isProrata, prorataDays: days, prorataTotalDays: totalDays, outstanding, penalty, total, lineItems };
}

/** Due date is the tenant's usual due day for the invoice's month; "issued today". */
export function computeInvoiceDates(periodDate: Date, dueDay: number) {
  const issueDate = new Date();
  const clampedDueDay = Math.min(dueDay, daysInMonth(periodDate.getFullYear(), periodDate.getMonth()));
  const dueDate = new Date(periodDate.getFullYear(), periodDate.getMonth(), clampedDueDay);
  return { issueDate, dueDate };
}

export function isDueSoonOrPast(dueDate: Date): boolean {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / msPerDay);
  return daysUntilDue <= 7;
}

export function formatMoney(n: number): string {
  return `K${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
