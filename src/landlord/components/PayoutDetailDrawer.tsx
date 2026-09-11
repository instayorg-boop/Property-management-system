import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, CheckCircle, WarningCircle, CaretDown } from "@phosphor-icons/react";
import SlideOver from "./SlideOver";
import Button from "./Button";
import { useSettings } from "../SettingsContext";
import { useToast } from "../ToastContext";
import { formatCurrency } from "../TenantsContext";
import {
  sendPayout,
  checkPayoutStatus,
  listPayouts,
  requestWithdrawalOtp,
  verifyWithdrawalOtp,
  type PayoutStatus,
  type PayoutRecord,
} from "../../lib/payoutApi";

const RECENT_PAYOUTS_LIMIT = 10;

const payoutStatusLabel: Record<PayoutStatus, string> = {
  pending: "Pending",
  processing: "Pending",
  successful: "Completed",
  failed: "Failed",
};
const payoutStatusStyle: Record<PayoutStatus, string> = {
  pending: "bg-amber-50 text-amber-600",
  processing: "bg-amber-50 text-amber-600",
  successful: "bg-emerald-50 text-emerald-600",
  failed: "bg-red-50 text-red-600",
};
// Failed and pending/processing float to the top regardless of date — those are the ones that
// actually need attention; a long-settled "Completed" row further down needs none.
const payoutSortRank: Record<PayoutStatus, number> = { failed: 0, pending: 1, processing: 1, successful: 2 };

function formatPayoutDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function RecentPayouts({ propertyId }: { propertyId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PayoutRecord[] | null>(null);

  useEffect(() => {
    if (!expanded || rows !== null) return;
    setLoading(true);
    listPayouts(propertyId, { limit: RECENT_PAYOUTS_LIMIT })
      .then((data) => setRows(data))
      .catch((e) => console.error("Failed to load recent payouts", e))
      .finally(() => setLoading(false));
  }, [expanded, rows, propertyId]);

  const sorted = rows ? [...rows].sort((a, b) => payoutSortRank[a.status] - payoutSortRank[b.status]) : [];

  return (
    <div className="mt-4 rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-ink">Recent payouts</span>
        <CaretDown size={14} weight="bold" className={`text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-line">
          {loading ? (
            <p className="px-4 py-4 text-center text-xs text-muted">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="px-4 py-4 text-center text-xs text-muted">No payouts yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {sorted.map((row) => (
                <div key={row.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{formatCurrency(row.amount)}</p>
                    <p className="text-xs text-muted">{formatPayoutDate(row.createdAt)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${payoutStatusStyle[row.status]}`}>
                    {payoutStatusLabel[row.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link
            to="/accounting/payouts"
            className="block border-t border-line py-2.5 text-center text-xs font-medium text-brand hover:underline"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}

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
  // A second factor is required before a transfer actually fires — see request/verify-withdrawal-otp's
  // comments for why this is real server-side authorization, not just a UI step.
  const [otpStage, setOtpStage] = useState<"idle" | "requesting" | "entering">("idle");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
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

  const startConfirmation = async () => {
    if (!payout.propertyId) return;
    setOtpStage("requesting");
    setSendError(null);
    setDevCode(null);
    try {
      const { maskedEmail: masked, devCode: dev } = await requestWithdrawalOtp(payout.propertyId);
      setMaskedEmail(masked);
      setDevCode(dev ?? null);
      setOtpStage("entering");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send a confirmation code.";
      setSendError(message);
      setOtpStage("idle");
      showToast(message, "error");
    }
  };

  const sendNow = async () => {
    if (!payout.propertyId || otpCode.trim().length !== 6) return;
    setSending(true);
    setSendError(null);
    setResolvedStatus(null);
    setStillWaiting(false);
    try {
      const { confirmationToken } = await verifyWithdrawalOtp(payout.propertyId, otpCode.trim());
      const { payoutId } = await sendPayout(payout.propertyId, payout.rawAmount, confirmationToken);
      setOtpStage("idle");
      setOtpCode("");
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
                  disabled={otpStage === "requesting"}
                  onClick={startConfirmation}
                >
                  {otpStage === "requesting" ? "Sending…" : "Try again"}
                </Button>
              </div>
            ) : sending || polling ? (
              <p className="rounded-lg border border-line bg-mist py-2.5 text-center text-sm font-medium text-muted">
                {sending ? "Sending…" : "Waiting to confirm…"}
              </p>
            ) : stillWaiting ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-center text-sm font-medium text-amber-700">
                Still processing — check back shortly.
              </p>
            ) : otpStage === "entering" ? (
              <div className="space-y-2 rounded-lg border border-line p-3">
                <p className="text-xs text-muted">
                  We emailed a 6-digit code to {maskedEmail}. It expires in 5 minutes.
                </p>
                {devCode && (
                  <p className="text-xs text-amber-600">
                    Dev mode — email isn't connected yet, your code is <span className="font-mono font-semibold">{devCode}</span>.
                  </p>
                )}
                <input
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && sendNow()}
                  inputMode="numeric"
                  placeholder="000000"
                  disabled={sending}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-center text-lg font-semibold tracking-[0.3em] text-ink outline-none focus:border-brand"
                />
                <Button
                  variant="primary"
                  className="w-full py-3 hover:scale-[1.01] disabled:hover:scale-100"
                  disabled={sending || otpCode.length !== 6}
                  onClick={sendNow}
                >
                  {sending ? "Sending…" : "Confirm & send"}
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                className="w-full py-3 hover:scale-[1.01] disabled:hover:scale-100"
                disabled={otpStage === "requesting"}
                onClick={startConfirmation}
              >
                {otpStage === "requesting" ? "Sending code…" : "Transfer to my bank"}
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
              Transferred automatically through online payment collection — usually within one business day.
            </p>
          </div>
        )}
      </div>

      {payout.propertyId && <RecentPayouts propertyId={payout.propertyId} />}
    </SlideOver>
  );
}
