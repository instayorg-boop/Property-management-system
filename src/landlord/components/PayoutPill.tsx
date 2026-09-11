import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Wallet } from "@phosphor-icons/react";
import PayoutDetailDrawer from "./PayoutDetailDrawer";
import { usePayoutSummary } from "../usePayoutSummary";
import { useIsOwner } from "../useIsOwner";

/** Compact "K[amount] ready · Online payments" pill for the Accounting page header — the fast path to the
 * existing PayoutDetailDrawer, so withdrawing doesn't require a trip to Settings. A small red dot
 * appears if the most recent transfer attempt failed, so a failed payout doesn't go unnoticed just
 * because nothing's actively wrong on this page. Renders nothing at all (not even a disabled state)
 * for anyone useIsOwner says no to — see that hook's comment for what it actually checks today. */
export default function PayoutPill() {
  const isOwner = useIsOwner();
  const { payout, hasFailedPayout } = usePayoutSummary();
  const [open, setOpen] = useState(false);

  if (!isOwner || !payout) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-2 text-left transition-colors hover:bg-mist"
      >
        {hasFailedPayout && (
          <span
            aria-label="Last transfer failed"
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-paper"
          />
        )}
        <Wallet size={15} weight="duotone" className="shrink-0 text-brand" />
        <span className="text-sm font-semibold text-ink whitespace-nowrap">{payout.amount} ready</span>
        <span className="shrink-0 rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-medium text-muted whitespace-nowrap">
          Online payments
        </span>
      </button>

      <AnimatePresence>
        {open && payout && <PayoutDetailDrawer payout={payout} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
