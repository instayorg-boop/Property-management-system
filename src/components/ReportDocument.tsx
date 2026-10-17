import { useEffect } from "react";
import type { ReportLinkData, ReportMoneyPayout } from "../lib/reportLink";

/**
 * Renders a weekly/monthly/milestone property report as a plain A4-style document: the same
 * component is used by the public `/report/:token` page (fed from report-link-get) and by the
 * in-app reports history route (fed from a logged-in `report_links`/`report_link_money` query),
 * so money visibility is decided purely by whether the caller passes `money` in, not by anything
 * in here.
 *
 * This is a report, not a dashboard: centred white page, a brand-accent rule under the header,
 * thin-bordered tables with numbered captions, and a print stylesheet (see index.css) that keeps
 * each section's heading with its table and hides everything that isn't the page itself.
 */

function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `K${n.toLocaleString("en-ZM", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtMoneyOrZero(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "K0";
  return `K${n.toLocaleString("en-ZM", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Parses a YYYY-MM-DD date as a plain calendar date, no timezone shifting (new Date("YYYY-MM-DD")
 * is parsed as UTC midnight by the spec, but formatting it back out with a UTC-based formatter
 * avoids any local-timezone day shift). */
function dayName(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function monthLabel(iso: string): string {
  if (!iso) return "";
  const [y, m] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  return dt.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  return dayName(iso);
}

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "";
  const sign = n > 0 ? "+" : "";
  return ` (${sign}${n.toFixed(0)}%)`;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="report-heading mb-2 mt-7 font-display text-base font-semibold text-ink">{children}</h2>;
}

function Caption({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] text-muted">
      Table {n}. {children}
    </p>
  );
}

const th = "border border-line bg-mist px-2.5 py-1.5 text-left text-[11px] font-semibold text-ink print:bg-mist";
const td = "border border-line px-2.5 py-1.5 text-[12px] text-ink";

/** Boldens the `path` substring inside a tip's free-text sentence, e.g. "Settings > Notifications
 * > Alert phone number", if it literally appears in the text — no links or buttons, per spec. */
function TipText({ text, path }: { text: string; path: string }) {
  if (path && text.includes(path)) {
    const idx = text.indexOf(path);
    return (
      <p className="text-[12.5px] leading-relaxed text-ink">
        {text.slice(0, idx)}
        <strong>{path}</strong>
        {text.slice(idx + path.length)}
      </p>
    );
  }
  return <p className="text-[12.5px] leading-relaxed text-ink">{text}</p>;
}

export default function ReportDocument({ report, titlePrefix }: { report: ReportLinkData; titlePrefix?: string }) {
  const { kind, data, money } = report;
  const isMilestone = kind === "milestone" || !data;

  const periodLabel =
    report.periodLabel ||
    (kind === "monthly"
      ? monthLabel(report.dateFrom)
      : kind === "weekly"
        ? `${fmtDate(report.dateFrom)} to ${fmtDate(report.dateTo)}`
        : "");

  useEffect(() => {
    const prevTitle = document.title;
    const title = `${report.propertyName} ${periodLabel} report`.trim();
    document.title = titlePrefix ? `${titlePrefix} ${title}` : title;

    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);

    return () => {
      document.title = prevTitle;
      document.head.removeChild(meta);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.propertyName, periodLabel]);

  const headerLabel = kind === "weekly" ? "Weekly property report" : kind === "monthly" ? "Monthly property report" : "Income vs expenses";

  return (
    <div className="mx-auto w-full max-w-[794px] bg-paper px-4 py-8 sm:px-10 print:px-0 print:py-0" id="report-document">
      <div className="report-print-only mb-3 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-line bg-paper px-3.5 py-2 text-xs font-medium text-ink shadow-sm hover:bg-mist"
        >
          Download PDF
        </button>
      </div>

      <header className="border-b-2 border-brand pb-4">
        <p className="text-[10.5px] font-bold uppercase tracking-[.08em] text-muted">{headerLabel}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">{report.propertyName}</h1>
        {periodLabel && <p className="mt-0.5 text-sm text-muted">{periodLabel}</p>}
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
          <span>Prepared for: the owner</span>
          {report.createdAt && <span>Generated: {new Date(report.createdAt).toLocaleString()}</span>}
        </div>
      </header>

      {report.narrative && (
        <section>
          <SectionHeading>Summary</SectionHeading>
          <p className="text-[13px] leading-relaxed text-ink">{report.narrative}</p>
        </section>
      )}

      {isMilestone ? (
        <>
          <section>
            <SectionHeading>Key figures</SectionHeading>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className={td}>Rent collected</td>
                    <td className={td}>{fmtMoneyOrZero(report.rentCollected)}</td>
                  </tr>
                  <tr>
                    <td className={td}>Total expenses</td>
                    <td className={td}>{fmtMoneyOrZero(report.totalExpenses)}</td>
                  </tr>
                  <tr>
                    <td className={`${td} font-semibold`}>Net income</td>
                    <td className={`${td} font-semibold`}>{fmtMoneyOrZero(report.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {report.breakdown.length > 0 && (
            <section className="report-section">
              <SectionHeading>Expense breakdown</SectionHeading>
              <Caption n={1}>Expenses by category</Caption>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Category</th>
                      <th className={th}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.breakdown.map((item) => (
                      <tr key={item.category}>
                        <td className={td}>{item.category}</td>
                        <td className={td}>{fmtMoneyOrZero(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="mt-6 text-center text-[12px] text-muted">
            Covers {fmtDate(report.dateFrom)} to {fmtDate(report.dateTo)}. Open your dashboard any time for the full report history.
          </p>
        </>
      ) : (
        <FullReport report={report} data={data!} money={money} />
      )}

      <footer className="mt-10 border-t border-line pt-4 text-center text-[11px] text-muted">
        Generated by Instay Manage from your live records. The summary wording is written by AI; every figure comes from the database.
      </footer>
    </div>
  );
}

function KeyFigureRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className={td}>{label}</td>
      <td className={td}>{children}</td>
    </tr>
  );
}

function FullReport({
  report,
  data,
  money,
}: {
  report: ReportLinkData;
  data: NonNullable<ReportLinkData["data"]>;
  money: ReportLinkData["money"];
}) {
  const hasOverdue = data.overdue_list !== undefined;
  const hasMaintenance = data.maintenance_open_list !== undefined || data.maintenance_opened != null;
  const hasExpenses = data.expenses_by_category && data.expenses_by_category.length > 0;
  const hasPayouts = !!(money && Array.isArray(money.payouts) && money.payouts.length > 0);
  const hasWeeks = report.kind === "monthly" && data.weeks && data.weeks.length > 0;
  const hasTips = report.tips.length > 0;
  let tableNum = 0;

  const overdueTotal = (data.overdue_list ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const expensesCatTotal = (data.expenses_by_category ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <>
      <section>
        <SectionHeading>Key figures</SectionHeading>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>
              <KeyFigureRow label="Rent collected">
                {fmtMoneyOrZero(data.collected)}
                {data.prev_collected != null ? ` (previous period: ${fmtMoney(data.prev_collected)}${pct(data.collected_change_pct)})` : ""}
              </KeyFigureRow>
              {data.active_tenants != null && (
                <KeyFigureRow label="Tenants paid">
                  {data.paid_up ?? 0} of {data.active_tenants}
                </KeyFigureRow>
              )}
              {data.overdue_total != null && <KeyFigureRow label="Overdue amount">{fmtMoneyOrZero(data.overdue_total)}</KeyFigureRow>}
              {data.expenses_total != null && (
                <KeyFigureRow label="Expenses">
                  {fmtMoneyOrZero(data.expenses_total)}
                  {data.prev_expenses_total != null ? ` (previous period: ${fmtMoney(data.prev_expenses_total)})` : ""}
                </KeyFigureRow>
              )}
              {data.maintenance_open != null && (
                <KeyFigureRow label="Open maintenance requests">{data.maintenance_open}</KeyFigureRow>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {hasOverdue && (
        <section className="report-section">
          <SectionHeading>Overdue rent</SectionHeading>
          {(data.overdue_count ?? data.overdue_list!.length) === 0 ? (
            <p className="text-[13px] text-ink">No tenants are overdue.</p>
          ) : (
            <>
              <Caption n={++tableNum}>Overdue tenants</Caption>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Tenant</th>
                      <th className={th}>Unit</th>
                      <th className={th}>Amount</th>
                      <th className={th}>Days late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.overdue_list!.map((r, i) => (
                      <tr key={i}>
                        <td className={td}>{r.tenant}</td>
                        <td className={td}>{r.unit}</td>
                        <td className={td}>{fmtMoneyOrZero(r.amount)}</td>
                        <td className={td}>{r.days}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={`${td} font-semibold`} colSpan={2}>
                        Total
                      </td>
                      <td className={`${td} font-semibold`}>{fmtMoneyOrZero(overdueTotal)}</td>
                      <td className={td} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {hasMaintenance && (
        <section className="report-section">
          <SectionHeading>Maintenance</SectionHeading>
          <p className="mb-2 text-[13px] text-ink">
            {data.maintenance_opened ?? 0} opened, {data.maintenance_resolved ?? 0} resolved, {data.maintenance_open ?? 0} still open.
          </p>
          {data.maintenance_open_list && data.maintenance_open_list.length > 0 && (
            <>
              <Caption n={++tableNum}>Open requests</Caption>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Issue</th>
                      <th className={th}>Priority</th>
                      <th className={th}>Reported</th>
                      <th className={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.maintenance_open_list.map((r, i) => (
                      <tr key={i}>
                        <td className={td}>{r.issue}</td>
                        <td className={td}>
                          {r.priority?.toLowerCase() === "urgent" ? <strong>{r.priority}</strong> : r.priority}
                        </td>
                        <td className={td}>{r.reported}</td>
                        <td className={td}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {(hasExpenses || hasPayouts) && (
        <section className="report-section">
          <SectionHeading>Expenses and payouts</SectionHeading>
          {hasExpenses && (
            <>
              <Caption n={++tableNum}>Expenses by category</Caption>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Category</th>
                      <th className={th}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses_by_category!.map((item) => (
                      <tr key={item.category}>
                        <td className={td}>{item.category}</td>
                        <td className={td}>{fmtMoneyOrZero(item.amount)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className={`${td} font-semibold`}>Total</td>
                      <td className={`${td} font-semibold`}>{fmtMoneyOrZero(expensesCatTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {hasPayouts && (
            <div className="mt-4">
              <Caption n={++tableNum}>Payouts{money?.total != null ? ` — total ${fmtMoneyOrZero(money.total)}` : ""}</Caption>
              <PayoutsTable payouts={money!.payouts} />
            </div>
          )}
        </section>
      )}

      {hasWeeks && (
        <section className="report-section">
          <SectionHeading>Week by week</SectionHeading>
          <Caption n={++tableNum}>Weekly totals</Caption>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Week</th>
                  <th className={th}>Collected</th>
                  <th className={th}>Maintenance opened</th>
                </tr>
              </thead>
              <tbody>
                {data.weeks!.map((w, i) => (
                  <tr key={i}>
                    <td className={td}>
                      {fmtDate(w.from)} to {fmtDate(w.to)}
                    </td>
                    <td className={td}>{fmtMoneyOrZero(w.collected)}</td>
                    <td className={td}>{w.maintenance_opened}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {hasTips && (
        <div className="report-section mt-8 rounded-lg bg-mist p-4 print:bg-mist">
          <p className="mb-2 text-[13px] font-semibold text-ink">Get more from Instay Manage</p>
          <div className="space-y-2">
            {report.tips.map((tip) => (
              <TipText key={tip.key} text={tip.text} path={tip.path} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Renders every field a payout object happens to have, defensively — the exact shape hasn't
 * been confirmed against a live response, so nothing here assumes a field exists. */
function PayoutsTable({ payouts }: { payouts: ReportMoneyPayout[] }) {
  const knownCols: { key: string; label: string }[] = [
    { key: "date", label: "Date" },
    { key: "amount", label: "Amount" },
    { key: "requested_by", label: "Requested by" },
    { key: "destination", label: "Destination" },
    { key: "status", label: "Status" },
  ];
  const cols = knownCols.filter((c) => payouts.some((p) => p[c.key] !== undefined));
  const extraKeys = Array.from(
    new Set(payouts.flatMap((p) => Object.keys(p).filter((k) => !knownCols.some((c) => c.key === k)))),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={th}>
                {c.label}
              </th>
            ))}
            {extraKeys.map((k) => (
              <th key={k} className={th}>
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payouts.map((p, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key} className={td}>
                  {c.key === "amount" ? fmtMoneyOrZero(p[c.key] as number) : String(p[c.key] ?? "")}
                </td>
              ))}
              {extraKeys.map((k) => (
                <td key={k} className={td}>
                  {String(p[k] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
