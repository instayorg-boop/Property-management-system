import { useEffect, useRef, useState } from "react";
import { usePayoutSummary } from "./usePayoutSummary";
import {
  sendPayout,
  checkPayoutStatus,
  requestWithdrawalOtp,
  verifyWithdrawalOtp,
  type PayoutRecipient,
} from "../lib/payoutApi";

export type WithdrawStep = "idle" | "confirm" | "otp-sending" | "otp" | "sending" | "success" | "error";

export function recipientLabel(r: PayoutRecipient): string {
  if (r.type === "mobile-money") return `${(r.provider ?? "").toUpperCase()} •••• ${(r.phone_number ?? "").slice(-4)}`;
  return `${r.account_name ?? "Bank"} •••• ${(r.account_number ?? "").slice(-4)}`;
}

/** The full "withdraw money" state machine — idle -> confirm (pick a recipient) -> email-OTP
 * (request/verify-withdrawal-otp) -> sending -> success/error, polling checkPayoutStatus once the
 * transfer is underway. Shared between Settings' inline "Available to withdraw" block and the
 * dedicated Payouts page so the two surfaces can't drift on what is, deliberately, the actual
 * money-movement authorization path — see request/verify-withdrawal-otp's file comments. Each
 * caller owns its own presentation; this hook owns nothing about layout. */
export function useWithdrawFlow(recipients: PayoutRecipient[]) {
  const { payout, lastPayout } = usePayoutSummary();
  const [step, setStep] = useState<WithdrawStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
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
          // up later.
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
    try {
      const { confirmationToken } = await verifyWithdrawalOtp(payout.propertyId, otpCode.trim());
      const { payoutId } = await sendPayout(payout.propertyId, payout.rawAmount, confirmationToken, selectedRecipient.id);
      poll(payoutId, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the transfer.");
      setStep("error");
    }
  };

  const reset = () => {
    setStep("idle");
    setError(null);
    setOtpCode("");
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
  };
}
