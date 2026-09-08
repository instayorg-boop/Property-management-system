import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import {
  CaretLeft as CaretLeftIcon,
  ShieldCheck as ShieldCheckIcon,
  Wrench as WrenchIcon,
} from "@phosphor-icons/react";
import { formatCurrency } from "../../landlord/TenantsContext";
import {
  getPortalProperty,
  getPortalTenant,
  getPortalLedger,
  getPortalSessionToken,
  requestPortalOtp,
  verifyPortalOtp,
  initiateCollection,
  getCollectionStatus,
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

type FlowStep = "review" | "pay" | "processing";
const PROVIDERS = ["MTN", "Airtel", "Zamtel"] as const;

/** Zambian mobile network prefixes — lets the mobile-money step skip asking "which network?" when
 * we already know the tenant's phone (from the number they just verified via OTP). Falls back to
 * MTN (the pre-selected default) if the prefix isn't recognized; the tenant can still switch it. */
function detectProvider(phone: string): (typeof PROVIDERS)[number] {
  const digits = phone.replace(/\D/g, "").replace(/^260/, "").replace(/^0/, "");
  const prefix = digits.slice(0, 2);
  if (["96", "76"].includes(prefix)) return "MTN";
  if (["97", "77"].includes(prefix)) return "Airtel";
  if (["95", "75"].includes(prefix)) return "Zamtel";
  return "MTN";
}

export default function TenantBalance() {
  const { propertySlug, tenantId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [propertyName, setPropertyName] = useState("");
  const [tenant, setTenant] = useState<PortalTenant | null | undefined>(undefined);
  const [ledger, setLedger] = useState<PortalLedgerRow[]>([]);

  const [flowStep, setFlowStep] = useState<FlowStep>("review");
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("MTN");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [stillWaiting, setStillWaiting] = useState(false);
  const pollTimer = useRef<number | null>(null);

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
      // Pre-fill mobile-money details from the phone already on file (the one they just verified
      // via OTP) — one less thing to type before paying.
      if (t?.phone) {
        setPhone(t.phone);
        setProvider(detectProvider(t.phone));
      }
      if (t) setLedger(await getPortalLedger(t.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [verified, propertySlug, tenantId]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

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

  const canPay = phone.trim().length >= 9;

  // Real payment: kick off a Lenco mobile-money collection, then poll for the outcome — the
  // ledger is only ever updated by lenco-webhook once Lenco actually confirms it, never from here.
  const POLL_INTERVAL_MS = 3000;
  const MAX_POLLS = 20; // ~60s of polling before telling the tenant to check back later

  const pollCollectionStatus = (collectionId: string, attempt: number) => {
    getCollectionStatus(tenant.id, collectionId)
      .then(({ status, failureReason }) => {
        if (status === "successful") {
          navigate(`/pay/${propertySlug}/${tenant.id}/success`, {
            state: { amount: amountDue, method: "mobile", provider },
          });
          return;
        }
        if (status === "failed") {
          setPaymentError(failureReason ?? "The payment failed. Try again.");
          setFlowStep("pay");
          return;
        }
        // still pending/pay-offline — keep polling until MAX_POLLS
        if (attempt >= MAX_POLLS) {
          setStillWaiting(true);
          return;
        }
        pollTimer.current = window.setTimeout(() => pollCollectionStatus(collectionId, attempt + 1), POLL_INTERVAL_MS);
      })
      .catch(() => {
        // A transient network/RPC error while polling shouldn't abandon a payment that might still
        // succeed — keep trying up to MAX_POLLS rather than surfacing a false failure.
        if (attempt >= MAX_POLLS) {
          setStillWaiting(true);
          return;
        }
        pollTimer.current = window.setTimeout(() => pollCollectionStatus(collectionId, attempt + 1), POLL_INTERVAL_MS);
      });
  };

  const submitPayment = () => {
    if (!propertySlug) return;
    setPaymentError(null);
    setStillWaiting(false);
    setFlowStep("processing");
    initiateCollection(propertySlug, tenant.id, phone, provider.toLowerCase() as "mtn" | "airtel" | "zamtel")
      .then(({ collectionId, status }) => {
        if (status === "successful") {
          navigate(`/pay/${propertySlug}/${tenant.id}/success`, {
            state: { amount: amountDue, method: "mobile", provider },
          });
          return;
        }
        if (status === "failed") {
          setPaymentError("The payment failed. Try again.");
          setFlowStep("pay");
          return;
        }
        pollCollectionStatus(collectionId, 0);
      })
      .catch((err) => {
        setPaymentError(err instanceof Error ? err.message : "Failed to start the payment.");
        setFlowStep("pay");
      });
  };

  const shellStep: PayStep = flowStep === "review" ? "balance" : "pay";

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
              onClick={() => setFlowStep("pay")}
              className="mt-6 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              Continue to pay {formatCurrency(amountDue)}
            </button>
          )}

          {/* Nothing to pay right now, so this is the only place a paid-up tenant can reach
              maintenance reporting from — everyone else sees it after paying, on the success page. */}
          {fullyPaid && (
            <Link
              to={`/pay/${propertySlug}/${tenant.id}/report`}
              className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted hover:text-ink"
            >
              <WrenchIcon size={14} weight="duotone" />
              Report a maintenance issue
            </Link>
          )}
        </>
      )}

      {flowStep === "pay" && (
        <>
          <button type="button" onClick={() => setFlowStep("review")} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
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

          {paymentError && <p className="mt-3 text-sm text-red-600">{paymentError}</p>}

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

      {flowStep === "processing" && !stillWaiting && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-soft border-t-brand" />
          <p className="mt-4 text-sm font-medium text-ink">Check your phone to approve on {provider}…</p>
          <p className="mt-1 text-xs text-muted">Don't close this page.</p>
        </div>
      )}

      {flowStep === "processing" && stillWaiting && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-ink">Still waiting on approval</p>
          <p className="mt-1 max-w-xs text-xs text-muted">
            This is taking longer than usual. Approve the prompt on your phone whenever you're ready — your balance
            will update automatically once it goes through.
          </p>
          <Link
            to={`/pay/${propertySlug}/${tenant.id}`}
            className="mt-5 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            View my balance
          </Link>
        </div>
      )}
    </PayShell>
  );
}