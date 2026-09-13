import { groupPortalLedger, type PortalTenant, type PortalLedgerRow } from "../../lib/payPortal";
import PortalHeader from "./PortalHeader";
import PortalFooter from "./PortalFooter";

/** K2,450.00 — 2 decimal places (the app-wide formatCurrency rounds to whole kwacha, which is too
 * coarse for a line-item ledger). */
function formatMoney(amount: number): string {
  return `K${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const statusTagLabel: Record<PortalTenant["status"], string> = {
  paid: "Paid up",
  overdue: "Overdue",
  unpaid: "Unpaid",
  partial: "Partial",
};

export type RentStatementOffice = {
  heading?: string;
  body: string;
};

export type RentStatementProps = {
  tenant: PortalTenant;
  ledger: PortalLedgerRow[];
  /** Not on PortalTenant yet — passed in separately (TenantBalance already fetches it via
   * getPortalProperty for the page chrome). Omitted entirely if not supplied. */
  propertyName?: string;
  /** Property/landlord photo — see PortalHeader's comment; omitted until upload exists. */
  avatarUrl?: string | null;
  /** Placeholder until property/landlord address is modeled anywhere — caller supplies real copy
   * once that data exists; this component doesn't fabricate an address. */
  office?: RentStatementOffice;
  onPay: () => void;
};

const DEFAULT_OFFICE: RentStatementOffice = {
  heading: "Prefer to pay in person?",
  body: "You can also pay at the property office during business hours. Paying online is quicker for both sides, but the choice is yours.",
};

export default function RentStatement({
  tenant,
  ledger,
  propertyName,
  avatarUrl,
  office = DEFAULT_OFFICE,
  onPay,
}: RentStatementProps) {
  const isClear = tenant.status === "paid" && tenant.owedAmount <= 0;
  const amountDue = tenant.owedAmount;

  // Two ledger entries can legitimately share one label (e.g. a partial payment against September,
  // then a later top-up payment against the same remaining balance) — the ledger is append-only
  // everywhere else in the app, so grouping same-label rows here is display-only, never written
  // back. Without it, two real transactions against one month's rent read as double-billing.
  const groupedLedger = groupPortalLedger(ledger);

  // "Covers <label>, <label> and <label>" — every ledger row that isn't fully paid.
  const openLabels = groupedLedger.filter((row) => row.status !== "paid").map((row) => row.label);
  const coversText =
    openLabels.length === 0
      ? "No balance owed right now"
      : openLabels.length === 1
        ? openLabels[0]
        : `${openLabels.slice(0, -1).join(", ")} and ${openLabels[openLabels.length - 1]}`;

  return (
    <div className="rent-statement-page">
      <style>{`
        .rent-statement-page {
          --paper: #FFFFFF;
          --paper-raised: #FFFFFF;
          --ink: #1B2420;
          --ink-muted: #5B665F;
          --rule: rgba(27,36,32,0.14);
          --green: #2F5233;
          --green-tint: #E4EAE1;
          --amber: #9C6B22;
          --amber-tint: #F1E7D4;
          --red: #DC2626;
          --red-tint: #FEE2E2;
          --action: #1E3A8A;
          --action-text: #FFFFFF;
          --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
          --sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

          background: var(--paper);
          color: var(--ink);
          font-family: var(--sans);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding-bottom: 104px;
        }
        .rent-statement-page * { box-sizing: border-box; }

        .rent-statement-page .statement { width: 100%; max-width: 440px; padding: 24px 16px 0; }

        .rent-statement-page .card {
          background: var(--paper-raised);
          border: 1px solid var(--rule);
          
          border-radius: 2px;
          overflow: hidden;
        }

        .rent-statement-page .perforation {
          height: 14px;
          background-image: radial-gradient(circle at 8px 0px, var(--paper) 6px, transparent 6.5px);
          background-size: 16px 14px;
          background-repeat: repeat-x;
          background-position: center top;
        }

        .rent-statement-page .identity { padding: 26px 26px 20px; border-bottom: 1px dashed var(--rule); }
        .rent-statement-page .identity .property { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 14px; }
        .rent-statement-page .identity .name { font-family: var(--serif); font-weight: 500; font-size: 26px; line-height: 1.15; margin: 0 0 6px; }
        .rent-statement-page .identity .unit { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); margin: 0; }

        .rent-statement-page .balance { padding: 24px 26px 22px; border-bottom: 1px dashed var(--rule); }
        .rent-statement-page .balance .label { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 8px; }
        .rent-statement-page .balance .amount-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .rent-statement-page .balance .amount {
          font-family: var(--serif);
          font-weight: 500;
          font-size: 42px;
          font-variant-numeric: tabular-nums;
          line-height: 1;
          margin: 0;
          color: var(--red);
        }
        .rent-statement-page .status-tag {
          font-family: var(--sans);
          font-size: 12px;
          font-weight: 500;
          padding: 3px 9px;
          border-radius: 2px;
          white-space: nowrap;
        }
        .rent-statement-page .balance .amount.is-clear { color: var(--green); }
        .rent-statement-page .status-tag.overdue { background: var(--red-tint); color: var(--red); }
        .rent-statement-page .status-tag.unpaid  { background: var(--amber-tint); color: var(--amber); }
        .rent-statement-page .status-tag.partial { background: var(--amber-tint); color: var(--amber); }
        .rent-statement-page .status-tag.paid    { background: var(--green-tint); color: var(--green); }

        .rent-statement-page .balance .covers { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); margin: 8px 0 0; }
        .rent-statement-page .balance .covers strong { color: var(--ink); font-weight: 500; }

        .rent-statement-page .ledger { padding: 20px 26px 6px; }
        .rent-statement-page .ledger .label { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 12px; }
        .rent-statement-page .ledger table { width: 100%; border-collapse: collapse; }
        .rent-statement-page .ledger tr { border-top: 1px solid var(--rule); }
        .rent-statement-page .ledger tr:first-child { border-top: none; }
        .rent-statement-page .ledger td { padding: 10px 0; font-family: var(--sans); font-size: 14px; vertical-align: top; }
        .rent-statement-page .ledger td.desc { color: var(--ink); }
        .rent-statement-page .ledger td.desc .date { display: block; font-size: 11px; color: var(--ink-muted); margin-top: 2px; }
        .rent-statement-page .ledger td.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .rent-statement-page .ledger td.amt .paid-of {
          display: block; font-size: 11px; color: var(--ink-muted); margin-top: 2px; font-variant-numeric: tabular-nums;
        }
        .rent-statement-page .ledger .row-tag {
          display: inline-block; margin-left: 8px; font-family: var(--sans); font-size: 10px; font-weight: 500;
          padding: 1px 6px; border-radius: 2px; vertical-align: middle;
          background: var(--amber-tint); color: var(--amber);
        }

        .rent-statement-page .back {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: var(--sans); font-size: 13px; color: var(--ink-muted);
          background: none; border: none; padding: 0; cursor: pointer; margin: 0 0 16px;
        }
        .rent-statement-page .back:hover { color: var(--ink); }

        .rent-statement-page .pay-bar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10;
          background: var(--paper-raised);
          border-top: 1px solid var(--rule);
          padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
        }
        .rent-statement-page .pay-bar-inner {
          max-width: 440px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .rent-statement-page .pay-bar-amount { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .rent-statement-page .pay-bar-label { font-family: var(--sans); font-size: 11px; color: var(--ink-muted); }
        .rent-statement-page .pay-bar-value {
          font-family: var(--serif); font-weight: 500; font-size: 20px; font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .rent-statement-page .pay-bar-value.is-clear { color: var(--green); }
        .rent-statement-page .pay-btn {
          flex-shrink: 0;
          padding: 14px 26px;
          background: var(--action);
          color: var(--action-text);
          border: none;
          border-radius: 2px;
          font-family: var(--sans);
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          text-align: center;
        }
        .rent-statement-page .pay-btn:hover { opacity: 0.92; }
        .rent-statement-page .pay-btn:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }

        .rent-statement-page .office {
          margin-top: 22px;
          padding: 16px 18px;
          background: var(--paper-raised);
          border: 1px solid var(--rule);
          border-radius: 2px;
        }
        .rent-statement-page .office .heading { font-family: var(--sans); font-weight: 600; font-size: 13px; margin: 0 0 6px; }
        .rent-statement-page .office .body { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); line-height: 1.5; margin: 0; }

        .rent-statement-page .footer-note {
          margin-top: 20px;
          padding: 0 4px;
          font-family: var(--sans);
          font-size: 12px;
          color: var(--ink-muted);
          line-height: 1.5;
        }

        @media (max-width: 380px) {
          .rent-statement-page .identity,
          .rent-statement-page .balance,
          .rent-statement-page .ledger { padding-left: 20px; padding-right: 20px; }
          .rent-statement-page .balance .amount { font-size: 36px; }
        }
      `}</style>

      <PortalHeader propertyName={propertyName} avatarUrl={avatarUrl} />

      <div className="statement">
        <div className="card">
          <div className="perforation" />

          <div className="identity">
            {propertyName && <p className="property">{propertyName}</p>}
            <p className="name">{tenant.name}</p>
            <p className="unit">
              {tenant.room}
              {tenant.roomType ? `, ${tenant.roomType}` : ""}
            </p>
          </div>

          <div className="balance">
            <p className="label">Amount due</p>
            <div className="amount-row">
              <p className={`amount${isClear ? " is-clear" : ""}`}>{formatMoney(amountDue)}</p>
              <span className={`status-tag ${tenant.status}`}>{statusTagLabel[tenant.status]}</span>
            </div>
            <p className="covers">
              {openLabels.length === 0 ? (
                coversText
              ) : (
                <>
                  Covers <strong>{coversText}</strong>
                </>
              )}
            </p>
          </div>

          <div className="ledger">
            <p className="label">Statement</p>
            <table>
              <tbody>
                {groupedLedger.map((row, i) => {
                  const isPartialRow = row.paidAmount !== undefined && row.paidAmount < row.amount;
                  return (
                    <tr key={i}>
                      <td className="desc">
                        {row.label}
                        {isPartialRow && <span className="row-tag">Partial</span>}
                        <span className="date">{formatShortDate(row.createdAt)}</span>
                      </td>
                      <td className="amt">
                        {formatMoney(row.amount)}
                        {row.paidAmount !== undefined && (
                          <span className="paid-of">
                            {formatMoney(row.paidAmount)} paid
                            {isPartialRow && ` · K${(row.amount - row.paidAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })} left`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="office">
          {office.heading && <p className="heading">{office.heading}</p>}
          <p className="body">{office.body}</p>
        </div>

        <p className="footer-note">
          If this message wasn't meant for you, you can ignore it. No payment happens until you tap Pay.
        </p>

        <PortalFooter />
      </div>

      <div className="pay-bar">
        <div className="pay-bar-inner">
          <div className="pay-bar-amount">
            <span className="pay-bar-label">{amountDue > 0 ? "Total due" : "Get ahead"}</span>
            <span className={`pay-bar-value${amountDue > 0 ? "" : " is-clear"}`}>
              {amountDue > 0 ? formatMoney(amountDue) : "Pay a future month"}
            </span>
          </div>
          <button type="button" className="pay-btn" onClick={onPay}>
            {amountDue > 0 ? "Pay now" : "Pay ahead"}
          </button>
        </div>
      </div>
    </div>
  );
}
