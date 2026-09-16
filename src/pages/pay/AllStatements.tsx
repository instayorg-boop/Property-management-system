import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPortalTenant, getPortalLedger, groupPortalLedger, groupPortalLedgerByMonth, type PortalTenant, type PortalLedgerRow } from "../../lib/payPortal";
import { usePortalIdentity } from "./usePortalIdentity";
import PortalHeader from "./PortalHeader";
import PortalFooter from "./PortalFooter";
import BackArrow from "./BackArrow";
import { Skeleton as SkeletonBlock } from "../../landlord/components/Skeleton";

function formatMoney(amount: number): string {
  return `K${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function rowAmountColor(row: PortalLedgerRow): string {
  if (row.status === "paid") return "var(--green)";
  if (row.status === "partial") return "var(--amber)";
  if (row.status === "overdue" || row.status === "unpaid") return "var(--red)";
  return "var(--ink)";
}

export default function AllStatements() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { propertySlug, tenantId, propertyName, propertyLogoUrl, notFound } = usePortalIdentity(token);
  const [tenant, setTenant] = useState<PortalTenant | null | undefined>(undefined);
  const [ledger, setLedger] = useState<PortalLedgerRow[]>([]);
  const [monthFilter, setMonthFilter] = useState("all");

  useEffect(() => {
    if (!propertySlug || !tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await getPortalTenant(propertySlug, tenantId);
        if (cancelled) return;
        setTenant(t);
        if (t) setLedger(await getPortalLedger(t.id));
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load statement history", err);
        setTenant(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertySlug, tenantId]);

  const groupedLedger = useMemo(() => groupPortalLedger(ledger), [ledger]);
  // Grouped by the month each row is actually FOR (parsed from its label, falling back to its own
  // date) — not by when it happened to be logged, so a rent charge and the filter option for it
  // always agree on which month it belongs to. Same structure/grouping as the landlord's own
  // tenant ledger.
  const monthGroups = useMemo(() => groupPortalLedgerByMonth(groupedLedger), [groupedLedger]);
  const visibleGroups = monthFilter === "all" ? monthGroups : monthGroups.filter((g) => g.key === monthFilter);

  return (
    <div className="all-statements-page">
      <style>{`
        .all-statements-page {
          /* Deliberately NOT the same white as --paper-raised — see RentStatement.tsx's note; the
             perforation strip's "holes" are punched in this color and need to actually contrast
             against the card. */
          --paper: #F6F5F1;
          --paper-raised: #FFFFFF;
          --ink: #1B2420;
          --ink-muted: #5B665F;
          --rule: rgba(27,36,32,0.14);
          --green: #16A34A;
          --amber: #9C6B22;
          --red: #DC2626;
          --action: #1E3A8A;
          --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
          --sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

          background: var(--paper);
          color: var(--ink);
          font-family: var(--sans);
          min-height: 100vh;
        }
        .all-statements-page * { box-sizing: border-box; }
        .all-statements-page .page { width: 100%; max-width: 440px; margin: 0 auto; padding: 20px 16px 48px; }

        .all-statements-page .back {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--sans); font-size: 13px; color: var(--ink-muted);
          background: none; border: none; padding: 0; cursor: pointer; margin: 4px 0 18px;
        }
        .all-statements-page .back:hover { color: var(--ink); }

        .all-statements-page h1 { font-family: var(--serif); font-weight: 500; font-size: 22px; margin: 0 0 4px; }
        .all-statements-page .sub { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); margin: 0 0 18px; }

        .all-statements-page select {
          width: 100%; padding: 10px 12px; margin-bottom: 16px;
          font-family: var(--sans); font-size: 13px; color: var(--ink);
          background: var(--paper); border: 1px solid var(--rule); border-radius: 2px;
        }

        .all-statements-page .card {
          background: var(--paper-raised); border: 1px solid var(--rule); border-radius: 2px; overflow: hidden;
          box-shadow: 0 1px 3px rgba(27,36,32,0.06), 0 4px 14px rgba(27,36,32,0.04);
        }
        .all-statements-page .perforation {
          height: 14px;
          background-image: radial-gradient(circle at 8px 0px, var(--paper) 6px, transparent 6.5px);
          background-size: 16px 14px;
          background-repeat: repeat-x;
          background-position: center top;
        }
        .all-statements-page table { width: 100%; border-collapse: collapse; }
        .all-statements-page tr { border-top: 1px solid var(--rule); }
        .all-statements-page tr:first-child { border-top: none; }
        .all-statements-page tr.month-row { border-top: none; }
        .all-statements-page .month-label {
          padding: 14px 16px 6px; font-family: var(--sans); font-size: 10px; font-weight: 600;
          letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-muted); background: #FAFAF8;
        }
        .all-statements-page tr.month-row:first-child .month-label { padding-top: 12px; }
        .all-statements-page td { padding: 12px 16px; font-family: var(--sans); font-size: 14px; vertical-align: top; }
        .all-statements-page td.desc { color: var(--ink); }
        .all-statements-page td.desc .date { display: block; font-size: 11px; color: var(--ink-muted); margin-top: 2px; }
        .all-statements-page td.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .all-statements-page td.amt .paid-of { display: block; font-size: 11px; color: var(--ink-muted); margin-top: 2px; }
        .all-statements-page .row-tag {
          display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 500;
          padding: 1px 6px; border-radius: 2px; vertical-align: middle;
          background: #F1E7D4; color: var(--amber);
        }
        .all-statements-page .empty {
          padding: 40px 16px; text-align: center; font-family: var(--sans); font-size: 13px; color: var(--ink-muted);
        }
      `}</style>

      <PortalHeader propertyName={propertyName} avatarUrl={propertyLogoUrl} />

      <div className="page">
        <button type="button" className="back" onClick={() => navigate(`/p/${token}`)}>
          <BackArrow className="h-3.5 w-3.5" />
          Back to statement
        </button>

        <h1>Statement history</h1>
        {tenant && <p className="sub">{tenant.name} · {tenant.room}</p>}

        {monthGroups.length > 1 && (
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Filter by month">
            <option value="all">All statements</option>
            {monthGroups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        )}

        {notFound || tenant === null ? (
          <p className="sub">We couldn't load this statement. Open your payment link again.</p>
        ) : tenant === undefined ? (
          <div className="card" style={{ padding: 16 }}>
            <SkeletonBlock className="h-4 w-40 mb-3" />
            <SkeletonBlock className="h-4 w-full mb-2" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="card">
            <div className="perforation" />
            <p className="empty">Nothing to show for this period.</p>
          </div>
        ) : (
          <div className="card">
            <div className="perforation" />
            <table>
              <tbody>
                {visibleGroups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="month-row">
                      <td colSpan={2} className="month-label">
                        {group.label}
                      </td>
                    </tr>
                    {group.rows.map((row, i) => {
                      const isPartialRow = row.paidAmount !== undefined && row.paidAmount < row.amount;
                      return (
                        <tr key={`${group.key}-${i}`}>
                          <td className="desc">
                            {row.label}
                            {isPartialRow && <span className="row-tag">Partial</span>}
                            <span className="date">{formatShortDate(row.createdAt)}</span>
                          </td>
                          <td className="amt" style={{ color: rowAmountColor(row) }}>
                            {formatMoney(row.amount)}
                            {row.paidAmount !== undefined && (
                              <span className="paid-of">
                                <span style={{ color: "var(--green)" }}>{formatMoney(row.paidAmount)} paid</span>
                                {isPartialRow && (
                                  <span style={{ color: "var(--red)" }}>
                                    {" "}
                                    · {formatMoney(row.amount - row.paidAmount)} left
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PortalFooter />
      </div>
    </div>
  );
}
