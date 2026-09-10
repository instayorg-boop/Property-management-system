import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import SlideOver from "./SlideOver";
import Button from "./Button";
import { useSettings } from "../SettingsContext";
import { useToast } from "../ToastContext";
import { sendPayout, checkPayoutStatus, type PayoutStatus } from "../../lib/payoutApi";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // ~60s before giving up and just saying "still processing"

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
  const { showToast } = useToast();
  const settingsTo = "/settings/online-payments";
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [resolvedStatus, setResolvedStatus] = useState<PayoutStatus | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const pollTimer = useRef<number | null>(null);
  // Guards the local UI state updates below, not the toast — the poll is deliberately left running
  // (see pollStatus) even after this drawer unmounts, so closing it can't silently swallow the
  // outcome the way it used to; the toast still fires, this ref just stops a "set state on an
  // unmounted component" warning for the parts of the UI that no longer exist to update.
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const pollStatus = (payoutId: string, attempt: number) => {
    checkPayoutStatus(payoutId)
      .then(({ status, failureReason: reason }) => {
        if (status === "successful" || status === "failed") {
          showToast(status === "successful" ? "Transfer to your bank was successful" : `Transfer failed${reason ? ` — ${reason}` : ""}`, status === "successful" ? "success" : "error");
          if (mounted.current) {
            setPolling(false);
            setResolvedStatus(status);
            setFailureReason(reason);
          }
          return;
        }
        if (attempt >= MAX_POLLS) {
          if (mounted.current) {
            setPolling(false);
            setStillWaiting(true);
          }
          return;
        }
        pollTimer.current = window.setTimeout(() => pollStatus(payoutId, attempt + 1), POLL_INTERVAL_MS);
      })
      .catch(() => {
        if (attempt >= MAX_POLLS) {
          if (mounted.current) {
            setPolling(false);
            setStillWaiting(true);
          }
          return;
        }
        pollTimer.current = window.setTimeout(() => pollStatus(payoutId, attempt + 1), POLL_INTERVAL_MS);
      });
  };

  const sendNow = async () => {
    if (!payout.propertyId) return;
    setSending(true);
    setSendError(null);
    setResolvedStatus(null);
    setStillWaiting(false);
    try {
      const { payoutId } = await sendPayout(payout.propertyId, payout.rawAmount);
      setPolling(true);
      pollStatus(payoutId, 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send the transfer.";
      setSendError(message);
      showToast(message, "error");
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
            {resolvedStatus === "successful" ? (
              <p className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-center text-sm font-medium text-emerald-700">
                <CheckCircle size={16} weight="fill" />
                Transfer successful
              </p>
            ) : resolvedStatus === "failed" ? (
              <div className="space-y-2">
                <p className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 py-2.5 text-center text-sm font-medium text-red-700">
                  <WarningCircle size={16} weight="fill" />
                  Transfer failed{failureReason ? ` — ${failureReason}` : ""}
                </p>
                <Button
                  variant="primary"
                  className="w-full py-3 hover:scale-[1.01] disabled:hover:scale-100"
                  disabled={sending}
                  onClick={sendNow}
                >
                  {sending ? "Sending…" : "Try again"}
                </Button>
              </div>
            ) : sending || polling ? (
              <p className="rounded-lg border border-line bg-mist py-2.5 text-center text-sm font-medium text-muted">
                {sending ? "Sending…" : "Waiting for Lenco to confirm…"}
              </p>
            ) : stillWaiting ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-center text-sm font-medium text-amber-700">
                Still processing — check back shortly.
              </p>
            ) : (
              <Button
                variant="primary"
                className="w-full py-3 hover:scale-[1.01] disabled:hover:scale-100"
                disabled={sending}
                onClick={sendNow}
              >
                Transfer to my bank
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
