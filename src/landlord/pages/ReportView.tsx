import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReportDocument from "../../components/ReportDocument";
import type { ReportLinkData, ReportMoney } from "../../lib/reportLink";
import { supabase } from "../../lib/supabaseClient";
import { useAccess } from "../AccessContext";

/**
 * The in-app, authenticated counterpart to the public `/report/:token` page. A team member
 * browsing the "Weekly & monthly" history tab (src/landlord/pages/Reports.tsx) lands here instead
 * of on the public token page, because the public page's data comes from the `report-link-get`
 * edge function, which always includes the money/payouts section — there's no login there to
 * check a permission against, so it can't withhold it. Here there is a login, so:
 *
 *  - The report row itself (and the property name) is read straight from `report_links` via the
 *    authenticated client, scoped by `id` (not `public_token`) and by the caller's RLS.
 *  - The money section is gated twice: client-side on `payouts.view` (matching how the rest of
 *    the app hides money UI behind `useAccess().can`, e.g. Payouts.tsx), and again server-side —
 *    `report_link_money` is RLS-protected, so even if the client-side check were ever bypassed,
 *    a caller without `payouts.view` gets back no rows for it.
 */
export default function ReportView() {
  const { id } = useParams();
  const { can, isOwner } = useAccess();
  const canSeePayouts = isOwner || can("payouts.view");

  const [report, setReport] = useState<ReportLinkData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoadError(null);
      setReport(null);

      // `report_links`/`report_link_money` aren't in the generated Supabase types yet, cast
      // through `any` like elsewhere in this app (see Reports.tsx).
      const { data: row, error } = await (supabase as any)
        .from("report_links")
        .select(
          "id, kind, period_label, date_from, date_to, rent_collected, total_expenses, net, breakdown, narrative, tips, data, created_at, property_id, properties(name)",
        )
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      if (error || !row) {
        setLoadError("This report isn't available.");
        return;
      }

      let money: ReportMoney | null = null;
      if (canSeePayouts) {
        // RLS on report_link_money scopes this to callers with payouts.view anyway — the
        // client-side `canSeePayouts` check above is the UI guard, this query is just how the
        // data gets fetched for people who pass it. For everyone else it's skipped outright so
        // there's no money query at all, not just an empty result to not render.
        const { data: moneyRow } = await (supabase as any)
          .from("report_link_money")
          .select("data")
          .eq("report_id", id)
          .maybeSingle();
        if (moneyRow?.data) {
          money = moneyRow.data as ReportMoney;
        }
      }

      if (cancelled) return;

      setReport({
        kind: row.kind ?? "milestone",
        propertyName: row.properties?.name ?? "",
        periodLabel: row.period_label ?? "",
        dateFrom: row.date_from ?? "",
        dateTo: row.date_to ?? "",
        rentCollected: row.rent_collected ?? 0,
        totalExpenses: row.total_expenses ?? 0,
        net: row.net ?? 0,
        breakdown: row.breakdown ?? [],
        createdAt: row.created_at ?? "",
        narrative: row.narrative ?? null,
        tips: row.tips ?? [],
        data: row.data ?? null,
        money,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, canSeePayouts]);

  if (loadError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-line bg-paper p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink">Report not available</p>
          <p className="mt-1.5 text-sm text-muted">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto w-full max-w-[794px] px-4 py-8 sm:px-10">
        <div className="flex flex-col gap-3">
          <div className="h-8 w-2/3 animate-pulse rounded bg-mist" />
          <div className="h-32 w-full animate-pulse rounded bg-mist" />
          <div className="h-48 w-full animate-pulse rounded bg-mist" />
        </div>
      </div>
    );
  }

  return <ReportDocument report={report} />;
}
