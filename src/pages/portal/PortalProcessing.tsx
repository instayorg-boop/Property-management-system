import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CheckCircle, CircleDashed, CircleNotch } from "@phosphor-icons/react";
import { initiateCollection, getCollectionStatus, generatePortalReceipt } from "../../lib/payPortal";
import { invalidatePortal } from "./portalData";
import { PortalButton, PoweredByInstay } from "./portalUi";

type Operator = "mtn" | "airtel" | "zamtel";

/** What PortalCheckout hands off via navigate state the moment the tenant taps "Pay": this page
 * owns the whole rest of the transaction from here (the actual initiateCollection call, the poll
 * loop, and routing on to success/failed). Checkout no longer does any of that itself; it only
 * validates the form and sends the tenant here. */
type StartState = {
  propertySlug: string;
  tenantId: string;
  phone: string;
  operator: Operator;
  amount?: number;
  devSimulate?: "success" | "failed";
};

/** What's saved to sessionStorage the moment a collection exists, so a reload resumes polling the
 * SAME collection instead of either losing track of it or calling initiateCollection a second
 * time (which would start a second real mobile-money charge). Keyed by token, not a single fixed
 * key, so two tabs on two different tenant links can't clobber each other's in-flight payment. */
type ResumeState = {
  collectionId: string;
  charged: { amount: number; feeAmount: number; rentPortion: number; isPartial: boolean };
  chargedWith: Operator;
  phone: string;
  startedAt: number;
};

const POLL_INTERVAL_MS = 3000;
// How long to keep actively polling before giving up and handing the tenant a way out, measured
// from startedAt (wall-clock), not a local attempt counter, so a reload partway through doesn't
// reset the budget and leave this page polling far longer than ~60s in total.
const GIVE_UP_AFTER_MS = 60_000;

function storageKey(token: string): string {
  return `instay:portal-processing:${token}`;
}

