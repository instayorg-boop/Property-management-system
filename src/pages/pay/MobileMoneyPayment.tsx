import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { groupPortalLedger, type PortalTenant, type PortalLedgerRow } from "../../lib/payPortal";
import PortalHeader from "./PortalHeader";
import PortalFooter from "./PortalFooter";

const STEP = 50;
const MIN = 50;

function formatMoney(amount: number): string {
  return `K${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatPlain(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const OPERATORS = ["mtn", "airtel", "zamtel"] as const;
type Operator = (typeof OPERATORS)[number];
const OPERATOR_LABEL: Record<Operator, string> = { mtn: "MTN", airtel: "Airtel", zamtel: "Zamtel" };
// Same logos already used by the old inline pay step (TenantBalance.tsx's PROVIDER_ICON) — real
// brand marks read as more legitimate on a page asking someone to approve a charge.
const OPERATOR_LOGO: Record<Operator, string> = {
  mtn: "https://cdn.brandfetch.io/idtdXB-ogi/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B",
  airtel: "https://cdn.brandfetch.io/idvMDbAci6/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B",
  zamtel: "https://cdn.brandfetch.io/id8xS_vcc_/w/150/h/150/theme/dark/logo.png?c=1dxbfHSJFAPEGdCLU4o5B",
};

/** Zambian mobile network prefixes — same detection the old inline pay step used. */
function detectOperator(phone: string): Operator {
  const digits = phone.replace(/\D/g, "").replace(/^260/, "").replace(/^0/, "");
  const prefix = digits.slice(0, 2);
  if (["97", "77"].includes(prefix)) return "airtel";
  if (["95", "75"].includes(prefix)) return "zamtel";
  return "mtn";
}

export type MobileMoneyPaymentProps = {
  tenant: PortalTenant;
  ledger: PortalLedgerRow[];
  /** Not on PortalTenant yet — passed in separately, same as RentStatement's propertyName. */
  propertyName?: string;
  /** Property/landlord photo — see PortalHeader's comment; omitted until upload exists. */
  avatarUrl?: string | null;
  onBack: () => void;
  onPay: (input: { amount: number; fee: number; total: number; phone: string; operator: Operator }) => void;
  /** Surfaced above the pay bar — e.g. a failed charge or invalid phone number from the caller. */
  error?: string | null;
  /** True from the moment Pay is tapped until the charge resolves — keeps the tenant on this same
   * page with a matching-design loading state instead of bouncing to a separately-styled screen. */
  submitting?: boolean;
  /** True once the charge has been pending long enough that it's worth telling the tenant it's
   * taking a while, without abandoning the wait. */
  stillWaiting?: boolean;
};

export default function MobileMoneyPayment({
  tenant,
  ledger,
  propertyName,
  avatarUrl,
  onBack,
  onPay,
  error,
  submitting = false,
  stillWaiting = false,
}: MobileMoneyPaymentProps) {
  // Balance owed: the tenant's actual arrears, or (when there's nothing owed) the rent they'd be
  // prepaying — same fallback the rest of the portal uses for "amount due".
  const balanceOwed = tenant.owedAmount > 0 ? tenant.owedAmount : tenant.rentAmount;
  // Same same-label grouping as RentStatement — a partial payment followed by a top-up payment
  // against the same month are two real ledger rows, but should read as one "What's owed" line.
  const openRows = groupPortalLedger(ledger).filter((row) => row.status !== "paid");

  const [amount, setAmount] = useState(balanceOwed);
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [operator, setOperator] = useState<Operator>(tenant.phone ? detectOperator(tenant.phone) : "mtn");

  // Re-anchor the stepper to the full balance whenever it changes (e.g. the ledger finishes
  // loading after this page has already mounted) — never leaves a stale amount from a prior value.
  useEffect(() => {
    setAmount(balanceOwed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceOwed]);

  const fee = Math.round(amount * 0.013 * 100) / 100;
  const total = amount + fee;
  const isPartial = amount < balanceOwed;

  const purpose =
    openRows.length === 0
      ? "Rent in advance"
      : openRows.length === 1
        ? openRows[0].label
        : `${openRows
            .slice(0, -1)
            .map((r) => r.label)
            .join(", ")} and ${openRows[openRows.length - 1].label}`;

  const stepDown = () => setAmount((a) => Math.max(MIN, a - STEP));
  const stepUp = () => setAmount((a) => Math.min(balanceOwed, a + STEP));

  return (
    <div className="mm-payment-page">
      <style>{`
        .mm-payment-page {
          --paper: #FFFFFF;
          --paper-raised: #FFFFFF;
          --ink: #1B2420;
          --ink-muted: #5B665F;
          --rule: rgba(27,36,32,0.14);
          --amber: #9C6B22;
          --red: #DC2626;
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
          padding-bottom: 110px;
        }
        .mm-payment-page * { box-sizing: border-box; }

        .mm-payment-page .page { width: 100%; max-width: 440px; padding: 24px 16px 0; }

        .mm-payment-page .back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: var(--sans);
          font-size: 13px;
          color: var(--ink-muted);
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          margin: 0 0 16px;
        }
        .mm-payment-page .back:hover { color: var(--ink); }

        .mm-payment-page .heading-block { padding: 0 4px 20px; }
        .mm-payment-page .heading-block .label { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 6px; }
        .mm-payment-page .heading-block .recipient { font-family: var(--sans); font-weight: 600; font-size: 14px; margin: 0 0 14px; }
        .mm-payment-page .heading-block .total {
          font-family: var(--serif); font-weight: 500; font-size: 40px; font-variant-numeric: tabular-nums; margin: 0 0 6px; line-height: 1;
        }
        .mm-payment-page .heading-block .purpose { font-family: var(--sans); font-size: 13px; color: var(--ink-muted); margin: 0; }

        .mm-payment-page .card { background: var(--paper-raised); border: 1px solid var(--rule); border-radius: 2px; margin-bottom: 20px; }

        .mm-payment-page .owed { padding: 20px 22px 4px; }
        .mm-payment-page .owed .title { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 14px; }
        .mm-payment-page .owed table { width: 100%; border-collapse: collapse; }
        .mm-payment-page .owed td { padding: 7px 0; font-family: var(--sans); font-size: 14px; color: var(--ink-muted); }
        .mm-payment-page .owed td.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .mm-payment-page .owed tr.owed-total td { border-top: 1px solid var(--rule); padding-top: 10px; color: var(--red); font-weight: 500; }
        .mm-payment-page .owed tr.owed-total td:first-child { color: var(--ink); }

        .mm-payment-page .amount-section { padding: 18px 22px; border-top: 1px dashed var(--rule); }
        .mm-payment-page .amount-section .title { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 12px; }
        .mm-payment-page .stepper { display: flex; align-items: center; justify-content: center; gap: 18px; }
        .mm-payment-page .step-btn {
          width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--rule);
          background: var(--paper); color: var(--ink); font-family: var(--sans); font-size: 20px;
          line-height: 1; cursor: pointer; flex-shrink: 0;
        }
        .mm-payment-page .step-btn:disabled { color: var(--ink-muted); cursor: not-allowed; opacity: 0.5; }
        .mm-payment-page .step-btn:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }
        .mm-payment-page .step-value {
          font-family: var(--serif); font-weight: 500; font-size: 26px; font-variant-numeric: tabular-nums;
          min-width: 150px; text-align: center;
        }
        .mm-payment-page .step-value .currency { color: var(--ink-muted); font-size: 18px; margin-right: 2px; }
        .mm-payment-page .amount-note { text-align: center; font-family: var(--sans); font-size: 12px; margin: 12px 0 0; }
        .mm-payment-page .amount-note.full { color: var(--ink-muted); }
        .mm-payment-page .amount-note.partial { color: var(--amber); }

        .mm-payment-page .fee-block { padding: 4px 22px 20px; border-top: 1px dashed var(--rule); }
        .mm-payment-page .fee-block table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        .mm-payment-page .fee-block td { padding: 7px 0; font-family: var(--sans); font-size: 14px; }
        .mm-payment-page .fee-block td.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .mm-payment-page .fee-block tr.fee td { color: var(--ink-muted); font-size: 13px; }
        .mm-payment-page .fee-block tr.total { border-top: 1px solid var(--rule); }
        .mm-payment-page .fee-block tr.total td { padding-top: 12px; font-weight: 600; }
        .mm-payment-page .fee-block .fee-note {
          font-family: var(--sans); font-size: 12px; color: var(--ink-muted); line-height: 1.5;
          margin: 14px 0 0; padding-top: 14px; border-top: 1px dashed var(--rule);
        }

        .mm-payment-page .method { padding: 20px 22px 22px; border-top: 1px dashed var(--rule); }
        .mm-payment-page .method .title { font-family: var(--sans); font-weight: 600; font-size: 14px; margin: 0 0 14px; }

        .mm-payment-page .operators { display: flex; gap: 8px; margin: 0 0 18px; }
        .mm-payment-page .operator {
          flex: 1; padding: 12px 8px; text-align: center; border: 1px solid var(--rule);
          border-radius: 2px; background: var(--paper); cursor: pointer;
        }
        .mm-payment-page .operator .logo {
          display: block; width: 22px; height: 22px; border-radius: 50%; margin: 0 auto 8px; object-fit: cover;
        }
        .mm-payment-page .operator .name { font-family: var(--sans); font-size: 12px; font-weight: 500; color: var(--ink-muted); }
        .mm-payment-page .operator.is-selected { border-color: var(--action); background: #EFF3FB; }
        .mm-payment-page .operator.is-selected .name { color: var(--ink); }

        .mm-payment-page .field { margin: 0 0 4px; }
        .mm-payment-page .field label { display: block; font-family: var(--sans); font-size: 12px; color: var(--ink-muted); margin: 0 0 8px; }
        .mm-payment-page .field input {
          width: 100%; padding: 13px 14px; font-family: var(--sans); font-size: 15px; font-variant-numeric: tabular-nums;
          color: var(--ink); background: var(--paper); border: 1px solid var(--rule); border-radius: 2px;
        }
        .mm-payment-page .field input:focus-visible { outline: 2px solid var(--action); outline-offset: 1px; }

        .mm-payment-page .method .helper { font-family: var(--sans); font-size: 12px; color: var(--ink-muted); line-height: 1.5; margin: 10px 0 0; }
        .mm-payment-page .method .error { font-family: var(--sans); font-size: 12px; color: var(--red); line-height: 1.5; margin: 10px 0 0; }
        .mm-payment-page .method .retry {
          display: inline; background: none; border: none; padding: 0; margin: 0;
          font: inherit; color: var(--action); text-decoration: underline; cursor: pointer;
        }

        .mm-payment-page .pay-bar {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
          background: var(--paper-raised); border-top: 1px solid var(--rule);
          padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
        }
        .mm-payment-page .pay-bar-inner {
          max-width: 440px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .mm-payment-page .pay-bar-amount { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .mm-payment-page .pay-bar-label { font-family: var(--sans); font-size: 11px; color: var(--ink-muted); }
        .mm-payment-page .pay-bar-value { font-family: var(--serif); font-weight: 500; font-size: 20px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .mm-payment-page .pay-btn {
          flex-shrink: 0; padding: 14px 26px; background: var(--action); color: var(--action-text);
          border: none; border-radius: 2px; font-family: var(--sans); font-weight: 600; font-size: 15px; cursor: pointer;
        }
        .mm-payment-page .pay-btn:hover { opacity: 0.92; }
        .mm-payment-page .pay-btn:focus-visible { outline: 2px solid var(--action); outline-offset: 2px; }
        .mm-payment-page .pay-btn:disabled { opacity: 0.75; cursor: not-allowed; }
        .mm-payment-page .pay-btn-inner { display: inline-flex; align-items: center; gap: 8px; }

        .mm-payment-page .spinner {
          width: 15px; height: 15px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;
          animation: mm-spin 0.7s linear infinite; flex-shrink: 0;
        }
        @keyframes mm-spin { to { transform: rotate(360deg); } }

        .mm-payment-page .status-note {
          text-align: center; font-family: var(--sans); font-size: 12px; color: var(--ink-muted);
          line-height: 1.5; margin: 12px 4px 0;
        }

        @media (max-width: 380px) {
          .mm-payment-page .heading-block, .mm-payment-page .owed, .mm-payment-page .amount-section,
          .mm-payment-page .fee-block, .mm-payment-page .method { padding-left: 18px; padding-right: 18px; }
          .mm-payment-page .heading-block .total { font-size: 34px; }
          .mm-payment-page .step-value { min-width: 120px; font-size: 22px; }
        }
      `}</style>

      <PortalHeader propertyName={propertyName} avatarUrl={avatarUrl} />

      <div className="page">
        <button type="button" className="back" onClick={onBack}>
          <ArrowLeft size={14} weight="bold" />
          Back to statement
        </button>

        <div className="heading-block">
          <p className="label">Paying</p>
          {propertyName && <p className="recipient">{propertyName}</p>}
          <p className="total">{formatMoney(total)}</p>
          <p className="purpose">{purpose}</p>
        </div>

        <div className="card">
          <div className="owed">
            <p className="title">What's owed</p>
            <table>
              <tbody>
                {openRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.label}</td>
                    <td className="amt">{formatMoney(row.amount)}</td>
                  </tr>
                ))}
                <tr className="owed-total">
                  <td>Balance owed</td>
                  <td className="amt">{formatMoney(balanceOwed)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="amount-section">
            <p className="title">Amount to pay</p>
            <div className="stepper">
              <button
                type="button"
                className="step-btn"
                aria-label="Decrease amount"
                onClick={stepDown}
                disabled={submitting || amount <= MIN}
              >
                −
              </button>
              <div className="step-value">
                <span className="currency">K</span>
                {formatPlain(amount)}
              </div>
              <button
                type="button"
                className="step-btn"
                aria-label="Increase amount"
                onClick={stepUp}
                disabled={submitting || amount >= balanceOwed}
              >
                +
              </button>
            </div>
            <p className={`amount-note ${isPartial ? "partial" : "full"}`}>
              {isPartial ? `Partial payment, K${formatPlain(balanceOwed - amount)} left after this` : "Full balance"}
            </p>
          </div>

          <div className="fee-block">
            <table>
              <tbody>
                <tr className="fee">
                  <td>Sending fee · 1.3% of amount</td>
                  <td className="amt">{formatMoney(fee)}</td>
                </tr>
                <tr className="total">
                  <td>Total to pay</td>
                  <td className="amt">{formatMoney(total)}</td>
                </tr>
              </tbody>
            </table>
            <p className="fee-note">
              The sending fee is the mobile-money processing charge. It's shown on its own line, never folded into the total.
            </p>
          </div>

          <div className="method">
            <p className="title">Pay with mobile money</p>

            <div className="operators" role="group" aria-label="Mobile money provider">
              {OPERATORS.map((op) => (
                <button
                  key={op}
                  type="button"
                  className={`operator${operator === op ? " is-selected" : ""}`}
                  aria-pressed={operator === op}
                  onClick={() => setOperator(op)}
                  disabled={submitting}
                >
                  <img src={OPERATOR_LOGO[op]} alt="" className="logo" />
                  <span className="name">{OPERATOR_LABEL[op]}</span>
                </button>
              ))}
            </div>

            <div className="field">
              <label htmlFor="mm-phone">Number to receive the prompt</label>
              <input
                id="mm-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={submitting}
              />
            </div>
            {stillWaiting ? (
              <p className="status-note">
                This is taking longer than usual. Approve the prompt on your phone whenever you're ready — this page
                will move on automatically once it goes through, or{" "}
                <button type="button" className="retry" onClick={onBack}>
                  go back to your statement
                </button>
                .
              </p>
            ) : submitting ? (
              <p className="status-note">Check your phone to approve on {OPERATOR_LABEL[operator]}… don't close this page.</p>
            ) : (
              <p className="helper">You'll get a prompt on this number to approve the payment.</p>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>

        <PortalFooter />
      </div>

      <div className="pay-bar">
        <div className="pay-bar-inner">
          <div className="pay-bar-amount">
            <span className="pay-bar-label">{isPartial ? "Partial payment" : "Total to pay"}</span>
            <span className="pay-bar-value">{formatMoney(total)}</span>
          </div>
          <button
            type="button"
            className="pay-btn"
            disabled={submitting}
            onClick={() => onPay({ amount, fee, total, phone, operator })}
          >
            {submitting ? (
              <span className="pay-btn-inner">
                <span className="spinner" aria-hidden="true" />
                Processing…
              </span>
            ) : (
              `Pay ${formatMoney(total)}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
