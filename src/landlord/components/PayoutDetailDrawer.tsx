import { useState } from "react";
import { Link } from "react-router-dom";
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
      setSendError(err instanceof Error ? err.message : "Failed to send payout.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SlideOver
      onClose={onClose}
      title="Payout details"
      description="Your next scheduled transfer to your bank account."
      footer={
        lencoConnected && payout.propertyId ? (
          <div className="space-y-2">
            {sendError && <p className="text-xs text-red-600">{sendError}</p>}
            {sent ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-center text-sm font-medium text-emerald-700">
                Payout sent — check history in a moment for the settled status.
              </p>
            ) : (
              <Button
                variant="primary"
                className="w-full py-3 hover:scale-[1.01] disabled:hover:scale-100"
                disabled={sending}
                onClick={sendNow}
              >
                {sending ? "Sending…" : "Send payout now"}
              </Button>
            )}
            <Link
              to={settingsTo}
              onClick={onClose}
              className="block w-full rounded-lg border border-line py-2.5 text-center text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              Manage payout settings
            </Link>
          </div>
        ) : (
          <Link
            to={settingsTo}
            onClick={onClose}
            className="block w-full rounded-lg bg-brand py-3 text-center text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            Manage payout settings
          </Link>
        )
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-line bg-mist p-4">
          <p className="text-xs text-muted">Amount</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink">{payout.amount}</p>
          <p className="mt-2 text-sm font-medium text-ink">{payout.status}</p>
          <p className="mt-0.5 text-xs text-muted">{payout.date}</p>
        </div>

        <div className="divide-y divide-line rounded-xl border border-line">
          <div className="px-4 py-3">
            <p className="text-xs text-muted">Bank account</p>
            <p className="mt-1 text-sm font-medium text-ink">{payout.bankAccount}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-muted">Payout schedule</p>
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
              Payouts are sent automatically via Lenco on your scheduled day. Transfers usually arrive within one
              business day.
            </p>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
