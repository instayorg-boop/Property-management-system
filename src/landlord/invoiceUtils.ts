import type { Tenant } from "./TenantsContext";
import type { Invoice } from "./InvoicesContext";
import { supabase } from "../lib/supabaseClient";

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

/** Late penalty accrued so far — days overdue × this tenant's own daily rent rate (see
 * `dailyRentRate`), the one place this formula lives so invoicing and any other "what do they owe
 * right now" view stay in sync. */
export function calcPenalty(tenant: Tenant): number {
  return tenant.daysOverdue && tenant.daysOverdue > 0 ? Math.round(tenant.daysOverdue * dailyRentRate(tenant)) : 0;
}

/** A tenant's true total outstanding balance right now: carried-over arrears (`owedAmount` already
 * rolls forward month to month, see the note on `calcTenantInvoice` below) plus any penalty accrued
 * since their grace period lapsed. Zero once they're paid up. */
export function calcTotalOwed(tenant: Tenant): number {
  if (tenant.status === "paid") return 0;
  return tenant.owedAmount + calcPenalty(tenant);
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

/** Calls the `send-whatsapp` edge function (see supabase/functions/send-whatsapp) to deliver an
 * invoice over WhatsApp. That function is currently a placeholder — no WhatsApp Business account
 * is connected yet, so it accepts the request and no-ops instead of actually sending — but the
 * plumbing here is real, so the UI's send flow ("Invoices sent to X tenants") already reflects
 * what will happen once WhatsApp is wired up, with no further changes needed on this end. */
export async function sendInvoiceViaWhatsApp(tenant: Tenant, invoice: Invoice, propertyName: string): Promise<boolean> {
  const { error } = await supabase.functions.invoke("send-whatsapp", {
    body: {
      phone: tenant.phones[0],
      tenantName: tenant.name,
      propertyName,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.amount,
      dueDate: invoice.dueAt,
    },
  });
  if (error) {
    console.error("Failed to send invoice via WhatsApp", error);
    return false;
  }
  return true;
}

export function formatMoney(n: number): string {
  return `K${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
