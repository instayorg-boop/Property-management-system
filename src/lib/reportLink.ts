import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";

// The auto-generated income vs expenses summary a landlord's 100%-paid milestone texts a direct
// link to, no dashboard sign-in needed, same reasoning as subscriptionPay.ts for the landlord's
// own IPM fee link: the token only ever reaches them via an SMS to their own phone.

export type ReportLinkBreakdownItem = { category: string; amount: number };

export type ReportLinkData = {
  propertyName: string;
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  rentCollected: number;
  totalExpenses: number;
  net: number;
  breakdown: ReportLinkBreakdownItem[];
  createdAt: string;
};

export async function getReportLink(token: string): Promise<ReportLinkData> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    propertyName?: string;
    periodLabel?: string;
    dateFrom?: string;
    dateTo?: string;
    rentCollected?: number;
    totalExpenses?: number;
    net?: number;
    breakdown?: ReportLinkBreakdownItem[];
    createdAt?: string;
    error?: string;
  }>("report-link-get", { body: { token } });

  if (error || !data?.ok || !data?.propertyName) {
    throw new Error(await edgeFunctionErrorMessage(error, "This link isn't valid anymore."));
  }

  return {
    propertyName: data.propertyName,
    periodLabel: data.periodLabel ?? "",
    dateFrom: data.dateFrom ?? "",
    dateTo: data.dateTo ?? "",
    rentCollected: data.rentCollected ?? 0,
    totalExpenses: data.totalExpenses ?? 0,
    net: data.net ?? 0,
    breakdown: data.breakdown ?? [],
    createdAt: data.createdAt ?? "",
  };
}
