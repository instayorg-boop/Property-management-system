import { useEffect, useRef, useState, useMemo } from "react";
import { usePayoutSummary } from "./usePayoutSummary";
import {
  sendPayout,
  checkPayoutStatus,
  requestWithdrawalOtp,
  verifyWithdrawalOtp,
  type PayoutRecipient,
  type SendPayoutResult,
} from "../lib/payoutApi";

export type WithdrawStep = "idle" | "confirm" | "otp-sending" | "otp" | "sending" | "success" | "error";

export function recipientLabel(r: PayoutRecipient): string {
  if (r.type === "mobile-money") return `${(r.provider ?? "").toUpperCase()} •••• ${(r.phone_number ?? "").slice(-4)}`;
  return `${r.account_name ?? "Bank"} •••• ${(r.account_number ?? "").slice(-4)}`;
}

/** Identity of a payout destination: same bank account, or same mobile money number on the same
 * network (last 9 digits, so 0977..., 260977... and +260977... match). */
export function recipientKey(r: PayoutRecipient): string {
  const id =
    r.type === "bank"
      ? `${r.bank_code ?? ""}|${r.account_number ?? ""}`
      : `${r.provider ?? ""}|${(r.phone_number ?? "").replace(/\D/g, "").slice(-9)}`;
  return `${r.type}|${id}`;
}

/** One entry per real destination. Default wins if any copy is the default, otherwise the oldest. */
export function dedupeRecipients(list: PayoutRecipient[]): PayoutRecipient[] {
  const map = new Map<string, PayoutRecipient>();
  for (const r of list) {
    const k = recipientKey(r);
    const existing = map.get(k);
    if (!existing || (r.is_default && !existing.is_default)) map.set(k, r);
  }
  return [...map.values()];
}

/** The full "withdraw money" state machine — idle -> confirm (pick a recipient) -> email-OTP
 * (request/verify-withdrawal-otp) -> sending -> success/error, polling checkPayoutStatus once the
 * transfer is underway. Shared between Settings' inline "Available to withdraw" block and the
 * dedicated Payouts page so the two surfaces can't drift on what is, deliberately, the actual
 * money-movement authorization path — see request/verify-withdrawal-otp's file comments. Each
 * caller owns its own presentation; this hook owns nothing about layout. */
export function useWithdrawFlow(rawRecipients: PayoutRecipient[]) {
  const recipients = useMemo(() => dedupeRecipients(rawRecipients), [rawRecipients]);
  const { payout, lastPayout } = usePayoutSummary();
  const [step, setStep] = useState<WithdrawStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [result, setResult] = useState<SendPayoutResult | null>(null);
  const [stillProcessing, setStillProcessing] = useState(false);
  const pollTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    },
    []
  );

  const selectedRecipient = recipients.find((r) => r.id === recipientId) ?? recipients.find((r) => r.is_default) ?? recipients[0];

  const lastSuccessfulDate =
    lastPayout && lastPayout.status === "successful"
      ? new Date(lastPayout.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "No payouts yet";

  const poll = (payoutId: string, attempt: number) => {
    checkPayoutStatus(payoutId)
      .then(({ status, failureReason }) => {
        if (status === "successful") {
          setStep("success");
          return;
        }
        if (status === "failed") {
          setError(failureReason ?? "Transfer failed.");
          setStep("error");
          return;
        }
        if (attempt >= 20) {
          // Still processing after ~60s — Lenco/the webhook will settle it eventually; don't leave
          // the panel spinning forever, just stop polling and let whichever surface it's on pick it
          // up later. It is NOT confirmed sent, so flag it as still processing.
          setStillProcessing(true);
          setStep("success");
          return;
        }
        pollTimer.current = window.setTimeout(() => poll(payoutId, attempt + 1), 3000);
      })
      .catch(() => {
        pollTimer.current = window.setTimeout(() => poll(payoutId, attempt + 1), 3000);
      });
  };

  const startConfirmation = async () => {
    if (!payout?.propertyId) return;
    setStep("otp-sending");
    setError(null);
    setDevCode(null);
    try {
      const { maskedEmail: masked, devCode: dev } = await requestWithdrawalOtp(payout.propertyId);
      setMaskedEmail(masked);
      setDevCode(dev ?? null);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send a confirmation code.");
      setStep("error");
    }
  };

  const submit = async () => {
    if (!payout?.propertyId || !payout.rawAmount || otpCode.trim().length !== 6 || !selectedRecipient) return;
    setStep("sending");
    setError(null);
    setStillProcessing(false);
    try {
      const { confirmationToken } = await verifyWithdrawalOtp(payout.propertyId, otpCode.trim());
      const sent = await sendPayout(payout.propertyId, payout.rawAmount, confirmationToken, selectedRecipient.id);
      setResult(sent);
      poll(sent.payoutId, 0);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        !raw || raw === "Failed to send payout."
          ? "We could not confirm whether the transfer went through. Do not retry yet. Check your payout history in a few minutes."
          : raw
      );
      setStep("error");
    }
  };

  const reset = () => {
    setStep("idle");
    setError(null);
    setOtpCode("");
    setResult(null);
    setStillProcessing(false);
  };

  return {
    payout,
    step,
    setStep,
    error,
    recipientId,
    setRecipientId,
    selectedRecipient,
    maskedEmail,
    devCode,
    otpCode,
    setOtpCode,
    lastSuccessfulDate,
    startConfirmation,
    submit,
    reset,
    /** The actual transfer outcome once `submit` resolves — amount/feeAmount/netAmount, itemized
     * for display; never assume it matches what was requested (see sendPayout's comment). */
    result,
    /** True when polling gave up while the transfer was still processing; it is not confirmed sent. */
    stillProcessing,
  };
}
