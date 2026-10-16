import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  initiateCollection,
  getCollectionStatus,
  generatePortalReceipt,
  groupPortalLedger,
  portalOwedPeriodLabel,
} from "../../lib/payPortal";
import { onlineFeeRateForRent } from "../../lib/pricing";
import { MOBILE_MONEY_LOGO } from "../../lib/mobileMoneyProviders";
import { usePortal, invalidatePortal } from "./portalData";
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

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // ~60s before we stop waiting and tell the tenant to check back

export default function PortalCheckout() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { tenant, ledger, identity, loading, notFound, nextDueDate } = usePortal(token);

  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState(false);
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const [operatorChoice, setOperatorChoice] = useState<Operator | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  // Derived, not synced: the number on file is the value until the tenant types their own, and
  // the network is read off whatever number is currently in the field. Prefilling from an effect
  // instead meant a render pass that overwrote what someone had already started typing the moment
  // the fetch resolved.
  const phone = phoneInput ?? tenant?.phone ?? "";
  const detected = detectOperator(phone);
  const operator = operatorChoice ?? detected;

  // Latched on the first `?dev=1` seen this tab session — see portalDev.ts for why it can't just
  // read the current URL.
  const devMode = isPortalDevMode();

  useEffect(() => () => {
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
  }, []);

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

  const openRows = groupPortalLedger(ledger).filter((row) => row.status !== "paid");
  // Itemised, per period, from the same ledger rows the home screen shows — so the figure being
  // charged can always be traced back to specific months. Anything the ledger rows do not explain
  // is shown as its own line rather than being folded silently into "Rent".
  const rentBalance = Math.max(balanceOwed - tenant.penaltyAmount, 0);
  const periodLines = openRows
    .map((row) => ({ label: row.label, amount: Math.round((row.amount - (row.paidAmount ?? 0)) * 100) / 100 }))
    .filter((line) => line.amount > 0);
  const explained = periodLines.reduce((sum, line) => sum + line.amount, 0);
  const unexplained = Math.round((rentBalance - explained) * 100) / 100;
  const payingFor = portalOwedPeriodLabel(openRows.map((r) => r.label), nextDueDate);

  const amountValid = amount > 0 && amount <= balanceOwed;
  const phoneValid = phone.replace(/\D/g, "").length >= 9;

  // The operator is passed through rather than read from state at navigation time: by then the
  // detected value could be null (a dev-mode run with an empty field), and the success page should
  // name the network that was actually charged.
  const finish = (
    collectionId: string,
    charged: { amount: number; feeAmount: number; rentPortion: number; isPartial: boolean },
    chargedWith: Operator
  ) => {
    // Fire-and-forget — the receipt is a convenience filed under Documents, not something the
    // tenant should be held on a spinner for.
    void generatePortalReceipt(tenant.id, collectionId).catch((err) => console.error("Failed to generate receipt", err));
    // The balance the tenant just changed is cached; drop it so the success page and the home
    // screen behind it both read the post-payment figure.
    invalidatePortal(token!, tenant.id);
    navigate(`/p/${token}/success`, {
      state: { ...charged, provider: chargedWith, phone, reference: collectionId },
      replace: true,
    });
  };

  const poll = (collectionId: string, attempt: number, charged: Parameters<typeof finish>[1], chargedWith: Operator) => {
    getCollectionStatus(tenant.id, collectionId)
      .then(({ status, failureReason }) => {
        if (status === "successful") return finish(collectionId, charged, chargedWith);
        if (status === "failed") {
          setSubmitting(false);
          navigate(`/p/${token}/failed`, {
            state: { reason: failureReason ?? "The mobile money provider declined this payment. No amount was charged." },
          });
          return;
        }
        if (attempt >= MAX_POLLS) {
          setStillWaiting(true);
          return;
        }
        pollTimer.current = window.setTimeout(() => poll(collectionId, attempt + 1, charged, chargedWith), POLL_INTERVAL_MS);
      })
      .catch(() => {
        // A transient network error mid-poll shouldn't abandon a payment that may still succeed.
        if (attempt >= MAX_POLLS) {
          setStillWaiting(true);
          return;
        }
        pollTimer.current = window.setTimeout(() => poll(collectionId, attempt + 1, charged, chargedWith), POLL_INTERVAL_MS);
      });
  };

  const pay = (devSimulate?: "success" | "failed") => {
    setError(null);
    if (!amountValid) {
      setError(`Enter an amount between K1 and ${formatMoney(balanceOwed)}.`);
      return;
    }
    // A simulated run doesn't touch a real wallet, so it doesn't need a real number — otherwise
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
    setStillWaiting(false);
    initiateCollection(identity.propertySlug, tenant.id, chargePhone, chargeOperator, amount, devSimulate)
      .then(({ collectionId, status, amount: charged, feeAmount, rentPortion, isPartial: partial }) => {
        const result = { amount: charged, feeAmount, rentPortion, isPartial: partial };
        if (status === "successful") return finish(collectionId, result, chargeOperator);
        if (status === "failed") {
          setSubmitting(false);
          navigate(`/p/${token}/failed`, {
            state: { reason: "The mobile money provider declined this payment. No amount was charged." },
          });
          return;
        }
        poll(collectionId, 0, result, chargeOperator);
      })
      .catch((err) => {
        setSubmitting(false);
        navigate(`/p/${token}/failed`, {
          state: {
            reason:
              err instanceof Error && err.message && err.message !== "Failed to start the payment."
                ? err.message
                : "We could not confirm whether this payment started. Do not pay again yet. If you approved a prompt on your phone, it will show in your payment history within a few minutes.",
          },
        });
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
        {isPartial ? (
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
        {tenant.penaltyAmount > 0 && (
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
          {submitting ? "Waiting for approval…" : `Pay ${formatMoney(total)}`}
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
        {stillWaiting
          ? "Still waiting on your network. If you approved it, the payment will show in your history shortly — you can safely close this page."
          : submitting
            ? "Approve the prompt on your phone to complete the payment."
            : "You'll get a prompt on your phone to approve this payment."}
      </p>
      {isPartial && amountValid && !submitting && (
        <p className="mt-2 text-center text-[12px]" style={{ color: "var(--p-amber)" }}>
          {formatMoney(balanceOwed - amount)} will still be owed after this payment.
        </p>
      )}
    </>
  );
}
