import { useLocation, useParams } from "react-router-dom";
import { XCircle } from "@phosphor-icons/react";
import { Card, PortalButton, PoweredByInstay } from "./portalUi";

/**
 * A declined charge gets its own page with the actual reason, the same weight the success page
 * gets — not a red line under a form that's easy to miss and never says what went wrong. The
 * first thing on the page after the reason is the reassurance that nothing was taken, because
 * that is the question a tenant has the moment a payment fails.
 */
export default function PortalFailed() {
  const { token } = useParams();
  const location = useLocation();
  const reason =
    (location.state as { reason?: string } | null)?.reason ??
    "The payment didn't go through. No amount was charged.";

  return (
    <>
      <div className="flex flex-col items-center pt-10">
        <span
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
          style={{ background: "var(--p-red-tint)", color: "var(--p-red)" }}
        >
          <XCircle size={36} weight="fill" />
        </span>
        <h1 className="display mt-5 text-[22px] font-semibold">Payment didn't go through</h1>
        <p className="mt-2 max-w-[320px] text-center text-[14px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
          {reason}
        </p>
      </div>

      <Card className="mt-6 px-4 py-4">
        <p className="text-[13px] font-semibold">What to try next</p>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed" style={{ color: "var(--p-muted)" }}>
          <li>Check there's enough balance in your mobile money wallet.</li>
          <li>Make sure the number you entered is the one registered to that wallet.</li>
          <li>Approve the prompt on your phone before it times out.</li>
        </ul>
      </Card>

      <div className="mt-5 space-y-2.5">
        <PortalButton to={`/p/${token}/pay`}>Try again</PortalButton>
        <PortalButton to={`/p/${token}`} variant="secondary">
          Back home
        </PortalButton>
      </div>

      <div className="flex-1" />
      <PoweredByInstay />
    </>
  );
}
