import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { getSubscriptionStatus, collectSubscriptionPaymentPublic, type SubscriptionPayStatus } from "../../lib/subscriptionPay";
import { MOBILE_MONEY_LOGO } from "../../lib/mobileMoneyProviders";
import { Card, MoneyRow, PortalButton, PortalFrame, PortalMessage, PoweredByInstay, Shimmer, formatMoney, formatDate } from "./portalUi";

const OPERATORS = ["mtn", "airtel", "zamtel"] as const;
type Operator = (typeof OPERATORS)[number];
const OPERATOR_LABEL: Record<Operator, string> = { mtn: "MTN MoMo", airtel: "Airtel Money", zamtel: "Zamtel Kwacha" };
const OPERATOR_SHORT: Record<Operator, string> = { mtn: "MTN", airtel: "Airtel", zamtel: "Zamtel" };

// Same prefix table PortalCheckout.tsx and Billing.tsx each keep their own copy of, since this is a
// third payer (the landlord, paying IPM, with no session at all), so it gets its own copy too
// rather than reaching into either of those unrelated flows for one small function.
function detectOperator(phone: string): Operator | null {
  const digits = phone.replace(/\D/g, "").replace(/^260/, "").replace(/^0/, "");
  if (digits.length < 9) return null;
  const prefix = digits.slice(0, 2);
  if (["96", "76", "56"].includes(prefix)) return "mtn";
  if (["97", "77", "57"].includes(prefix)) return "airtel";
  if (["95", "75", "55"].includes(prefix)) return "zamtel";
  return null;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

/**
 * Where the subscription-due reminder SMS sends the landlord, paying IPM's own fee without
 * opening the dashboard or signing in, the exact same shape as a tenant paying rent from their
 * own SMS link (see PortalCheckout.tsx). The token in the URL is the whole trust boundary; there
 * is nothing to log into because there is nothing landlord-specific on this page beyond what the
 * token itself already reveals (one property's name and its one open invoice).
 */
export default function SubscriptionPay() {
  const { token } = useParams();
  const [status, setStatus] = useState<SubscriptionPayStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phoneInput, setPhoneInput] = useState("");
  const [operatorOverride, setOperatorOverride] = useState<Operator | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<"successful" | "failed" | null>(null);
  const [failReason, setFailReason] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const detected = detectOperator(phoneInput);
  const operator = operatorOverride ?? detected;
  const phoneValid = phoneInput.replace(/\D/g, "").length >= 9;

  const load = () => {
    if (!token) return;
    getSubscriptionStatus(token)
      .then(setStatus)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "This link isn't valid anymore."));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => () => {
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
  }, []);

  const poll = (attempt: number) => {
    pollTimer.current = window.setTimeout(async () => {
      if (!token) return;
      try {
        const fresh = await getSubscriptionStatus(token);
        setStatus(fresh);
        if (fresh.paymentStatus === "successful") {
          setResult("successful");
          setSubmitting(false);
          return;
        }
        if (fresh.paymentStatus === "failed") {
          setResult("failed");
          setSubmitting(false);
          return;
        }
      } catch {
        // A transient blip mid-poll shouldn't abandon a payment that may still succeed.
      }
      if (attempt < MAX_POLLS) {
        poll(attempt + 1);
      } else {
        setSubmitting(false);
        setFailReason("Still waiting on confirmation. If you approved the prompt, it will go through shortly, you can safely close this page and check back.");
        setResult("failed");
      }
    }, POLL_INTERVAL_MS);
  };

  const submit = async () => {
    if (!token || !operator || !phoneValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { status: payStatus } = await collectSubscriptionPaymentPublic(token, phoneInput, operator);
      if (payStatus === "successful") {
        setResult("successful");
        setSubmitting(false);
        return;
      }
      if (payStatus === "failed") {
        setResult("failed");
        setSubmitting(false);
        setFailReason("The mobile money provider declined this payment. No amount was charged.");
        return;
      }
      poll(0);
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : "Couldn't start that payment, please try again.");
    }
  };

  if (loadError) {
    return (
      <PortalFrame>
        <PortalMessage title="We couldn't load this link" body={loadError} />
      </PortalFrame>
    );
  }

  if (!status) {
    return (
      <PortalFrame>
        <Shimmer className="mt-10 h-56 w-full rounded-lg" />
      </PortalFrame>
    );
  }

  if (result === "successful" || status.allPaid) {
    return (
      <PortalFrame>
        <div className="flex flex-col items-center pt-10">
          <span
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: "var(--p-green-tint)", color: "var(--p-green)" }}
          >
            <CheckCircle size={36} weight="fill" />
          </span>
          <h1 className="display mt-5 text-[22px] font-semibold">
            {result === "successful" ? "Payment received" : "You're all paid up"}
          </h1>
          <p className="mt-2 max-w-[320px] text-center text-[14px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
            {result === "successful"
              ? `Thanks, ${formatMoney(status.amount)} for ${status.propertyName} has been received.`
              : `Nothing is currently due on ${status.propertyName}'s subscription.`}
          </p>
        </div>
        <div className="flex-1" />
        <PoweredByInstay />
      </PortalFrame>
    );
  }

  if (result === "failed") {
    return (
      <PortalFrame>
        <div className="flex flex-col items-center pt-10">
          <span
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: "var(--p-red-tint)", color: "var(--p-red)" }}
          >
            <XCircle size={36} weight="fill" />
          </span>
          <h1 className="display mt-5 text-[22px] font-semibold">Payment didn't go through</h1>
          <p className="mt-2 max-w-[320px] text-center text-[14px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
            {failReason ?? "No amount was charged."}
          </p>
        </div>
        <div className="mt-5">
          <PortalButton
            onClick={() => {
              setResult(null);
              setFailReason(null);
              load();
            }}
          >
            Try again
          </PortalButton>
        </div>
        <div className="flex-1" />
        <PoweredByInstay />
      </PortalFrame>
    );
  }

  return (
    <PortalFrame>
      <div className="mb-5 text-center">
        <p className="text-[13px]" style={{ color: "var(--p-muted)" }}>
          IPM subscription for
        </p>
        <p className="display mt-0.5 text-[20px] font-semibold">{status.propertyName}</p>
      </div>

      <Card className="px-4 py-2">
        <MoneyRow label={`Due ${formatDate(status.dueDate)}`} amount={status.amount} strong />
      </Card>

      <div className="mt-6">
        <label htmlFor="sub-pay-phone" className="mb-1.5 block px-1 text-[13px]" style={{ color: "var(--p-muted)" }}>
          Mobile money number
        </label>
        <div className="relative">
          <input
            id="sub-pay-phone"
            className="p-input num"
            style={{ paddingRight: detected ? 118 : undefined }}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="097 000 0000"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            disabled={submitting}
          />
          {detected && (
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center gap-1.5">
              <img src={MOBILE_MONEY_LOGO[detected]} alt="" className="h-5 w-5 rounded object-cover" />
              <span className="text-[12px] font-semibold" style={{ color: "var(--p-ink-soft)" }}>
                {OPERATOR_SHORT[detected]}
              </span>
            </span>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[12px]" style={{ color: "var(--p-muted)" }}>
          {phoneInput.trim() === ""
            ? "We'll work out the network from the number."
            : detected
              ? `Charging the ${OPERATOR_LABEL[detected]} wallet.`
              : "We don't recognise that number as a Zambian mobile money number."}
        </p>

        {overriding || (phoneInput.trim() !== "" && !detected) ? (
          <div className="mt-2.5 flex gap-2">
            {OPERATORS.map((op) => (
              <button
                key={op}
                type="button"
                disabled={submitting}
                onClick={() => setOperatorOverride(op)}
                className="p-card flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] font-medium"
                style={{
                  borderColor: operatorOverride === op ? "var(--p-accent)" : "var(--p-line)",
                  color: operatorOverride === op ? "var(--p-accent)" : "var(--p-ink)",
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

      {submitError && (
        <p className="mt-3 px-1 text-[13px]" style={{ color: "var(--p-red)" }}>
          {submitError}
        </p>
      )}

      <div className="mt-5">
        <PortalButton onClick={submit} disabled={submitting || !phoneValid || !operator}>
          {submitting ? "Waiting for approval…" : `Pay ${formatMoney(status.amount)}`}
        </PortalButton>
      </div>

      <p className="mt-3 text-center text-[12px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
        {submitting
          ? "Approve the prompt on your phone to complete the payment."
          : "You'll get a prompt on your phone to approve this payment."}
      </p>

      <div className="flex-1" />
      <PoweredByInstay />
    </PortalFrame>
  );
}
