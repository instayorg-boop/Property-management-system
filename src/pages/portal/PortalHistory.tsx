import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";
import { groupPortalLedger, groupPortalLedgerByMonth, type PortalLedgerRow } from "../../lib/payPortal";
import { usePortal } from "./portalData";
import { ledgerEntryKey } from "./PortalPaymentDetail";
import { Card, Pill, PortalMessage, PortalTopBar, PoweredByInstay, Shimmer, formatDate, formatMoney, type ToneName } from "./portalUi";

/** What a ledger row's status is telling you at a glance, so a long column of figures doesn't
 * force a read of every date just to tell paid months from open ones. An ad-hoc charge or credit
 * has no status at all and is left unlabelled rather than defaulted to "Paid", which would
 * misread an unsettled charge as already settled. */
function rowTone(row: PortalLedgerRow): { tone: ToneName; label: string } | null {
  if (row.status === "paid") return { tone: "green", label: "Paid" };
  if (row.status === "partial") return { tone: "amber", label: "Partial" };
  if (row.status === "overdue") return { tone: "red", label: "Overdue" };
  if (row.status === "unpaid") return { tone: "amber", label: "Unpaid" };
  return null;
}

export default function PortalHistory() {
  const { token } = useParams();
  const { ledger, loading, notFound } = usePortal(token);
  const [monthFilter, setMonthFilter] = useState("all");

  // Two entries can legitimately share one label (a partial payment, then a later top-up against
  // the same period) — grouping them is display-only and never written back. Without it, two real
  // transactions against one month read as double-billing.
  const monthGroups = useMemo(() => groupPortalLedgerByMonth(groupPortalLedger(ledger)), [ledger]);
  const visible = monthFilter === "all" ? monthGroups : monthGroups.filter((g) => g.key === monthFilter);

  if (loading) {
    return (
      <>
        <PortalTopBar title="Payment history" fallbackTo={`/p/${token}`} />
        <Shimmer className="h-30 w-full rounded-lg" />
        <Shimmer className="mt-4 h-30 w-full rounded-lg" />
      </>
    );
  }

  return (
    <>
      <PortalTopBar title="Payment history" fallbackTo={`/p/${token}`} />

      {notFound || monthGroups.length === 0 ? (
        <PortalMessage
          title="Nothing here yet"
          body="Once rent is charged or a payment goes through, every entry shows up here."
        />
      ) : (
        <>
          {monthGroups.length > 1 && (
            <div className="mb-4">
              <label htmlFor="history-month" className="sr-only">
                Filter by month
              </label>
              <select
                id="history-month"
                className="p-input"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              >
                <option value="all">All months</option>
                {monthGroups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-5">
            {visible.map((group) => (
              <section key={group.key}>
                <h2 className="mb-2 px-1 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
                  {group.label}
                </h2>
                <Card>
                  {/* Every entry opens its own page — the full breakdown of what was charged and
                      settled, with the PDF receipt attached to it. That is what a tenant is
                      actually after when they tap a payment, so there is no separate documents
                      screen to go hunting through. */}
                  {group.rows.map((row) => {
                    const tone = rowTone(row);
                    return (
                      <Link
                        key={ledgerEntryKey(row)}
                        to={`/p/${token}/history/${ledgerEntryKey(row)}`}
                        className="p-row no-underline"
                        style={{ alignItems: "flex-start" }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium" style={{ color: "var(--p-ink)" }}>
                            {row.label}
                          </span>
                          <span className="mt-0.5 block text-[12px]" style={{ color: "var(--p-muted)" }}>
                            {formatDate(row.createdAt)}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <span className="num text-[15px] font-semibold">{formatMoney(row.amount)}</span>
                          {tone && <Pill tone={tone.tone}>{tone.label}</Pill>}
                        </span>
                        <span className="mt-0.5 shrink-0" style={{ color: "var(--p-line-strong)" }}>
                          <CaretRight size={16} weight="bold" />
                        </span>
                      </Link>
                    );
                  })}
                </Card>
              </section>
            ))}
          </div>

          {/* A quiet text link, not a tile: receipts now live on each payment, but a lease or
              anything else the manager files still has to be reachable from somewhere. */}
          <Link
            to={`/p/${token}/documents`}
            className="mt-6 block text-center text-[13px] font-semibold no-underline"
            style={{ color: "var(--p-accent)" }}
          >
            All documents
          </Link>
        </>
      )}

      <div className="flex-1" />
      <PoweredByInstay />
    </>
  );
}
