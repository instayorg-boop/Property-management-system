import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ChartLineUp } from "@phosphor-icons/react";
import { getReportLink, type ReportLinkData } from "../../lib/reportLink";
import { Card, SectionLabel, MoneyRow, PortalFrame, PortalMessage, Shimmer, PoweredByInstay, formatDate } from "./portalUi";

/**
 * Where the "all tenants paid" milestone SMS sends the landlord: a plain summary of the month's
 * income vs expenses, no dashboard sign-in needed, same reasoning as SubscriptionPay.tsx for the
 * landlord's own fee link. There is nothing to log into here, the token itself is the one thing
 * that reveals this property's numbers, and there is no payment step on this page at all.
 */
export default function ReportLink() {
  const { token } = useParams();
  const [data, setData] = useState<ReportLinkData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getReportLink(token)
      .then(setData)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "This link isn't valid anymore."));
  }, [token]);

  if (loadError) {
    return (
      <PortalFrame>
        <PortalMessage title="Link not available" body={loadError} />
        <PoweredByInstay />
      </PortalFrame>
    );
  }

  if (!data) {
    return (
      <PortalFrame>
        <div className="flex flex-col gap-3 pt-8">
          <Shimmer className="h-8 w-2/3" />
          <Shimmer className="h-32 w-full" />
          <Shimmer className="h-48 w-full" />
        </div>
      </PortalFrame>
    );
  }

  return (
    <PortalFrame>
      <div className="mb-5 flex flex-col items-center gap-1 pt-4 text-center">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "var(--p-green-tint)", color: "var(--p-green)" }}
        >
          <ChartLineUp size={24} weight="bold" />
        </span>
        <h1 className="display mt-2 text-[19px] font-semibold">Income vs expenses</h1>
        <span className="text-[13px]" style={{ color: "var(--p-muted)" }}>
          {data.propertyName} &middot; {data.periodLabel}
        </span>
      </div>

      <Card className="flex flex-col gap-1">
        <MoneyRow label="Rent collected" amount={data.rentCollected} />
        <MoneyRow label="Total expenses" amount={data.totalExpenses} />
        <div className="my-1 border-t" style={{ borderColor: "var(--p-line)" }} />
        <MoneyRow label="Net income" amount={data.net} strong />
      </Card>

      {data.breakdown.length > 0 && (
        <>
          <SectionLabel>Expense breakdown</SectionLabel>
          <Card className="flex flex-col gap-1">
            {data.breakdown.map((item) => (
              <MoneyRow key={item.category} label={item.category} amount={item.amount} />
            ))}
          </Card>
        </>
      )}

      <p className="mt-6 text-center text-[12px]" style={{ color: "var(--p-muted)" }}>
        Covers {formatDate(data.dateFrom)} to {formatDate(data.dateTo)}. Open your dashboard any time for the full report history.
      </p>

      <PoweredByInstay />
    </PortalFrame>
  );
}
