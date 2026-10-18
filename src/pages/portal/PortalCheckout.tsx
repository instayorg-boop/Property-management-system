import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  groupPortalLedger,
  isOpenPortalRow,
  portalOwedPeriodLabel,
  portalPaymentSummary,
  previewPortalPayment,
  type PortalPaymentLine,
} from "../../lib/payPortal";
import { onlineFeeRateForRent } from "../../lib/pricing";
import { MOBILE_MONEY_LOGO } from "../../lib/mobileMoneyProviders";
import { usePortal } from "./portalData";
import { isPortalDevMode } from "./portalDev";
import { Card, MoneyRow, PortalButton, PortalMessage, PortalTopBar, Shimmer, formatMoney } from "./portalUi";

const OPERATORS = ["mtn", "airtel", "zamtel"] as const;
type Operator = (typeof OPERATORS)[number];
const OPERATOR_LABEL: Record<Operator, string> = { mtn: "MTN MoMo", airtel: "Airtel Money", zamtel: "Zamtel Kwacha" };
const OPERATOR_SHORT: Record<Operator, string> = { mtn: "MTN", airtel: "Airtel", zamtel: "Zamtel" };

/**
 * Which network a Zambian mobile number belongs to, read off its prefix.
 *
 * ZICTA's allocations, national format (the leading 0 dropped below):
 *   MTN     96, 76, 56
 *   Airtel  97, 77, 57
 *   Zamtel  95, 75, 55
 * The 5x ranges are the newer blocks issued as the original 9x/7x ones filled up.
 *
 * Returns null rather than guessing for anything outside that table — a landline, a foreign
 * number, or a half-typed one. Defaulting an unknown prefix to MTN (what the previous version did)
 * meant a mistyped number was sent to the wrong network and came back as a generic decline the
 * tenant had no way to interpret.
 */
function detectOperator(phone: string): Operator | null {
  const digits = phone.replace(/\D/g, "").replace(/^260/, "").replace(/^0/, "");
  if (digits.length < 9) return null; // too short to be a complete Zambian mobile number
  const prefix = digits.slice(0, 2);
  if (["96", "76", "56"].includes(prefix)) return "mtn";
  if (["97", "77", "57"].includes(prefix)) return "airtel";
  if (["95", "75", "55"].includes(prefix)) return "zamtel";
  return null;
}

