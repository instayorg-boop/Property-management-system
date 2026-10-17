import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";

// The auto-generated report a landlord's milestone/weekly/monthly text links to, no dashboard
// sign-in needed, same reasoning as subscriptionPay.ts for the landlord's own IPM fee link: the
// token only ever reaches them via an SMS to their own phone.

export type ReportLinkBreakdownItem = { category: string; amount: number };

export type ReportKind = "milestone" | "weekly" | "monthly";

export type ReportOverdueRow = { tenant: string; unit: string; amount: number; days: number };
export type ReportMaintenanceRow = { issue: string; status: string; priority: string; reported: string };
export type ReportWeekRow = { from: string; to: string; collected: number; maintenance_opened: number };
export type ReportTip = { key: string; path: string; text: string };

/** The figures object returned only for weekly/monthly reports. Every field is optional —
 * the backend omits anything it has nothing to say, and the UI must hide that block rather
 * than show a zero or "undefined" for it. */
export type ReportData = {
  property_name?: string;
  date_from?: string;
  date_to?: string;
  collected?: number;
  prev_collected?: number | null;
  collected_change_pct?: number | null;
  active_tenants?: number;
  paid_up?: number;
  overdue_count?: number;
  overdue_total?: number;
  oldest_overdue_days?: number;
  overdue_list?: ReportOverdueRow[];
  expenses_total?: number;
  prev_expenses_total?: number | null;
  net?: number;
  expenses_by_category?: ReportLinkBreakdownItem[];
  maintenance_open?: number;
  maintenance_opened?: number;
  maintenance_resolved?: number;
  maintenance_open_list?: ReportMaintenanceRow[];
  weeks?: ReportWeekRow[];
};

/** Money section, visible only to people with `payouts.view`. Payout shape is rendered
 * defensively — fields are whatever the backend happens to include. */
export type ReportMoneyPayout = Record<string, unknown>;
export type ReportMoney = { payouts: ReportMoneyPayout[]; total?: number };

export type ReportLinkData = {
  kind: ReportKind;
  propertyName: string;
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  rentCollected: number;
  totalExpenses: number;
  net: number;
  breakdown: ReportLinkBreakdownItem[];
  createdAt: string;
  narrative: string | null;
  tips: ReportTip[];
  data: ReportData | null;
  money: ReportMoney | null;
};

type RawResponse = {
  ok?: boolean;
  kind?: ReportKind;
  propertyName?: string;
  periodLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  rentCollected?: number;
  totalExpenses?: number;
  net?: number;
  breakdown?: ReportLinkBreakdownItem[];
  createdAt?: string;
  narrative?: string | null;
  tips?: ReportTip[];
  data?: ReportData | null;
  money?: ReportMoney | null;
  error?: string;
};

export async function getReportLink(token: string): Promise<ReportLinkData> {
  const { data, error } = await supabase.functions.invoke<RawResponse>("report-link-get", { body: { token } });

  if (error || !data?.ok || !data?.propertyName) {
    throw new Error(await edgeFunctionErrorMessage(error, "This link isn't valid anymore."));
  }

  return {
    kind: data.kind ?? "milestone",
    propertyName: data.propertyName,
    periodLabel: data.periodLabel ?? "",
    dateFrom: data.dateFrom ?? "",
    dateTo: data.dateTo ?? "",
    rentCollected: data.rentCollected ?? 0,
    totalExpenses: data.totalExpenses ?? 0,
    net: data.net ?? 0,
    breakdown: data.breakdown ?? [],
    createdAt: data.createdAt ?? "",
    narrative: data.narrative ?? null,
    tips: data.tips ?? [],
    data: data.data ?? null,
    money: data.money ?? null,
  };
}
