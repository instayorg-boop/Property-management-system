import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import {
  CaretLeft as CaretLeftIcon,
  Wrench as WrenchIcon,
  DeviceMobile as DeviceMobileIcon,
  CreditCard as CreditCardIcon,
  ShieldCheck as ShieldCheckIcon,
  CaretRight as CaretRightIcon,
} from "@phosphor-icons/react";
import { formatCurrency } from "../../landlord/TenantsContext";
import {
  getPortalProperty,
  getPortalTenant,
  getPortalLedger,
  logPortalPayment,
  getPortalSessionToken,
  requestPortalOtp,
  verifyPortalOtp,
  type PortalTenant,
  type PortalLedgerRow,
} from "../../lib/payPortal";
import PayShell, { type PayStep } from "./PayShell";

const statusStyle: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};
const statusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

type Method = "mobile" | "card";
type FlowStep = "review" | "method" | "pay" | "processing";
const PROVIDERS = ["MTN", "Airtel", "Zamtel"] as const;

export default function TenantBalance() {
  const { propertySlug, tenantId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [propertyName, setPropertyName] = useState("");
  const [tenant, setTenant] = useState<PortalTenant | null | undefined>(undefined);
  const [ledger, setLedger] = useState<PortalLedgerRow[]>([]);

  const [flowStep, setFlowStep] = useState<FlowStep>("review");
  const [method, setMethod] = useState<Method | null>(null);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("MTN");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [verified, setVerified] = useState(() => (tenantId ? !!getPortalSessionToken(tenantId) : false));
  const [otpMaskedPhone, setOtpMaskedPhone] = useState<string | null>(null);
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpSendError, setOtpSendError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerifyError, setOtpVerifyError] = useState<string | null>(null);
  const claimedName = (location.state as { name?: string; room?: string } | null)?.name;

  useEffect(() => {
    if (!propertySlug) return;
    getPortalProperty(propertySlug).then((property) => setPropertyName(property?.name ?? ""));
  }, [propertySlug]);

  const sendOtp = () => {
    if (!propertySlug || !tenantId) return;
    setOtpSending(true);
    setOtpSendError(null);
    requestPortalOtp(propertySlug, tenantId)
      .then(({ maskedPhone, devCode }) => {
        setOtpMaskedPhone(maskedPhone);
        setOtpDevCode(devCode ?? null);
      })
      .catch((err) => setOtpSendError(err instanceof Error ? err.message : "Failed to send a code."))
      .finally(() => setOtpSending(false));
  };

  const autoSentFor = useRef<string | null>(null);
  useEffect(() => {
    if (verified || !tenantId) return;
    if (autoSentFor.current === tenantId) return;
    autoSentFor.current = tenantId;
    sendOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertySlug, tenantId, verified]);

  const submitOtp = () => {
    if (!propertySlug || !tenantId || otpCode.trim().length !== 6) return;
    setOtpVerifying(true);
    setOtpVerifyError(null);
    verifyPortalOtp(propertySlug, tenantId, otpCode.trim())
      .then(() => setVerified(true))
      .catch((err) => setOtpVerifyError(err instanceof Error ? err.message : "Incorrect code."))
      .finally(() => setOtpVerifying(false));
  };

  useEffect(() => {
    if (!verified || !propertySlug || !tenantId) return;
    let cancelled = false;
    (async () => {
      const t = await getPortalTenant(propertySlug, tenantId);
      if (cancelled) return;
      setTenant(t);
      if (t) setLedger(await getPortalLedger(t.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [verified, propertySlug, tenantId]);

  if (!verified) {
    return (
      <PayShell propertyName={propertyName}>
        <button
          type="button"
          onClick={() => navigate(`/pay/${propertySlug}`)}
          className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
        >
          <CaretLeftIcon size={12} weight="duotone" />
          Not you?
        </button>

        <div className="mt-4 flex items-center gap-2">
          <ShieldCheckIcon size={20} weight="duotone" className="text-brand" />
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {claimedName ? `Verify it's ${claimedName.split(" ")[0]}` : "Verify it's you"}
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted">For your privacy, we need to confirm your phone number first.</p>

        {otpSending && !otpMaskedPhone && <p className="mt-6 text-sm text-muted">Sending a code…</p>}

        {otpSendError && (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-red-600">{otpSendError}</p>
            <button type="button" onClick={sendOtp} className="text-sm font-medium text-brand hover:underline">
              Try again
            </button>
          </div>
        )}

        {otpMaskedPhone && (
          <>
            <p className="mt-6 text-sm text-ink">
              We sent a 6-digit code to the number on file, ending in <span className="font-medium">{otpMaskedPhone}</span>.
            </p>
            {otpDevCode && (
              <p className="mt-1 text-xs text-amber-600">
                Dev mode — SMS isn't connected yet, your code is <span className="font-mono font-semibold">{otpDevCode}</span>.
              </p>
            )}

            <div className="mt-5">
              <input
                autoFocus
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setOtpVerifyError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && submitOtp()}
                inputMode="numeric"
                placeholder="000000"
                className="w-full border-b border-line bg-transparent pb-3 text-center text-2xl font-semibold tracking-[0.3em] text-ink outline-none focus:border-brand"
              />
              {otpVerifyError && <p className="mt-2 text-xs text-red-600">{otpVerifyError}</p>}
            </div>

            <button
              type="button"
              onClick={submitOtp}
              disabled={otpCode.length !== 6 || otpVerifying}
              className="mt-5 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {otpVerifying ? "Verifying…" : "Verify"}
            </button>
            <button type="button" onClick={sendOtp} disabled={otpSending} className="mt-3 text-xs font-medium text-muted hover:text-ink">
              Didn't get it? Send another code
            </button>
          </>
        )}
      </PayShell>
    );
  }

  if (tenant === undefined) return <PayShell propertyName={propertyName}>{null}</PayShell>;

  if (!tenant) {
    return (
      <PayShell propertyName={propertyName}>
        <p className="text-sm text-muted">We couldn't find that tenant.</p>
        <Link to={`/pay/${propertySlug}`} className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
          Back to search
        </Link>
      </PayShell>
    );
  }

  const amountDue = tenant.owedAmount || tenant.rentAmount;
  const fullyPaid = tenant.status === "paid";
  const openLedger = ledger.filter((row) => row.status !== "paid");

  const canPay =
    method === "mobile" ? phone.trim().length >= 9 : cardNumber.replace(/\s/g, "").length >= 12 && cardExpiry.length >= 4 && cardCvv.length >= 3;

  const submitPayment = () => {
    setFlowStep("processing");
    window.setTimeout(() => {
      void logPortalPayment(tenant.id, amountDue).catch((e) => console.error("Failed to log payment", e));
      navigate(`/pay/${propertySlug}/${tenant.id}/success`, {
        state: { amount: amountDue, method, provider: method === "mobile" ? provider : "Card" },
      });
    }, 1600);
  };

  const shellStep: PayStep = flowStep === "review" ? "balance" : flowStep === "method" ? "method" : "pay";

  return (
    <PayShell propertyName={propertyName} step={shellStep}>
      {flowStep === "review" && (
        <>
          <button
            type="button"
            onClick={() => navigate(`/pay/${propertySlug}`)}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
          >
            <CaretLeftIcon size={12} weight="duotone" />
            Not you?
          </button>

          <div className="mt-4 flex items-baseline justify-between">
            <div>
              <p className="font-display text-lg font-semibold tracking-tight text-ink">{tenant.name}</p>
              <p className="text-xs text-muted">
                {tenant.room} · {tenant.roomType}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[tenant.status]}`}>
              {statusLabel[tenant.status]}
            </span>
          </div>

          <div className="mt-6 border-y border-line py-6 text-center">
            <p className="text-xs text-muted">{fullyPaid ? "You're all paid up" : "Amount due"}</p>
            <p className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">
              {fullyPaid ? formatCurrency(tenant.rentAmount) : formatCurrency(amountDue)}
            </p>
            {tenant.status === "overdue" && tenant.daysOverdue ? (
              <p className="mt-1 text-xs font-medium text-red-600">{tenant.daysOverdue} days overdue</p>
            ) : null}
          </div>

          {!fullyPaid && openLedger.length > 0 && (
            <div className="mt-4">
              {openLedger.map((row, i) => (
                <div key={i} className="flex items-baseline justify-between border-b border-line py-2.5 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="font-medium text-ink">
                    {formatCurrency(row.paidAmount ? row.amount - row.paidAmount : row.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!fullyPaid && (
            <button
              type="button"
              onClick={() => setFlowStep("method")}
              className="mt-6 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              Continue to pay {formatCurrency(amountDue)}
            </button>
          )}

          <Link
            to={`/pay/${propertySlug}/${tenant.id}/report`}
            className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted hover:text-ink"
          >
            <WrenchIcon size={14} weight="duotone" />
            Report a maintenance issue instead
          </Link>
        </>
      )}

      {flowStep === "method" && (
        <>
          <button type="button" onClick={() => setFlowStep("review")} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
            <CaretLeftIcon size={12} weight="duotone" />
            Back
          </button>

          <div className="mt-4">
            <h1 className="font-display text-lg font-semibold tracking-tight text-ink">How would you like to pay?</h1>
            <p className="mt-1 text-sm text-muted">{formatCurrency(amountDue)} due for {tenant.room}</p>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setMethod("mobile");
                setFlowStep("pay");
              }}
              className="group flex w-full items-center gap-3 border-b border-line py-4 text-left"
            >
              <DeviceMobileIcon size={18} weight="duotone" className="text-muted" />
              <div className="flex-1">
                <p className="text-base text-ink transition-colors group-hover:text-brand">Mobile money</p>
                <p className="text-xs text-muted">MTN, Airtel or Zamtel</p>
              </div>
              <CaretRightIcon size={14} weight="duotone" className="text-muted" />
            </button>

            <button
              type="button"
              onClick={() => {
                setMethod("card");
                setFlowStep("pay");
              }}
              className="group flex w-full items-center gap-3 border-b border-line py-4 text-left"
            >
              <CreditCardIcon size={18} weight="duotone" className="text-muted" />
              <div className="flex-1">
                <p className="text-base text-ink transition-colors group-hover:text-brand">Debit / credit card</p>
                <p className="text-xs text-muted">Visa or Mastercard</p>
              </div>
              <CaretRightIcon size={14} weight="duotone" className="text-muted" />
            </button>
          </div>
        </>
      )}

      {flowStep === "pay" && method === "mobile" && (
        <>
          <button type="button" onClick={() => setFlowStep("method")} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
            <CaretLeftIcon size={12} weight="duotone" />
            Back
          </button>

          <div className="mt-4">
            <h1 className="font-display text-lg font-semibold tracking-tight text-ink">Pay with mobile money</h1>
            <p className="mt-1 text-sm text-muted">{formatCurrency(amountDue)} due for {tenant.room}</p>
          </div>

          <div className="mt-5 flex gap-6 border-b border-line">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                  provider === p ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <input
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="Phone number"
              className="w-full border-b border-line bg-transparent pb-3 text-base text-ink outline-none placeholder:text-muted focus:border-brand"
            />
            <p className="mt-2 text-xs text-muted">You'll get a prompt on this number to approve the payment.</p>
          </div>

          <button
            type="button"
            onClick={submitPayment}
            disabled={!canPay}
            className="mt-6 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Pay {formatCurrency(amountDue)}
          </button>
        </>
      )}

      {flowStep === "pay" && method === "card" && (
        <>
          <button type="button" onClick={() => setFlowStep("method")} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
            <CaretLeftIcon size={12} weight="duotone" />
            Back
          </button>

          <div className="mt-4">
            <h1 className="font-display text-lg font-semibold tracking-tight text-ink">Pay with card</h1>
            <p className="mt-1 text-sm text-muted">{formatCurrency(amountDue)} due for {tenant.room}</p>
          </div>

          <div className="mt-5 space-y-5">
            <input
              autoFocus
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              inputMode="numeric"
              placeholder="Card number"
              className="w-full border-b border-line bg-transparent pb-3 text-base text-ink outline-none placeholder:text-muted focus:border-brand"
            />
            <div className="flex gap-6">
              <input
                value={cardExpiry}
                onChange={(e) => setCardExpiry(e.target.value)}
                placeholder="MM/YY"
                className="w-full border-b border-line bg-transparent pb-3 text-base text-ink outline-none placeholder:text-muted focus:border-brand"
              />
              <input
                value={cardCvv}
                onChange={(e) => setCardCvv(e.target.value)}
                inputMode="numeric"
                placeholder="CVV"
                className="w-full border-b border-line bg-transparent pb-3 text-base text-ink outline-none placeholder:text-muted focus:border-brand"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={submitPayment}
            disabled={!canPay}
            className="mt-6 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Pay {formatCurrency(amountDue)}
          </button>
        </>
      )}

      {flowStep === "processing" && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-soft border-t-brand" />
          <p className="mt-4 text-sm font-medium text-ink">
            {method === "mobile" ? `Check your phone to approve on ${provider}…` : "Processing your card payment…"}
          </p>
          <p className="mt-1 text-xs text-muted">Don't close this page.</p>
        </div>
      )}
    </PayShell>
  );
}