export default function PortalCheckout() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { tenant, ledger, identity, loading, notFound, nextDueDate } = usePortal(token);

  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState(false);
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const [operatorChoice, setOperatorChoice] = useState<Operator | null>(null);
  const [overriding, setOverriding] = useState(false);
  // Guards against a double tap firing two navigations before the first one lands: the actual
  // payment (initiateCollection + the poll loop) now lives entirely on PortalProcessing, this
  // page only validates the form and hands off to it.
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived, not synced: the number on file is the value until the tenant types their own, and
  // the network is read off whatever number is currently in the field. Prefilling from an effect
  // instead meant a render pass that overwrote what someone had already started typing the moment
  // the fetch resolved.
  const phone = phoneInput ?? tenant?.phone ?? "";
  const detected = detectOperator(phone);
  const operator = operatorChoice ?? detected;

  // What this payment will actually pay for, straight from the server's own allocation (the same
  // one the payment runs when it is confirmed). Refetched as the amount changes, debounced so typing
  // a figure doesn't fire a request per keystroke. Until it arrives (or if it fails) the screen
  // falls back to working it out from the ledger rows below.
  const [preview, setPreview] = useState<PortalPaymentLine[] | null>(null);
  const previewOwed = tenant ? (tenant.owedAmount > 0 ? tenant.owedAmount : tenant.rentAmount) : 0;
  const previewAmount = amountInput === null ? previewOwed : Math.max(0, Number(amountInput) || 0);
  const previewPenalty = tenant && tenant.owedAmount > 0 ? tenant.penaltyAmount : 0;
  const tenantId = tenant?.id;
  useEffect(() => {
    if (!tenantId || !(previewAmount > 0)) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewPortalPayment(tenantId, previewAmount, previewPenalty)
        .then((lines) => {
          if (!cancelled) setPreview(lines.length > 0 ? lines : null);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tenantId, previewAmount, previewPenalty]);

  // Latched on the first `?dev=1` seen this tab session — see portalDev.ts for why it can't just
  // read the current URL.
  const devMode = isPortalDevMode();

  if (loading) {
    return (
      <>
        <PortalTopBar title="Confirm payment" fallbackTo={`/p/${token}`} />
        <Shimmer className="h-60 w-full rounded-lg" />
        <Shimmer className="mt-4 h-45 w-full rounded-lg" />
      </>
    );
  }

  if (notFound || !tenant || !identity) {
    return (
      <>
        <PortalTopBar title="Confirm payment" fallbackTo={`/p/${token}`} />
        <PortalMessage title="We couldn't load your balance" body="Open your payment link again and retry." />
      </>
    );
  }

  const balanceOwed = tenant.owedAmount > 0 ? tenant.owedAmount : tenant.rentAmount;
  const amount = amountInput === null ? balanceOwed : Math.max(0, Number(amountInput) || 0);
  const feeRate = onlineFeeRateForRent(tenant.rentAmount);
  const fee = Math.round(amount * feeRate * 100) / 100;
  const total = amount + fee;
  const isPartial = amount < balanceOwed;
  const baseRent = Math.max(amount - tenant.penaltyAmount, 0);

  const openRows = groupPortalLedger(ledger).filter(isOpenPortalRow);
  // Itemised, per period, from the same ledger rows the home screen shows — so the figure being
  // charged can always be traced back to specific months. Anything the ledger rows do not explain
  // is shown as its own line rather than being folded silently into "Rent".
  const rentBalance = Math.max(balanceOwed - tenant.penaltyAmount, 0);
  const periodLines = openRows
    .map((row) => ({ label: row.label, amount: Math.round((row.amount - (row.paidAmount ?? 0)) * 100) / 100 }))
    .filter((line) => line.amount > 0);
  const explained = periodLines.reduce((sum, line) => sum + line.amount, 0);
  const unexplained = Math.round((rentBalance - explained) * 100) / 100;
  const payingFor = preview ? portalPaymentSummary(preview) : portalOwedPeriodLabel(openRows.map((r) => r.label), nextDueDate);

  const amountValid = amount > 0 && amount <= balanceOwed;
  const phoneValid = phone.replace(/\D/g, "").length >= 9;

  // Validates the form, then hands the whole rest of the payment (the actual initiateCollection
  // call, polling, and routing on to success/failed) off to PortalProcessing: this page's job
  // ends at a valid tap of "Pay". The operator is passed through explicitly rather than re-derived
  // on the next page: by then the detected value could differ (a dev-mode run with an empty
  // field), and the next page should charge/name the exact network this page validated against.
  const pay = (devSimulate?: "success" | "failed") => {
    setError(null);
    if (!amountValid) {
      setError(`Enter an amount between K1 and ${formatMoney(balanceOwed)}.`);
      return;
    }
    // A simulated run doesn't touch a real wallet, so it doesn't need a real number: otherwise
    // testing the success screen would mean typing a valid one every time.
    const chargePhone = devSimulate ? phone || "0977000000" : phone;
    const chargeOperator = operator ?? detectOperator(chargePhone) ?? "mtn";
    if (!devSimulate && !phoneValid) {
      setError("Enter the mobile money number to charge.");
      return;
    }
    if (!devSimulate && !operator) {
      setError("We don't recognise that network. Check the number, or pick your network above.");
      return;
    }
    setSubmitting(true);
    navigate(`/p/${token}/processing`, {
      state: {
        propertySlug: identity.propertySlug,
        tenantId: tenant.id,
        phone: chargePhone,
        operator: chargeOperator,
        amount,
        devSimulate,
      },
    });
  };

  return (
    <>
      <PortalTopBar title="Confirm payment" fallbackTo={`/p/${token}`} />

      <div className="mb-5 text-center">
        <p className="text-[13px]" style={{ color: "var(--p-muted)" }}>
          Paying for
        </p>
        <p className="display mt-0.5 text-[20px] font-semibold">{payingFor}</p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--p-muted)" }}>
          {[tenant.room, identity.propertyName].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* Every kwacha of the charge, itemised, before the tenant commits — the transaction fee in
          particular is the line people are most likely to feel ambushed by if it only shows up on
          the receipt. */}
      <Card className="px-4 py-2">
        <p className="px-0 pb-1 pt-3 text-[13px] font-semibold" style={{ color: "var(--p-muted)" }}>
          Cost breakdown
        </p>
        {preview ? (
          <>
            {preview.map((line, i) => (
              <MoneyRow
                key={`${line.id ?? line.kind}-${i}`}
                label={
                  line.kind === "penalty"
                    ? tenant.daysOverdue
                      ? `Late fee (${tenant.daysOverdue} days overdue)`
                      : "Late fee"
                    : line.label
                }
                amount={line.amount}
              />
            ))}
            {isPartial && tenant.owedAmount > 0 && (
              <MoneyRow label="Balance left after this payment" amount={Math.max(balanceOwed - amount, 0)} />
            )}
          </>
        ) : isPartial ? (
          <>
            <MoneyRow label="Rent (part payment)" amount={baseRent} />
            <MoneyRow label="Balance left after this payment" amount={Math.max(balanceOwed - amount, 0)} />
          </>
        ) : (
          <>
            {periodLines.map((line) => (
              <MoneyRow key={line.label} label={line.label} amount={line.amount} />
            ))}
            {Math.abs(unexplained) >= 1 && (
              <MoneyRow
                label={periodLines.length === 0 ? portalOwedPeriodLabel([], nextDueDate) : "Other balance on your account"}
                amount={unexplained}
              />
            )}
          </>
        )}
        {!preview && tenant.penaltyAmount > 0 && (
          <MoneyRow
            label={tenant.daysOverdue ? `Late fee (${tenant.daysOverdue} days overdue)` : "Late fee"}
            amount={tenant.penaltyAmount}
          />
        )}
        <MoneyRow label="Transaction fee" amount={fee} />
        <MoneyRow label="Total" amount={total} strong />
      </Card>

      {editingAmount ? (
        <div className="mt-3">
          <label htmlFor="pay-amount" className="mb-1.5 block px-1 text-[13px]" style={{ color: "var(--p-muted)" }}>
            Amount to pay (max {formatMoney(balanceOwed)})
          </label>
          <input
            id="pay-amount"
            className="p-input num"
            type="number"
            inputMode="decimal"
            min={1}
            max={balanceOwed}
            value={amountInput ?? String(balanceOwed)}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={submitting}
          />
        </div>
      ) : (
        balanceOwed > 0 && (
          <button
            type="button"
            className="mx-auto mt-3 block text-[13px] font-semibold"
            style={{ color: "var(--p-accent)" }}
            onClick={() => {
              setEditingAmount(true);
              setAmountInput(String(balanceOwed));
            }}
          >
            Pay a different amount
          </button>
        )
      )}

      {/* One field. The network is read off the number the tenant types — there is nothing to
          choose, because the prefix already says which wallet the number belongs to. */}
      <div className="mt-6">
        <label htmlFor="pay-phone" className="mb-1.5 block px-1 text-[13px]" style={{ color: "var(--p-muted)" }}>
          Mobile money number
        </label>
        <div className="relative">
          <input
            id="pay-phone"
            className="p-input num"
            style={{ paddingRight: detected ? 118 : undefined }}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="097 000 0000"
            value={phone}
            onChange={(e) => setPhoneInput(e.target.value)}
            disabled={submitting}
            aria-describedby="pay-network"
          />
          {/* The detected network sits inside the field, next to the digits that determined it, so
              the tenant can confirm it at the moment they finish typing. */}
          {detected && (
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center gap-1.5">
              <img src={MOBILE_MONEY_LOGO[detected]} alt="" className="h-5 w-5 rounded object-cover" />
              <span className="text-[12px] font-semibold" style={{ color: "var(--p-ink-soft)" }}>
                {OPERATOR_SHORT[detected]}
              </span>
            </span>
          )}
        </div>

        <p id="pay-network" className="mt-1.5 px-1 text-[12px]" style={{ color: "var(--p-muted)" }}>
          {phone.trim() === ""
            ? "We'll work out your network from the number."
            : detected
              ? `Charging your ${OPERATOR_LABEL[detected]} wallet.`
              : "We don't recognise that number as a Zambian mobile money number."}
        </p>

        {/* Zambia allows number portability, so a prefix identifies the network that issued a SIM,
            not always the one holding it today. This stays hidden until it's needed: a ported
            tenant can correct us, everyone else never sees a picker. */}
        {overriding || (phone.trim() !== "" && !detected) ? (
          <div className="mt-2.5 flex gap-2">
            {OPERATORS.map((op) => (
              <button
                key={op}
                type="button"
                disabled={submitting}
                onClick={() => setOperatorChoice(op)}
                className="p-card flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] font-medium"
                style={{
                  borderColor: operatorChoice === op ? "var(--p-accent)" : "var(--p-line)",
                  color: operatorChoice === op ? "var(--p-accent)" : "var(--p-ink)",
                }}
              >
                <img src={MOBILE_MONEY_LOGO[op]} alt="" className="h-4 w-4 rounded object-cover" />
                {OPERATOR_SHORT[op]}
              </button>
            ))}
          </div>
        ) : (
          detected && (
            <button
              type="button"
              className="mt-1 px-1 text-[12px] font-semibold"
              style={{ color: "var(--p-accent)" }}
              onClick={() => setOverriding(true)}
            >
              Not {OPERATOR_SHORT[detected]}?
            </button>
          )
        )}
      </div>

      {error && (
        <p className="mt-3 px-1 text-[13px]" style={{ color: "var(--p-red)" }}>
          {error}
        </p>
      )}

      <div className="mt-5">
        <PortalButton onClick={() => pay()} disabled={submitting || !amountValid || !phoneValid}>
          {submitting ? "Starting…" : `Pay ${formatMoney(total)}`}
        </PortalButton>
      </div>

      {/* Dev-only, opened with ?dev=1 — lets the success and failure screens be walked without a
          real charge. The edge function still refuses to simulate unless DEV_MODE_PAYMENTS is set
          server-side, so this button is inert in production even if someone adds the query param. */}
      {devMode && (
        <div className="mt-4 space-y-2">
          <p className="text-center text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--p-muted)" }}>
            Dev mode
          </p>
          <div className="flex gap-2">
            <PortalButton variant="outline" onClick={() => pay("success")} disabled={submitting}>
              Simulate success
            </PortalButton>
            <PortalButton variant="outline" onClick={() => pay("failed")} disabled={submitting}>
              Simulate failure
            </PortalButton>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[12px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
        You'll get a prompt on your phone to approve this payment.
      </p>
      {isPartial && amountValid && !submitting && (
        <p className="mt-2 text-center text-[12px]" style={{ color: "var(--p-amber)" }}>
          {formatMoney(balanceOwed - amount)} will still be owed after this payment.
        </p>
      )}
    </>
  );
}
