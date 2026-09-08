import { useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, CheckCircle } from "@phosphor-icons/react";
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
      {/* One compact card instead of three stacked ones — plain white, a small icon, tight rows
          with dividers rather than each fact getting its own boxed block. */}
      <div className="rounded-xl border border-line">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-ink">
            <Wallet size={16} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Balance · {payout.date}</p>
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">{payout.amount}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              lencoConnected ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
            }`}
          >
            {payout.status}
          </span>
        </div>

        <div className="divide-y divide-line border-t border-line">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs text-muted">Bank account</span>
            <span className="text-sm font-medium text-ink">{payout.bankAccount}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs text-muted">Transfer schedule</span>
            <span className="text-sm font-medium text-ink">{payout.schedule}</span>
          </div>
        </div>

        {lencoConnected && (
          <div className="flex items-start gap-2 border-t border-line px-4 py-3">
            <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="text-xs text-muted">
              Transferred automatically via Lenco — usually within one business day.
            </p>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
