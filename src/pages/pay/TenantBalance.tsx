import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { Wrench as WrenchIcon } from "@phosphor-icons/react";
import { formatCurrency } from "../../landlord/TenantsContext";
import BackArrow from "./BackArrow";
import Spinner from "./Spinner";
import Skeleton from "./Skeleton";
import {
  getPortalProperty,
  getPortalTenant,
  getPortalLedger,
  getPortalSessionToken,
  initiateCollection,
  getCollectionStatus,
  type PortalTenant,
  type PortalLedgerRow,
} from "../../lib/payPortal";
import PayShell, { type PayStep } from "./PayShell";

const statusStyle: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-[#fce4e9] text-[#ea2261]",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-[#faf1e2] text-[#9b6829]",
};
const statusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

type FlowStep = "review" | "pay" | "processing";
const PROVIDERS = ["MTN", "Airtel", "Zamtel"] as const;
const PROVIDER_ICON: Record<(typeof PROVIDERS)[number], string> = {
  MTN: "https://cdn.brandfetch.io/idtdXB-ogi/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B",
  Airtel: "https://cdn.brandfetch.io/idvMDbAci6/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B",
  Zamtel: "https://cdn.brandfetch.io/id8xS_vcc_/w/150/h/150/theme/dark/logo.png?c=1dxbfHSJFAPEGdCLU4o5B",
};

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

  // Every visit now arrives via a personal /p/:token link (TokenLink.tsx), which mints this
  // session directly — no OTP step (the token itself is the proof of identity; see
  // pay-portal-resolve-token's comment). If there's no session at all, there's no OTP form to
  // fall back to either, since without a token there was never a request to verify in the first
  // place — just tell the tenant their link is stale.
  const verified = !!(tenantId && getPortalSessionToken(tenantId));
  const claimedName = (location.state as { name?: string; room?: string } | null)?.name;

  useEffect(() => {
    if (!propertySlug) return;
    getPortalProperty(propertySlug).then((property) => setPropertyName(property?.name ?? ""));
  }, [propertySlug]);

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
        <div className="py-4 text-center">
          <h1 className="font-display text-xl font-semibold tracking-tight text-[#0d253d]">
            {claimedName ? `This link has expired, ${claimedName.split(" ")[0]}` : "This link has expired"}
          </h1>
          <p className="mt-1.5 text-sm text-[#64748d]">Ask your landlord to resend your payment link and try again.</p>
        </div>
      </PayShell>
    );
  }

  if (tenant === undefined) {
    return (
      <PayShell propertyName={propertyName} step="balance">
        <div className="mt-4 flex items-baseline justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="mt-6 space-y-2 border-y border-[#e3e8ee] py-6 text-center">
          <Skeleton className="mx-auto h-3 w-20" />
          <Skeleton className="mx-auto h-9 w-36" />
        </div>
        <div className="mt-4 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <Skeleton className="mt-6 h-11 w-full rounded-full" />
      </PayShell>
    );
  }

  if (!tenant) {
    return (
      <PayShell propertyName={propertyName}>
        <p className="text-sm text-muted">We couldn't find your account. Ask your landlord for a new link.</p>
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
        <div className="pay-step">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-display text-lg font-semibold tracking-tight text-[#0d253d]">{tenant.name}</p>
              <p className="text-xs text-[#64748d]">
                {tenant.room} · {tenant.roomType}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[tenant.status]}`}>
              {statusLabel[tenant.status]}
            </span>
          </div>

          <div className="mt-6 border-y border-[#e3e8ee] py-6 text-center">
            <p className="text-xs text-[#64748d]">{fullyPaid ? "You're all paid up" : "Amount due"}</p>
            <p className="mt-1 font-display text-4xl font-semibold tracking-tight text-[#0d253d]">
              {fullyPaid ? formatCurrency(tenant.rentAmount) : formatCurrency(amountDue)}
            </p>
            {tenant.status === "overdue" && tenant.daysOverdue ? (
              <p className="mt-1 text-xs font-medium text-[#ea2261]">{tenant.daysOverdue} days overdue</p>
            ) : null}
          </div>

          {!fullyPaid && openLedger.length > 0 && (
            <div className="mt-4">
              {openLedger.map((row, i) => (
                <div key={i} className="flex items-baseline justify-between border-b border-[#e3e8ee] py-2.5 text-sm">
                  <span className="text-[#64748d]">{row.label}</span>
                  <span className="font-medium text-[#0d253d]">
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
              className="mt-6 w-full rounded-full bg-[#533afd] py-3 text-sm font-medium text-white transition-colors hover:bg-[#4434d4] active:bg-[#2e2b8c]"
            >
              Continue to pay {formatCurrency(amountDue)}
            </button>
          )}

          {/* Nothing to pay right now, so this is the only place a paid-up tenant can reach
              maintenance reporting from — everyone else sees it after paying, on the success page. */}
          {fullyPaid && (
            <Link
              to={`/pay/${propertySlug}/${tenant.id}/report`}
              className="mt-6 flex items-center justify-center gap-1.5 text-sm text-[#64748d] hover:text-[#0d253d]"
            >
              <WrenchIcon size={14} weight="duotone" />
              Report a maintenance issue
            </Link>
          )}
        </div>
      )}

      {flowStep === "pay" && (
        <div className="pay-step">
          <button
            type="button"
            onClick={() => setFlowStep("review")}
            className="flex items-center gap-1 text-xs font-medium text-[#64748d] hover:text-[#0d253d]"
          >
            <BackArrow className="h-4 w-4" />
            Back
          </button>

          <div className="mt-4">
            <h1 className="font-display text-lg font-semibold tracking-tight text-[#0d253d]">Pay with mobile money</h1>
            <p className="mt-1 text-sm text-[#64748d]">
              {formatCurrency(amountDue)} due for {tenant.room}
            </p>
          </div>

          <div className="mt-5 flex gap-6 border-b border-[#e3e8ee]">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                  provider === p ? "border-[#533afd] text-[#0d253d]" : "border-transparent text-[#64748d] hover:text-[#0d253d]"
                }`}
              >
                <img src={PROVIDER_ICON[p]} alt="" className="h-4 w-4 rounded-full object-cover" />
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
              className="w-full border-b border-[#a8c3de] bg-transparent pb-3 text-base text-[#0d253d] outline-none placeholder:text-[#64748d] focus:border-[#533afd]"
            />
            <p className="mt-2 text-xs text-[#64748d]">You'll get a prompt on this number to approve the payment.</p>
          </div>

          {paymentError && <p className="mt-3 text-sm text-[#ea2261]">{paymentError}</p>}

          <button
            type="button"
            onClick={submitPayment}
            disabled={!canPay}
            className="mt-6 w-full rounded-full bg-[#533afd] py-3 text-sm font-medium text-white transition-colors hover:bg-[#4434d4] active:bg-[#2e2b8c] disabled:opacity-50"
          >
            Pay {formatCurrency(amountDue)}
          </button>
        </div>
      )}

      {flowStep === "processing" && !stillWaiting && (
        <div className="pay-step flex flex-col items-center justify-center py-12 text-center">
          <Spinner size={28} color="#533afd" />
          <p className="mt-4 text-sm font-medium text-[#0d253d]">Check your phone to approve on {provider}…</p>
          <p className="mt-1 text-xs text-[#64748d]">Don't close this page.</p>
        </div>
      )}

      {flowStep === "processing" && stillWaiting && (
        <div className="pay-step flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-[#0d253d]">Still waiting on approval</p>
          <p className="mt-1 max-w-xs text-xs text-[#64748d]">
            This is taking longer than usual. Approve the prompt on your phone whenever you're ready — your balance
            will update automatically once it goes through.
          </p>
          <Link
            to={`/pay/${propertySlug}/${tenant.id}`}
            className="mt-5 rounded-full border border-[#e3e8ee] px-4 py-2.5 text-sm font-medium text-[#0d253d] transition-colors hover:bg-[#f6f9fc]"
          >
            View my balance
          </Link>
        </div>
      )}
    </PayShell>
  );
}
