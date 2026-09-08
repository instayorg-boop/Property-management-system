import { useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, TrendUp } from "@phosphor-icons/react";
import SlideOver from "./SlideOver";
import Button from "./Button";
import { useSettings } from "../SettingsContext";
import { sendPayout } from "../../lib/payoutApi";

export type UpcomingPayout = {
  amount: string;
  rawAmount: number;
  propertyId: string | null;
  date: string;
  status: string;
  bankAccount: string;
  schedule: string;
};

export default function PayoutDetailDrawer({
  payout,
  onClose,
}: {
  payout: UpcomingPayout;
  onClose: () => void;
}) {
  const { lencoConnected } = useSettings();
  const settingsTo = "/settings/online-payments";
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const sendNow = async () => {
    if (!payout.propertyId) return;
    setSending(true);
    setSendError(null);
    try {
      await sendPayout(payout.propertyId, payout.rawAmount);
      setSent(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send the transfer.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SlideOver
      onClose={onClose}
      title="Online payments balance"
      description="Money collected through mobile money — ready to transfer to your bank."
      footer={
        lencoConnected && payout.propertyId ? (
          <div className="space-y-2">
            {sendError && <p className="text-xs text-red-600">{sendError}</p>}
            {sent ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-center text-sm font-medium text-emerald-700">
                Transfer sent — check back shortly for the settled status.
              </p>
            ) : (
              <Button
                variant="primary"
                className="w-full py-3 hover:scale-[1.01] disabled:hover:scale-100"
                disabled={sending}
                onClick={sendNow}
              >
                {sending ? "Sending…" : "Transfer to my bank"}
              </Button>
            )}
            <Link
              to={settingsTo}
              onClick={onClose}
              className="block w-full rounded-lg border border-line py-2.5 text-center text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              Manage transfer settings
            </Link>
          </div>
        ) : (
          <Link
            to={settingsTo}
            onClick={onClose}
            className="block w-full rounded-lg bg-brand py-3 text-center text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            Manage transfer settings
          </Link>
        )
      }
    >
      <div className="space-y-5">
        {/* Balance card — this is the tenants' own money moving straight from mobile money into
            the landlord's account via Lenco; the wording here (and everywhere in this drawer)
            deliberately avoids "withdraw"/"collect", which reads as if the platform is holding
            the money itself. It never does — Lenco transfers it directly. */}
        <div className="overflow-hidden rounded-2xl bg-ink p-5 text-paper">
          <div className="flex items-center gap-2 text-paper/70">
            <Wallet size={16} weight="duotone" />
            <span className="text-xs font-medium">Balance</span>
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{payout.amount}</p>
          <div className="mt-3 flex items-center gap-1.5">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                lencoConnected ? "bg-emerald-400/20 text-emerald-300" : "bg-paper/10 text-paper/60"
              }`}
            >
              <TrendUp size={11} weight="bold" />
            </span>
            <span className="text-xs font-medium text-paper/90">{payout.status}</span>
          </div>
          <p className="mt-3 text-xs text-paper/50">{payout.date}</p>
        </div>

        <div className="divide-y divide-line rounded-xl border border-line">
          <div className="px-4 py-3">
            <p className="text-xs text-muted">Bank account</p>
            <p className="mt-1 text-sm font-medium text-ink">{payout.bankAccount}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-muted">Transfer schedule</p>
            <p className="mt-1 text-sm font-medium text-ink">{payout.schedule}</p>
          </div>
        </div>

        {lencoConnected && (
          <div className="rounded-xl border border-brand/20 bg-brand-soft/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-brand">Lenco</p>
                <p className="mt-1 text-sm font-medium text-ink">Connected</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-600">
                Active
              </span>
            </div>
            <p className="mt-3 text-xs text-muted">
              Online payments are transferred to your bank automatically via Lenco. Transfers usually arrive within
              one business day.
            </p>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