function readResumeState(token: string): ResumeState | null {
  try {
    const raw = sessionStorage.getItem(storageKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeState;
    if (!parsed?.collectionId || !parsed?.charged || !parsed?.chargedWith || !parsed?.startedAt) return null;
    return parsed;
  } catch {
    // Private-mode/blocked storage, or corrupted JSON: treat exactly like "nothing to resume".
    return null;
  }
}

function writeResumeState(token: string, state: ResumeState): void {
  try {
    sessionStorage.setItem(storageKey(token), JSON.stringify(state));
  } catch {
    // Best-effort only: if this fails, a reload mid-payment just won't resume cleanly, which is
    // no worse than the behaviour before this page existed.
  }
}

function clearResumeState(token: string): void {
  try {
    sessionStorage.removeItem(storageKey(token));
  } catch {
    // Nothing to clean up if storage isn't available in the first place.
  }
}

type Phase = "starting" | "waiting" | "stillWaiting";

/**
 * Takes over the instant the tenant taps "Pay" on checkout, and holds the screen until the
 * payment resolves. Three things this page exists to do that living on the checkout form never
 * could:
 *
 * 1. Show real progress (payment started, prompt sent, waiting for approval, each one a real
 *    signal from the backend, not a fake timer) instead of one static "Waiting for approval…"
 *    button label.
 * 2. Block the back button and swipe-back the whole time a charge could be in flight, so a tenant
 *    can't accidentally back out mid-payment and land back on a form that looks like nothing
 *    happened.
 * 3. Survive a reload: the in-flight collectionId is saved to sessionStorage the moment it exists,
 *    so reloading this page resumes polling that SAME collection rather than losing track of it
 *    or (worse) calling initiateCollection a second time.
 */
export default function PortalProcessing() {
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("starting");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);
  // Guards against the effect below firing twice (React 18 strict-mode double-mount in dev, or a
  // re-render before the async initiateCollection call has returned) and starting two real
  // mobile-money charges for one tap of "Pay".
  const startedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
      if (tickTimer.current) window.clearInterval(tickTimer.current);
    };
  }, []);

  // Traps the back button and swipe-back for as long as this page is in charge of an in-flight
  // payment. Pushing one extra history entry on mount, then re-pushing it every time `popstate`
  // fires, means the browser's own back action never actually leaves this page: there's nothing
  // behind it to go back TO until the payment resolves and this page navigates away itself.
  useEffect(() => {
    if (phase === "stillWaiting") return; // the escape hatch below is the only way out from here
    window.history.pushState(null, "", window.location.href);
    const onPopState = () => window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [phase]);

  const finish = useCallback(
    (collectionId: string, charged: ResumeState["charged"], chargedWith: Operator, phone: string) => {
      clearResumeState(token!);
      void generatePortalReceipt(startParams.current?.tenantId ?? "", collectionId).catch((err) =>
        console.error("Failed to generate receipt", err)
      );
      if (startParams.current?.tenantId) invalidatePortal(token!, startParams.current.tenantId);
      navigate(`/p/${token}/success`, {
        state: { ...charged, provider: chargedWith, phone, reference: collectionId },
        replace: true,
      });
    },
    [navigate, token]
  );

  const fail = useCallback(
    (reason: string) => {
      clearResumeState(token!);
      navigate(`/p/${token}/failed`, { state: { reason }, replace: true });
    },
    [navigate, token]
  );

  // Holds the one piece of state `finish` needs that isn't already threaded through the poll
  // loop's own closures (the tenantId, for the receipt call): a ref because it's set once, from
  // whichever source (fresh start vs resume) won the race in the effect below, and read later
  // from a callback that must stay referentially stable across renders.
  const startParams = useRef<{ tenantId: string } | null>(null);
  // The current collection's own details, kept up to date from both the fresh-start and resume
  // paths below, so the "check again" button a tenant sees once this gives up waiting has
  // something to actually check against, rather than only being reachable from inside the poll
  // loop's own closures.
  const active = useRef<ResumeState | null>(null);
  const [checkingNow, setCheckingNow] = useState(false);

  const poll = useCallback(
    (collectionId: string, charged: ResumeState["charged"], chargedWith: Operator, phone: string, startedAt: number) => {
      active.current = { collectionId, charged, chargedWith, phone, startedAt };
      getCollectionStatus(startParams.current?.tenantId ?? "", collectionId)
        .then(({ status, failureReason }) => {
          if (status === "successful") return finish(collectionId, charged, chargedWith, phone);
          if (status === "failed") {
            return fail(failureReason ?? "The mobile money provider declined this payment. No amount was charged.");
          }
          if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
            setPhase("stillWaiting");
            return;
          }
          pollTimer.current = window.setTimeout(() => poll(collectionId, charged, chargedWith, phone, startedAt), POLL_INTERVAL_MS);
        })
        .catch(() => {
          // A transient network error mid-poll shouldn't abandon a payment that may still succeed.
          if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
            setPhase("stillWaiting");
            return;
          }
          pollTimer.current = window.setTimeout(() => poll(collectionId, charged, chargedWith, phone, startedAt), POLL_INTERVAL_MS);
        });
    },
    [finish, fail]
  );

  const checkAgain = useCallback(() => {
    if (!active.current || checkingNow) return;
    const { collectionId, charged, chargedWith, phone } = active.current;
    setCheckingNow(true);
    getCollectionStatus(startParams.current?.tenantId ?? "", collectionId)
      .then(({ status, failureReason }) => {
        if (status === "successful") return finish(collectionId, charged, chargedWith, phone);
        if (status === "failed") {
          return fail(failureReason ?? "The mobile money provider declined this payment. No amount was charged.");
        }
        // Still pending: give it another full window rather than dropping straight back to
        // "stillWaiting" after one more check, since a tenant tapping this just confirmed on
        // their phone a moment ago is exactly the case this exists for.
        const startedAt = Date.now();
        writeResumeState(token!, { collectionId, charged, chargedWith, phone, startedAt });
        setCheckingNow(false);
        setPhase("waiting");
        const tick = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        tick();
        if (tickTimer.current) window.clearInterval(tickTimer.current);
        tickTimer.current = window.setInterval(tick, 1000);
        poll(collectionId, charged, chargedWith, phone, startedAt);
      })
      .catch(() => setCheckingNow(false));
  }, [token, checkingNow, finish, fail, poll]);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;

    const resumed = readResumeState(token);
    if (resumed) {
      // Reload mid-payment: the tenantId isn't in sessionStorage (only what finish/poll need to
      // identify the collection), but getCollectionStatus's own stored-row fallback works without
      // it, and the receipt/invalidate calls below just no-op gracefully without a tenantId. The
      // important thing is this never calls initiateCollection again.
      startParams.current = { tenantId: "" };
      setPhase("waiting");
      const tick = () => setElapsedSeconds(Math.floor((Date.now() - resumed.startedAt) / 1000));
      tick();
      tickTimer.current = window.setInterval(tick, 1000);
      poll(resumed.collectionId, resumed.charged, resumed.chargedWith, resumed.phone, resumed.startedAt);
      return;
    }

    const start = (location.state as StartState | null) ?? null;
    if (!start?.tenantId || !start?.propertySlug || !start?.phone || !start?.operator) {
      // Opened directly with nothing to act on: bounce back to the form rather than show an
      // empty processing screen for a payment that was never started.
      navigate(`/p/${token}/pay`, { replace: true });
      return;
    }

    startParams.current = { tenantId: start.tenantId };
    initiateCollection(start.propertySlug, start.tenantId, start.phone, start.operator, start.amount, start.devSimulate)
      .then(({ collectionId, status, amount, feeAmount, rentPortion, isPartial }) => {
        const charged = { amount, feeAmount, rentPortion, isPartial };
        if (status === "successful") return finish(collectionId, charged, start.operator, start.phone);
        if (status === "failed") {
          return fail("The mobile money provider declined this payment. No amount was charged.");
        }
        const startedAt = Date.now();
        writeResumeState(token, { collectionId, charged, chargedWith: start.operator, phone: start.phone, startedAt });
        setPhase("waiting");
        const tick = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        tick();
        tickTimer.current = window.setInterval(tick, 1000);
        poll(collectionId, charged, start.operator, start.phone, startedAt);
      })
      .catch((err) => {
        setStartError(
          err instanceof Error && err.message && err.message !== "Failed to start the payment."
            ? err.message
            : "We could not confirm whether this payment started. Do not pay again yet. If you approved a prompt on your phone, it will show in your payment history within a few minutes."
        );
      });
    // Deliberately runs once on mount only: re-running on every render (location.state is a new
    // object identity each time React Router re-renders this route) would call initiateCollection
    // repeatedly. `startedRef` above is the actual guard; this array just avoids the lint noise of
    // listing every value closed over without also re-triggering on them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (startError) {
    navigate(`/p/${token}/failed`, { state: { reason: startError }, replace: true });
    return null;
  }

  const steps: { label: string; done: boolean; active: boolean }[] = [
    { label: "Payment started", done: phase !== "starting", active: phase === "starting" },
    { label: "Prompt sent to your phone", done: phase !== "starting", active: false },
    {
      label: phase === "stillWaiting" ? "Still waiting on your network" : "Waiting for your approval",
      done: false,
      active: phase === "waiting" || phase === "stillWaiting",
    },
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10">
      <div className="w-full max-w-[320px]">
        <div className="flex flex-col items-center text-center">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: "var(--p-accent-tint)", color: "var(--p-accent)" }}
          >
            <CircleNotch size={28} weight="bold" className="animate-spin" />
          </span>
          <h1 className="display mt-5 text-[19px] font-semibold">
            {phase === "stillWaiting" ? "Still confirming" : "Confirming your payment"}
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--p-muted)" }}>
            {phase === "starting"
              ? "One moment…"
              : phase === "stillWaiting"
                ? "This is taking longer than usual."
                : `${elapsedSeconds}s elapsed`}
          </p>
        </div>

        <div className="mt-7 space-y-3.5">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-3">
              {step.done ? (
                <CheckCircle size={22} weight="fill" style={{ color: "var(--p-green)" }} />
              ) : step.active ? (
                <CircleNotch size={22} weight="bold" className="animate-spin" style={{ color: "var(--p-accent)" }} />
              ) : (
                <CircleDashed size={22} style={{ color: "var(--p-line-strong)" }} />
              )}
              <span
                className="text-[14px] font-medium"
                style={{ color: step.done || step.active ? "var(--p-ink)" : "var(--p-muted)" }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {phase === "stillWaiting" && (
          <div className="mt-7 space-y-2.5">
            <p className="mb-1 text-center text-[12px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
              If you approved the prompt on your phone, this should confirm any moment. Tap check
              again, or come back to it later from your payment history.
            </p>
            <PortalButton onClick={checkAgain} disabled={checkingNow}>
              {checkingNow ? "Checking…" : "Check again"}
            </PortalButton>
            <PortalButton to={`/p/${token}`} variant="secondary">
              Go to home
            </PortalButton>
          </div>
        )}
      </div>

      <div className="flex-1" />
      <PoweredByInstay />
    </div>
  );
}
