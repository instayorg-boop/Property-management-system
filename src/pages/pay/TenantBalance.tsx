import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Warning } from "@phosphor-icons/react";
import { Skeleton as SkeletonBlock } from "../../landlord/components/Skeleton";
import {
  getPortalTenant,
  getPortalLedger,
  initiateCollection,
  getCollectionStatus,
  generatePortalReceipt,
  type PortalTenant,
  type PortalLedgerRow,
} from "../../lib/payPortal";
import PayShell from "./PayShell";
import RentStatement from "./RentStatement";
import MobileMoneyPayment from "./MobileMoneyPayment";
import PaymentFailed from "./PaymentFailed";
import { usePortalIdentity } from "./usePortalIdentity";

type FlowStep = "review" | "pay" | "failed";

export default function TenantBalance() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { propertySlug, tenantId, propertyName, propertyLogoUrl, propertyDueDay, notFound } = usePortalIdentity(token);
  const [tenant, setTenant] = useState<PortalTenant | null | undefined>(undefined);
  const [ledger, setLedger] = useState<PortalLedgerRow[]>([]);

  const [flowStep, setFlowStep] = useState<FlowStep>("review");
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<"mtn" | "airtel" | "zamtel">("mtn");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const pollTimer = useRef<number | null>(null);

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
        // Without this, a rejected RPC (e.g. an expired/invalid session) left `tenant` stuck at
        // `undefined` forever — the skeleton loading state, with no way out.
        if (cancelled) return;
        console.error("Failed to load portal tenant", err);
        setTenant(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertySlug, tenantId]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  if (notFound) {
    return (
      <PayShell propertyName="">
        <div className="pay-step flex flex-col items-center py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <Warning size={22} weight="duotone" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold tracking-tight text-[#0d253d]">Link not found</h1>
          <p className="mt-1.5 max-w-xs text-sm text-[#64748d]">
            This payment link isn't valid anymore. Check the link, or ask your landlord for a new one.
          </p>
          <Link to="/" className="mt-4 text-sm font-medium text-[#533afd] hover:underline">
            Go to Instay
          </Link>
        </div>
      </PayShell>
    );
  }

  if (tenant === undefined) {
    return (
      <div className="mx-auto max-w-[440px] space-y-5 px-4 py-10">
        <SkeletonBlock className="h-4 w-40" />
        <div className="space-y-2 rounded border border-line p-6">
          <SkeletonBlock className="h-6 w-48" />
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="mt-4 h-10 w-40" />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <PayShell propertyName={propertyName}>
        <p className="text-sm text-muted">We couldn't find your account. Ask your landlord for a new link.</p>
      </PayShell>
    );
  }

  // Real payment: kick off a Lenco mobile-money collection, then poll for the outcome — the
  // ledger is only ever updated by lenco-webhook once Lenco actually confirms it, never from here.
  const POLL_INTERVAL_MS = 3000;
  const MAX_POLLS = 20; // ~60s of polling before telling the tenant to check back later

  const pollCollectionStatus = (
    collectionId: string,
    attempt: number,
    charged: { amount: number; feeAmount: number; rentPortion: number; isPartial: boolean }
  ) => {
    getCollectionStatus(tenant.id, collectionId)
      .then(({ status, failureReason }) => {
        if (status === "successful") {
          // Fire-and-forget — the receipt is a convenience filed under Documents, not something
          // the tenant is blocked on seeing their success page for.
          void generatePortalReceipt(tenant.id, collectionId).catch((err) =>
            console.error("Failed to generate receipt", err)
          );
          navigate(`/p/${token}/success`, {
            state: {
              amount: charged.amount,
              feeAmount: charged.feeAmount,
              rentPortion: charged.rentPortion,
              isPartial: charged.isPartial,
              method: "mobile",
              provider,
              phone,
              reference: collectionId,
            },
          });
          return;
        }
        if (status === "failed") {
          setSubmitting(false);
          setFailureReason(failureReason ?? "The mobile money provider declined this payment. No amount was charged.");
          setFlowStep("failed");
          return;
        }
        // still pending/pay-offline — keep polling until MAX_POLLS
        if (attempt >= MAX_POLLS) {
          setStillWaiting(true);
          return;
        }
        pollTimer.current = window.setTimeout(() => pollCollectionStatus(collectionId, attempt + 1, charged), POLL_INTERVAL_MS);
      })
      .catch(() => {
        // A transient network/RPC error while polling shouldn't abandon a payment that might still
        // succeed — keep trying up to MAX_POLLS rather than surfacing a false failure.
        if (attempt >= MAX_POLLS) {
          setStillWaiting(true);
          return;
        }
        pollTimer.current = window.setTimeout(() => pollCollectionStatus(collectionId, attempt + 1, charged), POLL_INTERVAL_MS);
      });
  };

  const submitPayment = (
    chosenPhone: string,
    chosenOperator: "mtn" | "airtel" | "zamtel",
    chosenAmount: number,
    devSimulate?: "success" | "failed"
  ) => {
    if (!propertySlug) return;
    setPhone(chosenPhone);
    setProvider(chosenOperator);
    setPaymentError(null);
    setStillWaiting(false);
    setSubmitting(true);
    initiateCollection(propertySlug, tenant.id, chosenPhone, chosenOperator, chosenAmount, devSimulate)
      .then(({ collectionId, status, amount, feeAmount, rentPortion, isPartial }) => {
        const charged = { amount, feeAmount, rentPortion, isPartial };
        if (status === "successful") {
          void generatePortalReceipt(tenant.id, collectionId).catch((err) =>
            console.error("Failed to generate receipt", err)
          );
          navigate(`/p/${token}/success`, {
            state: { ...charged, method: "mobile", provider: chosenOperator, phone: chosenPhone, reference: collectionId },
          });
          return;
        }
        if (status === "failed") {
          setSubmitting(false);
          setFailureReason("The mobile money provider declined this payment. No amount was charged.");
          setFlowStep("failed");
          return;
        }
        pollCollectionStatus(collectionId, 0, charged);
      })
      .catch((err) => {
        setSubmitting(false);
        setFailureReason(err instanceof Error ? err.message : "Something went wrong starting the payment. No amount was charged.");
        setFlowStep("failed");
      });
  };

  if (flowStep === "review") {
    return (
      <RentStatement
        tenant={tenant}
        ledger={ledger}
        propertyName={propertyName}
        avatarUrl={propertyLogoUrl}
        token={token ?? ""}
        propertySlug={propertySlug ?? ""}
        tenantId={tenant.id}
        dueDay={propertyDueDay}
        onPay={() => setFlowStep("pay")}
      />
    );
  }

  // A real charge failure gets its own full page with the actual reason — the same weight a
  // successful payment gets — instead of a small red line under the form that's easy to miss and
  // never explains what went wrong.
  if (flowStep === "failed") {
    return (
      <PaymentFailed
        reason={failureReason}
        propertyName={propertyName}
        avatarUrl={propertyLogoUrl}
        propertySlug={propertySlug ?? ""}
        tenantId={tenant.id}
        onRetry={() => setFlowStep("pay")}
        onBack={() => setFlowStep("review")}
      />
    );
  }

  // The whole submit-and-wait sequence stays on this same page (rather than swapping to a
  // separately-styled "processing" screen) — submitting/stillWaiting just change what the pay bar
  // and the copy beneath the phone field say, so the design never jumps mid-payment.
  return (
    <MobileMoneyPayment
      tenant={tenant}
      ledger={ledger}
      propertyName={propertyName}
      avatarUrl={propertyLogoUrl}
      error={paymentError}
      submitting={submitting}
      stillWaiting={stillWaiting}
      onBack={() => setFlowStep("review")}
      onPay={({ amount, phone: chosenPhone, operator, devSimulate }) => {
        if (paymentError) setPaymentError(null);
        if (!devSimulate && chosenPhone.trim().length < 9) {
          setPaymentError("Enter a valid phone number.");
          return;
        }
        submitPayment(chosenPhone, operator, amount, devSimulate);
      }}
    />
  );
}
