import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CaretLeft,
  DownloadSimple,
  Wallet,
  CheckCircle,
  WarningCircle,
  ArrowsLeftRight,
  PaperPlaneTilt,
  ShieldCheck,
  LockSimple,
  Laptop as LaptopIcon,
  Coins as CoinsIcon,
  Trash as TrashIcon,
  Bank as BankIcon,
  DeviceMobile as DeviceMobileIcon,
  CaretRight as CaretRightIcon,
  Plus as PlusIconBase,
  type Icon as PhosphorIcon,
  ArrowLeft,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import { useToast } from "../ToastContext";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { SkeletonRow, Skeleton } from "../components/Skeleton";
import Button from "../components/Button";
import BankSelect from "../components/BankSelect";
import { useSettings } from "../SettingsContext";
import { formatCurrency } from "../TenantsContext";
import { useIsOwner } from "../useIsOwner";
import { useWithdrawFlow, recipientLabel, recipientKey, dedupeRecipients } from "../useWithdrawFlow";
import { usePayoutSummary } from "../usePayoutSummary";
import { MOBILE_MONEY_LOGO } from "../../lib/mobileMoneyProviders";
import { supabase } from "../../lib/supabaseClient";
import { edgeFunctionErrorMessage } from "../../lib/functionsError";
import {
  listPayouts,
  listCollections,
  listPayoutRecipients,
  listBanks,
  resolveBankAccount,
  createPayoutRecipient,
  setDefaultPayoutRecipient,
  deletePayoutRecipient,
  resolveMobileMoneyAccount,
  createMobileMoneyRecipient,
  requestWithdrawalOtp,
  verifyWithdrawalOtp,
  type PayoutRecord,
  type PayoutStatus,
  type PayoutRecipient,
  type CollectionRecord,
  type CollectionStatus,
  type Bank,
} from "../../lib/payoutApi";

function PlusIcon() {
  return <PlusIconBase size={14} weight="bold" />;
}

const TRANSFER_STEPS = ["Review", "Verify", "Done"] as const;

// Mirrors lenco-payout/index.ts's FEE_TIERS + ON_DEMAND_MARKUP exactly, so the review step can show
// the real fee the landlord is about to pay instead of a vague "fees may apply" — display only,
// never trusted for the actual charge, which the edge function still computes and enforces itself.
const FEE_TIERS: { upTo: number; fee: number }[] = [
  { upTo: 150, fee: 8.5 },
  { upTo: 300, fee: 10 },
  { upTo: 500, fee: 11 },
  { upTo: 1_000, fee: 12 },
  { upTo: 3_000, fee: 15 },
  { upTo: 5_000, fee: 18 },
  { upTo: 10_000, fee: 20 },
  { upTo: 50_000, fee: 25 },
  { upTo: 100_000_000, fee: 35 },
];
const ON_DEMAND_MARKUP = 5;

function estimateTransferFee(amount: number): number {
  const tier = FEE_TIERS.find((t) => amount <= t.upTo) ?? FEE_TIERS[FEE_TIERS.length - 1];
  return tier.fee + ON_DEMAND_MARKUP;
}

/** Which of the 3 named steps the current useWithdrawFlow `step` maps to — that hook's states are
 * finer-grained (otp-sending vs otp, sending vs success vs error) than what's worth showing the
 * landlord as separate stops on a stepper. */
function stepperIndex(step: ReturnType<typeof useWithdrawFlow>["step"]): number {
  if (step === "otp-sending" || step === "otp") return 1;
  if (step === "sending" || step === "success" || step === "error") return 2;
  return 0;
}

/** Airbnb-checkout-style progress: the current step's own name reads as a small heading (not a
 * caption tucked underneath), a back chevron next to it only where going back actually makes sense
 * (not once a transfer is in flight or done), and a row of thin segments below where completed,
 * active, and upcoming are three visibly different states — not just "filled vs not". */
function TransferStepper({ current, onBack }: { current: number; onBack?: () => void }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="-ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <CaretLeft size={13} weight="bold" />
          </button>
        )}
        <p className="font-display text-sm font-semibold text-ink">{TRANSFER_STEPS[current]}</p>
        <span className="ml-auto text-[11px] font-medium text-muted">
          Step {current + 1} of {TRANSFER_STEPS.length}
        </span>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {TRANSFER_STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i < current ? "bg-emerald-500" : i === current ? "bg-brand" : "bg-line"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** A payout method's avatar — the provider's real logo for mobile money (same brand icons the
 * tenant payment portal shows), initials in a plain circle for bank, matching the "MA / Main /
 * K1.50 / Main" reference card style the landlord pointed to. */
/** Mobile money gets the provider's real logo (MTN/Airtel/Zamtel). Bank has no equivalent — there's
 * no local bank-logo set to draw from — so rather than a generic "MC" initials circle implying a
 * brand mark that doesn't actually mean anything, a bank recipient gets no avatar at all; the name
 * and masked account number already say everything the circle would have. */
function MethodAvatar({ recipient }: { recipient: PayoutRecipient }) {
  if (recipient.type === "mobile-money" && recipient.provider) {
    const logo = MOBILE_MONEY_LOGO[recipient.provider as keyof typeof MOBILE_MONEY_LOGO];
    if (logo) return <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return null;
}

function MethodRow({ recipient, selected, onSelect }: { recipient: PayoutRecipient; selected: boolean; onSelect: () => void }) {
  const isMobile = recipient.type === "mobile-money";
  const providerLabel = MOBILE_PROVIDERS.find((p) => p.value === recipient.provider)?.label ?? (recipient.provider ?? "").toUpperCase();
  const digits = (isMobile ? recipient.phone_number : recipient.account_number) ?? "";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3.5 rounded-lg border p-3.5 text-left transition-colors ${
        selected ? "border-brand bg-brand-soft/50 ring-1 ring-brand" : "border-line bg-paper hover:border-ink/20 hover:bg-mist/40"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected ? "border-brand bg-brand text-white" : "border-line bg-paper"
        }`}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      {isMobile && MethodAvatar({ recipient }) ? (
        MethodAvatar({ recipient })
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
          {isMobile ? <DeviceMobileIcon size={18} weight="duotone" /> : <BankIcon size={18} weight="duotone" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{recipient.account_name ?? (isMobile ? `${providerLabel} mobile money` : "Bank account")}</p>
        <p className="mt-0.5 text-xs text-muted">
          {isMobile ? `${providerLabel} mobile money` : "Bank account"} · ending {digits.slice(-4)}
        </p>
      </div>
      {recipient.is_default && (
        <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-emerald-700">Default</span>
      )}
    </button>
  );
}

/** 6 separate digit boxes instead of one text field with letter-spacing — auto-advances focus as
 * each digit is typed, steps back on Backspace, and accepts a pasted code in one go. */
function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  return (
    <div className="mt-4 flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          value={d}
          onChange={(e) => {
            const char = e.target.value.replace(/\D/g, "").slice(-1);
            const next = value.split("");
            next[i] = char;
            const joined = next.join("").slice(0, 6);
            onChange(joined);
            if (char && i < 5) inputs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (!pasted) return;
            e.preventDefault();
            onChange(pasted);
            inputs.current[Math.min(pasted.length, 5)]?.focus();
          }}
          autoFocus={i === 0}
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          className="h-12 w-11 rounded-lg border border-line bg-mist text-center text-lg font-semibold text-ink outline-none focus:border-brand focus:bg-paper"
        />
      ))}
    </div>
  );
}

const statusFilters: { value: "all" | PayoutStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "successful", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

const statusLabel: Record<PayoutStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  successful: "Completed",
  failed: "Failed",
};
const statusStyle: Record<PayoutStatus, string> = {
  pending: "bg-amber-50 text-amber-600",
  processing: "bg-amber-50 text-amber-600",
  successful: "bg-emerald-50 text-emerald-600",
  failed: "bg-red-50 text-red-600",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Defaults to "successful" (unlike the transfers table's "all") — most of the time a landlord
// checking "did rent come in" wants completed payments, not the stray pending/failed attempts
// mixed in.
const collectionStatusFilters: { value: "all" | CollectionStatus; label: string }[] = [
  { value: "successful", label: "Completed" },
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "pay-offline", label: "Pay offline" },
  { value: "failed", label: "Failed" },
];

const collectionStatusLabel: Record<CollectionStatus, string> = {
  pending: "Pending",
  "pay-offline": "Pay offline",
  successful: "Completed",
  failed: "Failed",
};
const collectionStatusStyle: Record<CollectionStatus, string> = {
  pending: "bg-amber-50 text-amber-600",
  "pay-offline": "bg-amber-50 text-amber-600",
  successful: "bg-emerald-50 text-emerald-600",
  failed: "bg-red-50 text-red-600",
};

/** Same visual language as TenantProfile's stat row — icon + small-caps label, a big value
 * underneath, an optional caption line. Kept local rather than shared since neither page exports
 * its copy. */
function StatCard({
  icon,
  label,
  value,
  valueClassName = "",
  caption,
  wide,
  to,
}: {
  wide?: boolean;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  caption?: string;
  /** Route to navigate to on click, e.g. linking "Collected via payment link" back to the Rent page. */
  to?: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      role={to ? "button" : undefined}
      tabIndex={to ? 0 : undefined}
      onClick={to ? () => navigate(to) : undefined}
      onKeyDown={to ? (e) => (e.key === "Enter" || e.key === " ") && navigate(to) : undefined}
      className={`px-5 py-4 ${wide ? "flex-[1.4]" : "flex-1"} ${to ? "cursor-pointer transition-colors hover:bg-mist/40" : ""}`}
    >
      <p className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold tracking-wide text-muted uppercase">
        {icon}
        {label}
      </p>
      <div className={`font-display mt-2 text-2xl font-bold tracking-tight sm:text-[28px] ${valueClassName || "text-ink"}`}>{value}</div>
      {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
    </div>
  );
}

/** The "Transfer funds" flow — select which payout method to use, an email-OTP confirmation, then
 * the result (success or failure, with a reason) shown right here since a transfer resolves near-
 * instantly. Rendered inline in place of the balance/history view (same pattern BankConnectWizard
 * uses below) rather than a modal — a transfer moving real money reads as more deliberate as its
 * own full page than as a dismissable overlay sitting on top of everything else, and it keeps the
 * whole context (balance, recent transfers) one scroll away instead of hidden behind it. The "Back"
 * control is hidden during "sending" for the same reason the old modal disabled backdrop-close
 * then — a landlord mid-transfer shouldn't be able to navigate away and lose track of it. Shares
 * its state machine with Settings' inline "Available to withdraw" block via useWithdrawFlow; this
 * component only owns this panel's own layout. */
function TransferFundsPanel({
  propertyId,
  recipients,
  onClose,
  onRecipientAdded,
}: {
  propertyId: string;
  recipients: PayoutRecipient[];
  onClose: () => void;
  /** Adding a mobile money number happens right here (AddMobileMoneyRecipient is self-contained —
   * its own form/OTP/saving states), so this is only ever called to refresh the recipients list
   * afterward, never to navigate anywhere. */
  onRecipientAdded: () => void;
}) {
  const {
    payout,
    step,
    setStep,
    error,
    setRecipientId,
    selectedRecipient,
    maskedEmail,
    devCode,
    otpCode,
    setOtpCode,
    startConfirmation,
    submit,
    result,
    stillProcessing,
  } = useWithdrawFlow(recipients);
  // usePayoutSummary's own `payout` is null both while the balance is still loading AND once it's
  // confirmed there's nothing to withdraw — those need different UI (a loading state vs. an actual
  // empty state), so this reads lencoAvailable separately to tell the two apart.
  const { lencoAvailable } = usePayoutSummary();
  const balanceLoading = lencoAvailable === null;

  // The modal always opens straight into method-selection — "idle" is only meaningful for the
  // inline Settings block, which has its own separate "Withdraw" button to get there.
  useEffect(() => {
    if (step === "idle") setStep("confirm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Buttons live in a fixed block below the content, not inline in each step's content, so they
  // don't shift position as the step above them changes height. Each one is named for what happens
  // next, not a generic "Start"/"Continue" — "Confirm and send code" tells you a code is coming,
  // not just that *something* is about to happen.
  const footer = !payout
    ? undefined
    : step === "confirm"
      ? (
          <Button variant="primary" className="w-full py-2.5" disabled={!selectedRecipient} onClick={startConfirmation}>
            Confirm and send code
          </Button>
        )
      : step === "otp" || step === "otp-sending"
        ? (
            <Button
              variant="primary"
              className="w-full py-2.5"
              disabled={otpCode.length !== 6 || step === "otp-sending"}
              onClick={submit}
            >
              Confirm & send
            </Button>
          )
        : step === "success"
          ? (
              <Button variant="secondary" className="w-full" onClick={onClose}>
                Done
              </Button>
            )
          : step === "error"
            ? (
                <div className="flex w-full gap-2">
                  <Button variant="secondary" className="flex-1" onClick={onClose}>
                    Close
                  </Button>
                  <Button variant="primary" className="flex-1" onClick={() => setStep("confirm")}>
                    Try again
                  </Button>
                </div>
              )
            : undefined; // "sending" — nothing to do but wait

  // Hidden once a transfer is actually in flight (same reasoning the old modal's disableBackdropClose
  // covered) — everywhere else, leaving mid-flow is safe (nothing's been sent yet, or it's already
  // resolved), so there's no reason to trap the landlord here.
  const canLeave = step !== "sending";

  return (
    <>
      <PageHeader
        title="Transfer funds"
        description={
          payout
            ? `Send ${payout.amount} to one of your saved payout methods.`
            : balanceLoading
              ? "Checking your available balance…"
              : "Nothing available to transfer yet."
        }
      />

      {canLeave && (
        <div className="px-4 pb-4 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            className="flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink hover:underline"
          >
            <ArrowLeft size={14} weight="bold" />
            Back
          </button>
        </div>
      )}

      {/* Side by side on a wide page — the flow on the left, a persistent amount/fee/destination
          summary on the right (sticky, so it's still visible while scrolling the method list or
          typing a code) — rather than stacking everything into one narrow centered column, which
          left most of a full page's width empty on anything wider than a phone. */}
      <div className={`grid grid-cols-1 gap-6 px-4 pb-10 sm:px-8 ${payout ? "lg:grid-cols-[1fr_320px]" : ""}`}>
        <div className="min-w-0  bg-paper ">
          {payout && <TransferStepper current={stepperIndex(step)} onBack={step === "otp" ? () => setStep("confirm") : undefined} />}

          {/* No fixed min-height here on purpose — the card should size to whatever the current step
              actually needs (a short method list vs. a loading/empty state) rather than always
              reserving the same tall block and leaving empty space underneath. */}
          <div className="mt-5 flex flex-col">
        <AnimatePresence mode="wait">
          {balanceLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-10 text-center"
            >
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
            </motion.div>
          ) : !payout ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-6 py-10 text-center"
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-brand-soft text-brand">
                <Wallet size={22} weight="duotone" />
              </span>
              <p className="mt-4 font-display text-lg font-semibold text-ink">Nothing to transfer yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                We handle reminders and collection for you. Online rent shows up here, ready to send.
              </p>

              <ol className="mx-auto mt-6 grid max-w-xl grid-cols-1 gap-2 text-left sm:grid-cols-3">
                {[
                  { n: 1, title: "We remind tenants", body: "Automatically, when rent is due." },
                  { n: 2, title: "They pay online", body: "Payments land here safely." },
                  { n: 3, title: "You transfer", body: "To your bank or mobile money." },
                ].map((step) => (
                  <li key={step.n} className="rounded-md border border-line bg-paper p-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-mist text-xs font-semibold text-ink">{step.n}</span>
                    <p className="mt-2 text-sm font-semibold text-ink">{step.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{step.body}</p>
                  </li>
                ))}
              </ol>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Back to Online payments
                </Button>
              </div>
            </motion.div>
          ) : step === "sending" ? (
            <motion.div
              key="sending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center text-center"
            >
              <motion.div
                animate={{ x: [0, 6, 0, -6, 0], y: [0, -4, 0, -4, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <PaperPlaneTilt size={40} weight="duotone" className="text-brand" />
              </motion.div>
              <p className="mt-4 font-display text-lg font-semibold text-ink">Your payment is on its way</p>
              <p className="mt-1 text-sm text-muted">Sending {payout.amount}. This only takes a moment.</p>
            </motion.div>
          ) : step === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center text-center"
            >
              <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                <CheckCircle size={40} weight="fill" className="text-emerald-500" />
              </motion.div>
              <p className="mt-4 font-display text-lg font-semibold text-ink">{stillProcessing ? "Transfer processing" : "Transfer sent"}</p>
              {result ? (
                <>
                  <p className="mt-1 text-sm text-muted">
                    {stillProcessing
                      ? "This transfer is still processing. Check your payout history shortly and do not send it again."
                      : `${formatCurrency(result.netAmount)} is on its way, usually within one business day.`}
                  </p>
                  <div className="mt-4 w-full max-w-xs space-y-1.5 rounded-lg border border-line bg-mist/40 px-3 py-2.5 text-left text-xs">
                    <div className="flex items-center justify-between text-muted">
                      <span>Requested</span>
                      <span className="font-medium text-ink">{formatCurrency(payout.rawAmount)}</span>
                    </div>
                    {result.amount !== payout.rawAmount && (
                      <div className="flex items-center justify-between text-muted">
                        <span>Transferred</span>
                        <span className="font-medium text-ink">{formatCurrency(result.amount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-muted">
                      <span>Fee (incl. K5 for instant payout)</span>
                      <span className="font-medium text-ink">{formatCurrency(result.feeAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-line pt-1.5 font-semibold text-ink">
                      <span>You'll receive</span>
                      <span>{formatCurrency(result.netAmount)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">{payout.amount} is on its way, usually within one business day.</p>
              )}
            </motion.div>
          ) : step === "otp" || step === "otp-sending" ? (
            <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
              <div className="flex justify-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <LockSimple size={18} weight="bold" />
                </span>
              </div>
              <p className="font-display mt-3 text-center text-lg font-semibold text-ink">Enter confirmation code</p>
              <p className="mt-1 text-center text-sm text-muted">
                {step === "otp-sending" ? "Sending a code…" : `We emailed a 6-digit code to ${maskedEmail}. It expires in 5 minutes.`}
              </p>
              {import.meta.env.DEV && devCode && (
                <p className="mt-1 text-center text-xs text-amber-600">
                  Dev mode - email isn't connected yet, your code is <span className="font-mono font-semibold">{devCode}</span>.
                </p>
              )}
              <OtpBoxes
                value={otpCode}
                onChange={(v) => {
                  setOtpCode(v);
                  if (v.length === 6) submit();
                }}
                disabled={step === "otp-sending"}
              />
              {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
              <p className="mt-4 text-center text-[11px] text-muted">
                Didn't request this? Close this window. Nothing is sent until the code above is confirmed.
              </p>
            </motion.div>
          ) : step === "error" ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center text-center"
            >
              <WarningCircle size={40} weight="fill" className="text-red-500" />
              <p className="mt-4 font-display text-lg font-semibold text-ink">Transfer failed</p>
              <p className="mt-1 text-sm text-muted">{error ?? "Something went wrong."}</p>
              {/* A failed request never debits anything — Lenco only actually reserves/moves money
                  once it accepts the transfer (step "sending" -> "processing"); a rejection at that
                  point means nothing left your balance. Whether a transfer that later fails AFTER
                  Lenco accepted it gets automatically reversed back to your balance is Lenco's own
                  policy, not something this app controls — check with Lenco if that ever happens
                  and the balance looks off. */}
            </motion.div>
          ) : (
            // step "confirm" — review the amount, pick a destination, see the real fee, then start.
            <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Send to</p>
              {recipients.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line px-4 py-4 text-center">
                  <p className="text-xs text-muted">No payout methods saved yet.</p>
                  <div className="mt-1.5 flex justify-center">
                    <AddMobileMoneyRecipient propertyId={propertyId} existing={recipients} onAdded={onRecipientAdded} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {recipients.map((r) => (
                      <MethodRow
                        key={r.id}
                        recipient={r}
                        selected={(selectedRecipient?.id ?? recipients[0]?.id) === r.id}
                        onSelect={() => setRecipientId(r.id)}
                      />
                    ))}
                  </div>
                  {/* Adding a bank account isn't offered here — there's only ever one, edited (not
                      added to) from Settings > Bank & payouts — so this only covers mobile money,
                      the one payout method type a landlord can actually have several of. Same
                      component Payout methods' modal uses, so it matches that flow exactly rather
                      than reimplementing a second version of it here. */}
                  <div className="mt-3">
                    <AddMobileMoneyRecipient propertyId={propertyId} existing={recipients} onAdded={onRecipientAdded} />
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
          </div>

          {footer && <div className="mt-5 border-t border-line pt-4">{footer}</div>}
        </div>

        {/* Summary sidebar — sticky so the amount/fee/destination stay visible while scrolling a
            long method list or filling in the code, instead of scrolling out of view with the rest
            of the "confirm" step the way it did when this lived inline in a single narrow column. */}
        {payout && (
          <div className="lg:sticky lg:top-5 lg:self-start">
            <div className="rounded-lg border border-line bg-paper px-5 py-5">
              <p className="text-xs font-medium text-muted">Transferring</p>
              <p className="font-display mt-1 text-[28px] leading-none font-bold tracking-tight text-ink">{payout.amount}</p>

              {/* The actual breakdown shown up front, before any irreversible step — the research
                  pattern this follows (review screens that surface fee + resulting balance before
                  submission, not just after) is what separates "trustworthy" transfer flows from
                  ones that spring the real numbers on you at the very end. */}
              {selectedRecipient &&
                (() => {
                  const fee = estimateTransferFee(payout.rawAmount);
                  const net = Math.max(payout.rawAmount - fee, 0);
                  return (
                    <div className="mt-4 space-y-1.5 rounded-lg border border-line bg-mist/40 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between text-muted">
                        <span>To</span>
                        <span className="font-medium text-ink">{recipientLabel(selectedRecipient)}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted">
                        <span>Fee</span>
                        <span className="font-medium text-ink">{formatCurrency(fee)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-line pt-1.5 font-semibold text-ink">
                        <span>They'll receive</span>
                        <span>{formatCurrency(net)}</span>
                      </div>
                    </div>
                  );
                })()}

              <div className="mt-4 flex items-start gap-1.5 text-[11px] text-muted">
                <ShieldCheck size={14} weight="fill" className="mt-0.5 shrink-0 text-brand" />
                <span>
                  Every transfer needs a one-time code sent to your registered email before it can go
                  out - even from a device you've used before.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type AddMobileMoneyStep = "closed" | "form" | "sending" | "confirm" | "otp-sending" | "otp" | "saving";
const MOBILE_PROVIDERS = [
  { value: "mtn", label: "MTN" },
  { value: "airtel", label: "Airtel" },
  { value: "zamtel", label: "Zamtel" },
] as const;

/** Adds a mobile money number as a payout recipient — phone + provider, then Lenco resolves the
 * account holder's name (resolve-mobile-money) so the landlord confirms "is this you?" before it's
 * saved, the same two-step shape the bank flow below already uses (BankSelect + resolveBankAccount
 * -> createPayoutRecipient). */
function AddMobileMoneyRecipient({
  propertyId,
  onAdded,
  autoOpen,
  onAutoOpenHandled,
  onCancel,
  footerEl,
  existing,
  skipCode,
}: {
  propertyId: string;
  onAdded: () => void;
  /** First payout method during setup: no emailed code is asked for (the server allows it only then). */
  skipCode?: boolean;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
  /** Called when the landlord backs out of the form; lets the parent switch views. */
  onCancel?: () => void;
  /** When set, the action buttons render into the modal's pinned footer so every step keeps the same height. */
  footerEl?: HTMLElement | null;
  /** Saved methods, used to refuse a number that is already on file before any code is sent. */
  existing?: PayoutRecipient[];
}) {
  const btn = footerEl ? "" : "flex-1";
  const Actions = ({ children }: { children: ReactNode }) =>
    footerEl ? createPortal(<div className="flex justify-end gap-2.5">{children}</div>, footerEl) : <div className="mt-3 flex gap-2">{children}</div>;
  const { showToast } = useToast();
  const [step, setStep] = useState<AddMobileMoneyStep>("closed");

  useEffect(() => {
    if (autoOpen && step === "closed") {
      setStep("form");
      onAutoOpenHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<(typeof MOBILE_PROVIDERS)[number]["value"]>("mtn");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");

  const reset = () => {
    setStep("closed");
    setPhone("");
    setResolvedName(null);
    setError(null);
    setOtpCode("");
    onCancel?.();
  };

  const resolve = async () => {
    if (phone.trim().length < 9) return;
    const candidate = recipientKey({ type: "mobile-money", provider, phone_number: phone.trim() } as PayoutRecipient);
    if ((existing ?? []).some((r) => recipientKey(r) === candidate)) {
      setError("That number is already saved as a payment method.");
      return;
    }
    setStep("sending");
    setError(null);
    setResolvedName(null);
    try {
      const accountName = await resolveMobileMoneyAccount(phone.trim(), provider);
      setResolvedName(accountName);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resolve that number.");
      setStep("form");
    }
  };

  const startConfirmation = async () => {
    if (!resolvedName) return;
    if (skipCode) {
      setStep("saving");
      setError(null);
      try {
        await createMobileMoneyRecipient({ propertyId, phoneNumber: phone.trim(), provider, accountName: resolvedName });
        setStep("closed");
        setPhone("");
        setResolvedName(null);
        showToast("Mobile money number added", "success");
        onAdded();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save that payout method.");
        setStep("confirm");
      }
      return;
    }
    setStep("otp-sending");
    setError(null);
    try {
      const { maskedEmail: masked, devCode: dev } = await requestWithdrawalOtp(propertyId, "add_recipient");
      setMaskedEmail(masked);
      setDevCode(dev ?? null);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send a confirmation code.");
      setStep("confirm");
    }
  };

  const confirm = async () => {
    if (!resolvedName || otpCode.length !== 6) return;
    setStep("saving");
    setError(null);
    try {
      const { confirmationToken } = await verifyWithdrawalOtp(propertyId, otpCode, "add_recipient");
      await createMobileMoneyRecipient({ propertyId, phoneNumber: phone.trim(), provider, accountName: resolvedName, confirmationToken });
      setStep("closed");
      setPhone("");
      setResolvedName(null);
      setOtpCode("");
      showToast("Mobile money number added", "success");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save that payout method.");
      setStep("otp");
    }
  };

  if (step === "closed" && onCancel) return null;

  if (step === "closed") {
    return (
      <button
        type="button"
        onClick={() => setStep("form")}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-3 text-sm font-medium text-brand transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
      >
        <PlusIcon />
        Add a mobile money number
      </button>
    );
  }

  return (
    <div>
      {step === "confirm" || (skipCode && step === "saving") ? (
        <>
          <p className="text-sm font-medium text-ink">Confirm this is you</p>
          <div className="mt-2 rounded-lg bg-mist px-3 py-2.5">
            <p className="text-xs text-muted">Account holder</p>
            <p className="text-sm font-semibold text-ink">{resolvedName}</p>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <Actions>
            <Button variant="secondary" className={btn} onClick={() => setStep("form")}>
              Back
            </Button>
            <Button variant="primary" className={btn} disabled={step === "saving"} onClick={startConfirmation}>
              {skipCode ? (step === "saving" ? "Saving…" : "Confirm & save") : "Continue"}
            </Button></Actions>
        </>
      ) : step === "otp-sending" || step === "otp" || step === "saving" ? (
        <>
          <p className="text-sm font-medium text-ink">Confirm it's you</p>
          <p className="mt-1 text-xs text-muted">
            {step === "otp-sending" ? "Sending a code…" : `We emailed a 6-digit code to ${maskedEmail}. It expires in 5 minutes.`}
          </p>
          {import.meta.env.DEV && devCode && (
            <p className="mt-1 text-xs text-amber-600">
              Dev mode: email isn't connected yet, your code is <span className="font-mono font-semibold">{devCode}</span>.
            </p>
          )}
          <input
            autoFocus
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && confirm()}
            inputMode="numeric"
            placeholder="000000"
            disabled={step !== "otp"}
            className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-center text-lg font-semibold tracking-[0.3em] text-ink outline-none focus:border-brand"
          />
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <Actions>
            <Button variant="secondary" className={btn} disabled={step === "saving"} onClick={() => setStep("confirm")}>
              Back
            </Button>
            <Button variant="primary" className={btn} disabled={step !== "otp" || otpCode.length !== 6} onClick={confirm}>
              {step === "saving" ? "Saving…" : "Confirm & save"}
            </Button></Actions>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-ink">Add a mobile money number</p>
          <p className="mt-1 text-xs text-muted">We'll look up the account holder's name so you can confirm it before saving.</p>
          <div className="mt-3 space-y-2.5">
            <div className="grid grid-cols-3 gap-2.5">
              {MOBILE_PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProvider(p.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-semibold transition-colors ${
                    provider === p.value ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                  }`}
                >
                  <img src={MOBILE_MONEY_LOGO[p.value]} alt="" className="h-9 w-9 rounded-full object-cover" />
                  {p.label}
                </button>
              ))}
            </div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0977 123 456"
              inputMode="tel"
              className="w-full rounded-lg border border-transparent bg-mist px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <Actions>
            <Button variant="secondary" className={btn} onClick={reset}>
              Cancel
            </Button>
            <Button variant="primary" className={btn} disabled={phone.trim().length < 9 || step === "sending"} onClick={resolve}>
              {step === "sending" ? "Looking up…" : "Continue"}
            </Button></Actions>
        </>
      )}
    </div>
  );
}

/** Every payout recipient saved for this property — bank accounts and mobile money numbers, with
 * per-row "make default" / remove actions, an add-mobile-money entry point, and a way into the bank
 * wizard to edit the connected bank account. A modal rather than an inline page section — this is
 * config you reach for occasionally, not something that should permanently take up room next to the
 * balance and transfer history. disableBackdropClose for the same reason as the Transfer funds
 * modal: an accidental outside click shouldn't drop mid-edit changes, only the X does. */
function PayoutMethodsModal({
  propertyId,
  recipients,
  onChanged,
  onClose,
  onEditBank,
  autoOpenAdd,
  onAutoOpenAddHandled,
}: {
  propertyId: string;
  recipients: PayoutRecipient[];
  onChanged: () => void;
  onClose: () => void;
  onEditBank: () => void;
  /** Skip straight to the "add mobile money number" form instead of its closed/collapsed state —
   * set when the global Create launcher (Header.tsx) sent the user here via ?action=add-recipient. */
  autoOpenAdd?: boolean;
  onAutoOpenAddHandled?: () => void;
}) {
  const { showToast } = useToast();
  const [removing, setRemoving] = useState<PayoutRecipient | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "choose" | "mobile">(autoOpenAdd ? "mobile" : "list");
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoOpenAdd) onAutoOpenAddHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One row per real account: an edited bank account can leave a second record for the same
  // number behind, which used to show up as a duplicate. Default wins if any copy is the default.
  const unique = useMemo(() => dedupeRecipients(recipients), [recipients]);
  const bankRecipients = unique.filter((r) => r.type === "bank");
  const mobileMoneyRecipients = unique.filter((r) => r.type === "mobile-money");

  const makeDefault = async (id: string) => {
    setBusyId(id);
    try {
      await setDefaultPayoutRecipient(propertyId, id);
      showToast("Default payment method updated", "success");
      onChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't update the default method, please try again.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const eyebrow = "mb-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted";
  const defaultBadge = (
    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-emerald-700">Default</span>
  );
  const last4 = (v: string | null) => (v ?? "").slice(-4);

  return (
    <Modal
      onClose={onClose}
      title="Payment methods"
      description="Where your withdrawals are sent."
      icon={<Wallet size={20} weight="duotone" />}
      disableBackdropClose
      maxWidth="max-w-md"
      footer={
        <div ref={setFooterEl} className="flex min-h-[38px] items-center justify-end gap-2.5">
          {view === "list" && (
            <Button variant="primary" onClick={() => setView("choose")} className="gap-1.5">
              <PlusIcon />
              Add payment method
            </Button>
          )}
          {view === "choose" && (
            <Button variant="secondary" onClick={() => setView("list")}>
              Back
            </Button>
          )}
        </div>
      }
    >
      <div className="min-h-[320px]">
      {view === "choose" && (
        <div>
          <p className="text-sm font-semibold text-ink">What would you like to add?</p>
          <div className="mt-3 space-y-2.5">
            <button
              type="button"
              onClick={() => setView("mobile")}
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-paper p-3 text-left transition-colors hover:border-ink/20 hover:bg-mist/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                <DeviceMobileIcon size={20} weight="duotone" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Mobile money number</span>
                <span className="block text-xs text-muted">MTN, Airtel or Zamtel</span>
              </span>
              <CaretRightIcon size={14} className="text-muted" />
            </button>
            <button
              type="button"
              onClick={onEditBank}
              className="flex w-full items-center gap-3 rounded-lg border border-line bg-paper p-3 text-left transition-colors hover:border-ink/20 hover:bg-mist/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                <BankIcon size={20} weight="duotone" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Bank account</span>
                <span className="block text-xs text-muted">
                  {bankRecipients.length > 0 ? "Replace your connected account" : "Connect your account"}
                </span>
              </span>
              <CaretRightIcon size={14} className="text-muted" />
            </button>
          </div>
        </div>
      )}

      {view === "mobile" && (
        <AddMobileMoneyRecipient
          propertyId={propertyId}
          existing={recipients}
          autoOpen
          onAdded={() => {
            onChanged();
            setView("list");
          }}
          onCancel={() => setView("list")}
          footerEl={footerEl}
        />
      )}

      {view === "list" && (
        <div className="space-y-5">
          {unique.length === 0 && <p className="text-sm text-muted">No payment methods yet. Add one to start withdrawing.</p>}

          {bankRecipients.length > 0 && (
            <section>
              <p className={eyebrow}>Bank account</p>
              <div className="space-y-2.5">
                {bankRecipients.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line bg-paper p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                      <BankIcon size={20} weight="duotone" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{r.account_name ?? "Bank account"}</p>
                        {r.is_default && defaultBadge}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">Bank account ending {last4(r.account_number)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!r.is_default && (
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => makeDefault(r.id)}
                          className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-mist"
                        >
                          Make default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onEditBank}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-muted transition-colors hover:bg-mist hover:text-ink"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {mobileMoneyRecipients.length > 0 && (
            <section>
              <p className={eyebrow}>Mobile money</p>
              <div className="space-y-2.5">
                {mobileMoneyRecipients.map((r) => {
                  const providerLabel = MOBILE_PROVIDERS.find((p) => p.value === r.provider)?.label ?? (r.provider ?? "").toUpperCase();
                  return (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg border border-line bg-paper p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                        {MethodAvatar({ recipient: r }) ?? (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mist text-muted">
                            <DeviceMobileIcon size={20} weight="duotone" />
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-ink">{providerLabel} mobile money</p>
                          {r.is_default && defaultBadge}
                        </div>
                        <p className="mt-0.5 text-xs text-muted">Number ending {last4(r.phone_number)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!r.is_default && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => makeDefault(r.id)}
                            className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-mist"
                          >
                            Make default
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="Remove"
                          onClick={() => setRemoving(r)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <TrashIcon size={14} weight="duotone" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
      </div>

      {removing && (
        <Modal
          onClose={() => setRemoving(null)}
          title="Remove this payout method?"
          description={`${recipientLabel(removing)} will no longer be available for withdrawals.`}
          maxWidth="max-w-sm"
          footer={
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button
                variant="dangerSolid"
                onClick={async () => {
                  try {
                    await deletePayoutRecipient(removing.id, propertyId);
                    showToast("Payment method removed", "success");
                    onChanged();
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : "Couldn't remove that method, please try again.", "error");
                  }
                  setRemoving(null);
                }}
              >
                Remove
              </Button>
            </div>
          }
        >
          <p className="text-[13px] leading-relaxed text-muted">You can add it again later from this screen.</p>
        </Modal>
      )}
    </Modal>
  );
}

const onlinePaymentsSteps: { label: string; Icon: PhosphorIcon }[] = [
  { label: "Set up online payments", Icon: LaptopIcon },
  { label: "Add your bank account/mobile money", Icon: Wallet },
  { label: "Accept payments", Icon: CoinsIcon },
];

/** The 3-step bank-connect wizard — shown in place of the balance/history UI until online payments
 * is actually connected, or while editing the connected bank account. Moved here unchanged from
 * Settings' old "Online payments" tab; same Lenco resolve-then-confirm flow, same email-OTP gate on
 * saving a new recipient. */
function BankConnectWizard({
  propertyId,
  editingBank,
  onCancelEdit,
  onConnected,
  onMobileAdded,
  onDone,
}: {
  propertyId: string;
  editingBank: boolean;
  onCancelEdit: () => void;
  onConnected: (bank: Bank, accountNumber: string, accountHolderName: string) => void;
  onMobileAdded: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = useState<"choose" | "bank" | "mobile">(editingBank ? "bank" : "choose");
  const [mobileDone, setMobileDone] = useState(false);
  const { showToast } = useToast();
  const [payoutStep, setPayoutStep] = useState(editingBank ? 1 : 0);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [formBank, setFormBank] = useState<Bank | null>(null);
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formAccountHolderName, setFormAccountHolderName] = useState("");
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Email-OTP confirmation gate on saving a new bank recipient — same "add_recipient" purpose and
  // flow AddMobileMoneyRecipient uses, kept separate here only because this state lives alongside
  // the rest of the bank wizard's own step state.
  const [bankOtpStage, setBankOtpStage] = useState<"idle" | "sending" | "entering">("idle");
  const [bankOtpMaskedEmail, setBankOtpMaskedEmail] = useState<string | null>(null);
  const [bankOtpDevCode, setBankOtpDevCode] = useState<string | null>(null);
  const [bankOtpCode, setBankOtpCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    listBanks()
      .then((rows) => {
        if (!cancelled) setBanks(rows);
      })
      .catch((err) => console.error("Failed to load banks", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveAccount = async (bank: Bank, accountNumber: string) => {
    if (!bank || !accountNumber.trim()) return;
    setResolvingAccount(true);
    setResolveError(null);
    setFormAccountHolderName("");
    try {
      const accountName = await resolveBankAccount(accountNumber, bank.code);
      setFormAccountHolderName(accountName);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Couldn't resolve that account.");
    } finally {
      setResolvingAccount(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <AnimatePresence mode="wait">
        {payoutStep === 0 ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="py-10 text-center"
          >
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">Collect Rent Faster, Securely Online</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Automate rent collection with reminders, digital receipts and apply automatic late fees.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4">
              {onlinePaymentsSteps.map(({ label, Icon }) => (
                <div key={label} className="flex flex-col items-center gap-3">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <Icon size={28} weight="duotone" />
                  </span>
                  <p className="text-xs font-medium text-ink">{label}</p>
                </div>
              ))}
            </div>

            <Button variant="primary" className="mt-8 px-8 py-2.5" onClick={() => setPayoutStep(1)}>
              Set up
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key={payoutStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-md py-10"
          >
            <div className="mb-5 flex items-center gap-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${s <= payoutStep ? "bg-brand" : "bg-line"}`}
                />
              ))}
            </div>
            <p className="text-xs font-medium text-muted">Step {Math.min(payoutStep, 3)} of 3</p>

            {payoutStep === 1 && method === "choose" && (
              <>
                <p className="mt-1 font-display text-lg font-semibold text-ink">Where should your rent be paid out?</p>
                <p className="mt-1 text-sm text-muted">Start with one. You can add more later from Manage.</p>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {([
                    { key: "bank", label: "Bank account", detail: "Paid to your bank", Icon: BankIcon },
                    { key: "mobile", label: "Mobile money", detail: "MTN, Airtel or Zamtel", Icon: DeviceMobileIcon },
                  ] as const).map(({ key, label, detail, Icon }) => (
                    <motion.button
                      key={key}
                      type="button"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setMethod(key)}
                      className="flex flex-col items-start gap-3 rounded-md border border-line p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-soft text-brand"><Icon size={20} /></span>
                      <span>
                        <span className="block text-sm font-semibold text-ink">{label}</span>
                        <span className="block text-xs text-muted">{detail}</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </>
            )}

            {payoutStep === 1 && method === "mobile" && (
              <>
                <p className="mt-1 font-display text-lg font-semibold text-ink">Add your mobile money number</p>
                <div className="mt-4">
                  <AddMobileMoneyRecipient
                    propertyId={propertyId}
                    autoOpen
                    skipCode
                    onAdded={() => {
                      onMobileAdded();
                      setMobileDone(true);
                      setPayoutStep(3);
                    }}
                    onCancel={() => setMethod("choose")}
                  />
                </div>
              </>
            )}

            {payoutStep === 1 && method === "bank" && (
              <>
                {!editingBank && (
                  <button type="button" onClick={() => setMethod("choose")} className="mb-2 text-xs font-semibold text-muted hover:text-ink">
                    Change method
                  </button>
                )}
                <p className="mt-1 font-display text-lg font-semibold text-ink">Add your bank account</p>
                <p className="mt-1 text-sm text-muted">
                  Make sure these details match your bank exactly. Payouts go here automatically.
                </p>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Bank</label>
                    <BankSelect
                      banks={banks}
                      selectedCode={formBank?.code ?? null}
                      onSelect={(bank) => {
                        setFormBank(bank);
                        setResolveError(null);
                        setFormAccountHolderName("");
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Account number</label>
                    <div className="flex gap-2">
                      <input
                        value={formAccountNumber}
                        onChange={(e) => {
                          setFormAccountNumber(e.target.value.replace(/\D/g, ""));
                          setResolveError(null);
                          setFormAccountHolderName("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && formBank && formAccountNumber.trim()) void resolveAccount(formBank, formAccountNumber);
                        }}
                        inputMode="numeric"
                        placeholder="Your full account number"
                        className="flex-1 rounded-lg border border-transparent bg-mist px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/30"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0 px-4"
                        disabled={!formBank || !formAccountNumber.trim() || resolvingAccount}
                        onClick={() => formBank && void resolveAccount(formBank, formAccountNumber)}
                      >
                        {resolvingAccount ? "Checking…" : "Check account"}
                      </Button>
                    </div>
                    {!formBank && formAccountNumber.trim() && (
                      <p className="mt-1 text-xs text-muted">Pick a bank above, then check the account.</p>
                    )}
                  </div>

                  {!resolvingAccount && resolveError && <p className="text-xs text-red-600">{resolveError}</p>}
                  {!resolvingAccount && !resolveError && formAccountHolderName && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <p className="text-xs text-emerald-700">Account holder</p>
                      <p className="mt-0.5 text-sm font-medium text-emerald-800">{formAccountHolderName}</p>
                    </div>
                  )}
                </div>
                <div className="mt-5 flex gap-2">
                  {editingBank && (
                    <Button variant="secondary" className="flex-1 py-2.5" onClick={onCancelEdit}>
                      Cancel
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    className="flex-1 py-2.5"
                    disabled={!formBank || !formAccountNumber.trim() || !formAccountHolderName || resolvingAccount}
                    onClick={() => setPayoutStep(2)}
                  >
                    Continue
                  </Button>
                </div>
              </>
            )}

            {payoutStep === 2 && formBank && bankOtpStage === "idle" && (
              <>
                <p className="mt-1 font-display text-lg font-semibold text-ink">Confirm your details</p>
                <p className="mt-1 text-sm text-muted">Double-check these are correct. This is where every payout will be sent.</p>
                <div className="mt-4 divide-y divide-line rounded-lg border border-line">
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted">Bank name</p>
                    <p className="mt-0.5 text-sm font-medium text-ink">{formBank.name}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted">Account number</p>
                    <p className="mt-0.5 text-sm font-medium text-ink">{formAccountNumber}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-muted">Account holder</p>
                    <p className="mt-0.5 text-sm font-medium text-ink">{formAccountHolderName}</p>
                  </div>
                </div>
                {saveError && <p className="mt-3 text-xs text-red-600">{saveError}</p>}
                <div className="mt-5 flex gap-2">
                  <Button variant="secondary" className="flex-1 py-2.5" onClick={() => setPayoutStep(1)} disabled={savingRecipient}>
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 py-2.5"
                    disabled={savingRecipient}
                    onClick={async () => {
                      setSavingRecipient(true);
                      setSaveError(null);
                      try {
                        if (!editingBank) {
                          // First payout method of the property: no emailed code needed.
                          if (!formBank) return;
                          await createPayoutRecipient({
                            accountNumber: formAccountNumber,
                            bankCode: formBank.code,
                            accountName: formAccountHolderName,
                            propertyId,
                          });
                          showToast("Bank account saved", "success");
                          onConnected(formBank, formAccountNumber, formAccountHolderName);
                          setPayoutStep(3);
                          return;
                        }
                        const { maskedEmail, devCode } = await requestWithdrawalOtp(propertyId, "add_recipient");
                        setBankOtpMaskedEmail(maskedEmail);
                        setBankOtpDevCode(devCode ?? null);
                        setBankOtpStage("entering");
                      } catch (err) {
                        setSaveError(err instanceof Error ? err.message : "Failed to send a confirmation code.");
                      } finally {
                        setSavingRecipient(false);
                      }
                    }}
                  >
                    {savingRecipient ? (editingBank ? "Sending…" : "Saving…") : editingBank ? "Continue" : "Confirm & connect"}
                  </Button>
                </div>
              </>
            )}

            {payoutStep === 2 && formBank && bankOtpStage === "entering" && (
              <>
                <p className="mt-1 font-display text-lg font-semibold text-ink">Confirm it's you</p>
                <p className="mt-1 text-sm text-muted">
                  We emailed a 6-digit code to {bankOtpMaskedEmail}. It expires in 5 minutes.
                </p>
                {import.meta.env.DEV && bankOtpDevCode && (
                  <p className="mt-1 text-xs text-amber-600">
                    Dev mode: email isn't connected yet, your code is <span className="font-mono font-semibold">{bankOtpDevCode}</span>.
                  </p>
                )}
                <input
                  autoFocus
                  value={bankOtpCode}
                  onChange={(e) => setBankOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                  disabled={savingRecipient}
                  className="mt-4 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-center text-lg font-semibold tracking-[0.3em] text-ink outline-none focus:border-brand"
                />
                {saveError && <p className="mt-3 text-xs text-red-600">{saveError}</p>}
                <div className="mt-5 flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 py-2.5"
                    disabled={savingRecipient}
                    onClick={() => {
                      setBankOtpStage("idle");
                      setBankOtpCode("");
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 py-2.5"
                    disabled={savingRecipient || bankOtpCode.length !== 6}
                    onClick={async () => {
                      if (!formBank) return;
                      setSavingRecipient(true);
                      setSaveError(null);
                      try {
                        const { confirmationToken } = await verifyWithdrawalOtp(propertyId, bankOtpCode, "add_recipient");
                        await createPayoutRecipient({
                          accountNumber: formAccountNumber,
                          bankCode: formBank.code,
                          accountName: formAccountHolderName,
                          propertyId,
                          confirmationToken,
                        });
                        setBankOtpStage("idle");
                        setBankOtpCode("");
                        showToast("Bank account saved", "success");
                        onConnected(formBank, formAccountNumber, formAccountHolderName);
                        if (editingBank) {
                          onCancelEdit();
                        } else {
                          setPayoutStep(3);
                        }
                      } catch (err) {
                        setSaveError(err instanceof Error ? err.message : "Failed to save payout details.");
                      } finally {
                        setSavingRecipient(false);
                      }
                    }}
                  >
                    {savingRecipient ? "Saving…" : "Confirm & connect"}
                  </Button>
                </div>
              </>
            )}

            {payoutStep === 3 && (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <CheckCircle size={24} weight="duotone" />
                </span>
                <p className="mt-4 font-display text-lg font-semibold text-ink">You're all set</p>
                <p className="mt-1.5 text-sm text-muted">
                  {mobileDone
                    ? "All rent collected through your payment link will now be paid out to your mobile money number. You can add more methods anytime from Manage."
                    : `All rent collected through your payment link will now be paid out to ${formBank?.name} · •••• ${formAccountNumber.slice(-4)}.`}
                </p>
                <Button variant="primary" className="mt-5 py-2.5" onClick={onDone}>
                  Done
                </Button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The dedicated Payouts hub — balance, a switcher between however many payout methods are on
 * file, the withdraw flow, and full transfer history with filters/export, all on one page in the
 * same stat-row-plus-card language TenantProfile uses. Shows the bank-connect wizard until online
 * payments is actually connected; once connected, also surfaces the saved payout methods
 * (bank + mobile money) so they can be managed without leaving this page. Reachable via the
 * Sidebar's "Online payments" item, the Accounting balance pill, and PayoutDetailDrawer's "View
 * all" link. */

/** Date range + status + format, same shape ReportGenerate.tsx uses for the Reports hub, scoped to
 * whichever history tab was open when "Export" was clicked. The actual file is always built
 * server-side by generate-report from a fresh database read — never from the rows already sitting
 * in this page's state — so an export can't be made to say something different from what the
 * landlord's own account actually shows, no matter what the front end here has been changed to
 * display. */
function ExportHistoryModal({ kind, propertyId, onClose }: { kind: "sent" | "received"; propertyId: string; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(today);
  const [status, setStatus] = useState<string>(kind === "sent" ? "all" : "successful");
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = kind === "sent" ? "Export transfers sent" : "Export payments received";
  const statusOptions = kind === "sent" ? statusFilters : collectionStatusFilters;

  const handleExport = async () => {
    if (!propertyId || !startDate) {
      setError("Pick a start date.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("generate-report", {
        body: {
          report_type: kind === "sent" ? "payouts_sent" : "payments_received",
          format,
          property_id: propertyId,
          date_from: startDate,
          date_to: endDate,
          status: status === "all" ? undefined : status,
        },
      });
      if (invokeError) throw invokeError;
      if (!data?.url) throw new Error("The export didn't come back as expected.");
      const link = document.createElement("a");
      link.href = data.url;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      onClose();
    } catch (e) {
      setError(await edgeFunctionErrorMessage(e, "Couldn't generate that export. Try again."));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal onClose={onClose} title={title} description="Picks exactly what's included, then builds the file on our servers.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted">From</p>
            <DatePicker value={startDate} onChange={setStartDate} className="w-full" placeholder="Start date" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted">To</p>
            <DatePicker value={endDate} onChange={setEndDate} className="w-full" placeholder="End date" />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted">Status</p>
          <Select value={status} onChange={setStatus} options={statusOptions} className="w-full" />
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted">Format</p>
          <div className="flex gap-2">
            {(["pdf", "csv"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  format === f ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <Button className="w-full" onClick={() => void handleExport()} disabled={generating}>
          {generating ? "Generating…" : `Download ${format.toUpperCase()}`}
        </Button>
      </div>
    </Modal>
  );
}

export default function Payouts() {
  const {
    propertyId,
    lencoConnected,
    setLencoConnected,
    setBankName,
    setAccountNumber,
    setAccountHolderName,
  } = useSettings();
  const isOwner = useIsOwner();
  const { payout, lencoAvailable } = usePayoutSummary();

  const [recipients, setRecipients] = useState<PayoutRecipient[]>([]);
  const [historyTab, setHistoryTab] = useState<"sent" | "received">("received");
  const [rows, setRows] = useState<PayoutRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [collectionRows, setCollectionRows] = useState<CollectionRecord[] | null>(null);
  const [lifetimeCollected, setLifetimeCollected] = useState<number | null>(null);
  const [lifetimePaidOut, setLifetimePaidOut] = useState<number | null>(null);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionPage, setCollectionPage] = useState(1);
  const [methodsModalOpen, setMethodsModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  // Keeps the setup wizard on screen for its "You're all set" step after the account is connected.
  const [wizardHold, setWizardHold] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [autoOpenAddRecipient, setAutoOpenAddRecipient] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  // A real route rather than local state — /online-payments/transfer is its own URL, so refreshing
  // mid-transfer or sharing/bookmarking the link lands back on the transfer flow instead of the
  // plain balance view.
  const transferActive = location.pathname === "/online-payments/transfer";

  // Picked up when the global Create launcher (Header.tsx) navigates here with
  // ?action=add-recipient instead of clicking this page's own "Add a payout method" button —
  // cleared immediately after so a refresh or back/forward doesn't reopen the modal.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("action") === "add-recipient") {
      setMethodsModalOpen(true);
      setAutoOpenAddRecipient(true);
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1600);
  };

  const refreshRecipients = () => {
    if (!propertyId) return;
    listPayoutRecipients(propertyId)
      .then((r) => setRecipients(dedupeRecipients(r)))
      .catch((e) => console.error("Failed to load payout recipients", e));
  };

  useEffect(() => {
    if (!propertyId || !isOwner) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refreshRecipients();
  }, [propertyId, isOwner]);

  useEffect(() => {
    if (!propertyId || !isOwner) return;
    let cancelled = false;
    setLoading(true);
    listPayouts(propertyId, {})
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => console.error("Failed to load payout history", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, isOwner]);

  // Lifetime total money received — independent of the history table's own date/status filters,
  // so the stat card keeps showing the all-time figure no matter what the landlord filters below.
  useEffect(() => {
    if (!propertyId || !isOwner) return;
    let cancelled = false;
    listCollections(propertyId, { status: ["successful"] })
      .then((data) => {
        if (!cancelled) setLifetimeCollected(data.filter((r) => !r.isTest).reduce((sum, r) => sum + r.amount, 0));
      })
      .catch((e) => console.error("Failed to load lifetime collections total", e));
    listPayouts(propertyId, { status: ["successful"] })
      .then((data) => {
        if (!cancelled) setLifetimePaidOut(data.reduce((sum, r) => sum + r.amount, 0));
      })
      .catch((e) => console.error("Failed to load lifetime payouts total", e));
    return () => {
      cancelled = true;
    };
  }, [propertyId, isOwner]);

  useEffect(() => {
    if (!propertyId || !isOwner) return;
    let cancelled = false;
    setCollectionsLoading(true);
    listCollections(propertyId, { status: ["successful"] })
      .then((data) => {
        if (!cancelled) setCollectionRows(data);
      })
      .catch((e) => console.error("Failed to load payments received", e))
      .finally(() => {
        if (!cancelled) setCollectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, isOwner]);

  const pageCount = Math.max(1, Math.ceil((rows?.length ?? 0) / pageSize));
  const pageRows = useMemo(() => (rows ?? []).slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  const collectionPageCount = Math.max(1, Math.ceil((collectionRows?.length ?? 0) / pageSize));
  const collectionPageRows = useMemo(
    () => (collectionRows ?? []).slice((collectionPage - 1) * pageSize, collectionPage * pageSize),
    [collectionRows, collectionPage, pageSize]
  );
  if (!isOwner) {
    return (
      <div className="px-4 py-10 text-center sm:px-8">
        <p className="text-sm text-muted">You don't have access to this page.</p>
      </div>
    );
  }

  const wizardActive = propertyId && (!lencoConnected || editingBank || wizardHold);

  if (transferActive && propertyId) {
    return (
      <TransferFundsPanel
        propertyId={propertyId}
        recipients={recipients}
        onClose={() => navigate("/online-payments")}
        onRecipientAdded={refreshRecipients}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Online payments"
        description="Your balance, payout methods, and every transfer to your bank or mobile money."
        actions={
          !wizardActive ? (
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setMethodsModalOpen(true)}>
                Manage
              </Button>
              <Button variant="primary" className="flex-1 gap-1.5 sm:flex-none" onClick={() => navigate("/online-payments/transfer")}>
                <ArrowsLeftRight size={14} weight="bold" />
                Transfer funds
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="space-y-5 px-4 pb-10 sm:px-8">
        {wizardActive ? (
          <BankConnectWizard
            propertyId={propertyId!}
            editingBank={editingBank}
            onCancelEdit={() => setEditingBank(false)}
            onConnected={(bank, accountNumber, accountHolderName) => {
              setBankName(bank.name);
              setAccountNumber(accountNumber);
              setAccountHolderName(accountHolderName);
              if (!editingBank) setWizardHold(true);
              setLencoConnected(true);
              refreshRecipients();
              if (editingBank) flash("Payout details updated");
            }}
            onDone={() => setWizardHold(false)}
            onMobileAdded={() => {
              setWizardHold(true);
              setLencoConnected(true);
              refreshRecipients();
              flash("Payout method added");
            }}
          />
        ) : (
          <>
            {/* Stat row — same language as the Tenant Profile page's top row: big numbers, no
                card-within-a-card, a caption line for context instead of a second metric fighting
                for attention. */}
            <div className="flex flex-wrap divide-x divide-line rounded-lg border border-line bg-paper max-sm:divide-x-0 max-sm:divide-y">
              <StatCard
                icon={<Wallet size={13} weight="bold" />}
                label="Available balance"
                value={payout ? payout.amount : lencoAvailable === null ? <Skeleton className="h-8 w-24" /> : formatCurrency(0)}
                valueClassName="text-emerald-600"
              />
              <StatCard
                wide
                icon={<CoinsIcon size={13} weight="bold" />}
                label="Collected via payment link"
                value={lifetimeCollected === null ? <Skeleton className="h-8 w-24" /> : formatCurrency(lifetimeCollected)}
                to="/rent"
                caption="See who's paid, who hasn't"
              />
              <StatCard
                icon={<PaperPlaneTilt size={13} weight="bold" />}
                label="Total paid out"
                value={lifetimePaidOut === null ? <Skeleton className="h-8 w-24" /> : formatCurrency(lifetimePaidOut)}
                valueClassName="text-red-600"
              />
              <StatCard
                icon={<CheckCircle size={13} weight="bold" />}
                label="Online payments"
                value={lencoConnected ? "Connected" : "Not connected"}
                valueClassName={lencoConnected ? "text-brand" : "text-amber-600"}
              />
            </div>
          </>
        )}

        {/* History — two directions of money movement, kept as separate tabs rather than one
            table: transfers out (to the landlord's bank/mobile money) and payments in (rent
            collected from tenants via the portal) have different columns (recipient vs. tenant)
            and different defaults (this table shows every status; received defaults to
            "Completed" — a landlord checking "did rent come in" wants confirmed payments, not
            every stray pending/failed attempt mixed in). */}
        {!wizardActive && (
        <div className="min-w-0 rounded-lg border border-line bg-paper">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
            <div className="flex items-center gap-1 rounded-lg bg-mist p-1">
              <button
                type="button"
                onClick={() => setHistoryTab("sent")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  historyTab === "sent" ? "border border-line bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                Transfers sent
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab("received")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  historyTab === "received" ? "border border-line bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                Payments received
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setExportModalOpen(true)}>
                <DownloadSimple size={14} weight="bold" />
                Export
              </Button>
            </div>
          </div>

          {historyTab === "sent" ? (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-paper text-[10.5px] text-muted uppercase">
                    <tr>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Date</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Amount</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Method</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Status</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
                    {!loading &&
                      pageRows.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(r.createdAt)}</td>
                          <td className="font-display px-4 py-3 font-medium whitespace-nowrap text-ink">{formatCurrency(r.amount)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">
                            {r.recipient ? (
                              <span className="flex items-center gap-1.5">
                                {r.recipient.type === "mobile-money" && r.recipient.provider && (
                                  <img
                                    src={MOBILE_MONEY_LOGO[r.recipient.provider as keyof typeof MOBILE_MONEY_LOGO]}
                                    alt=""
                                    className="h-4 w-4 shrink-0 rounded-full object-cover"
                                  />
                                )}
                                {recipientLabel(r.recipient as PayoutRecipient)}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${statusStyle[r.status]}`}>
                              {statusLabel[r.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {r.failureReason ??
                              (r.netAmount != null && r.feeAmount != null ? (
                                <span title={r.narration ?? undefined}>
                                  Fee {formatCurrency(r.feeAmount)} · Net {formatCurrency(r.netAmount)}
                                </span>
                              ) : (
                                "-"
                              ))}
                          </td>
                        </tr>
                      ))}
                    {!loading && pageRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10">
                          <div className="flex flex-col items-center justify-center gap-3 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                              <Wallet size={22} weight="duotone" />
                            </span>
                            <p className="text-xs font-semibold text-ink">No transfers match these filters</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards — a scrollable table of five columns doesn't fit a phone; each
                  transfer becomes its own bordered card with the amount/status up front and the
                  method and any fee/failure detail underneath. */}
              <div className="space-y-3 p-3 md:hidden">
                {loading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-2 rounded-xl border border-line p-4">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  ))}
                {!loading &&
                  pageRows.map((r) => (
                    <div key={r.id} className="rounded-xl border border-line bg-paper p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-base font-semibold text-ink">{formatCurrency(r.amount)}</p>
                          <p className="mt-0.5 text-xs text-muted">{formatDate(r.createdAt)}</p>
                        </div>
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${statusStyle[r.status]}`}>
                          {statusLabel[r.status]}
                        </span>
                      </div>
                      {r.recipient && (
                        <div className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                          {r.recipient.type === "mobile-money" && r.recipient.provider && (
                            <img
                              src={MOBILE_MONEY_LOGO[r.recipient.provider as keyof typeof MOBILE_MONEY_LOGO]}
                              alt=""
                              className="h-4 w-4 shrink-0 rounded-full object-cover"
                            />
                          )}
                          {recipientLabel(r.recipient as PayoutRecipient)}
                        </div>
                      )}
                      {(r.failureReason || (r.netAmount != null && r.feeAmount != null)) && (
                        <p className="mt-2 text-xs text-muted">
                          {r.failureReason ?? `Fee ${formatCurrency(r.feeAmount!)} · Net ${formatCurrency(r.netAmount!)}`}
                        </p>
                      )}
                    </div>
                  ))}
                {!loading && pageRows.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                      <Wallet size={22} weight="duotone" />
                    </span>
                    <p className="text-xs font-semibold text-ink">No transfers match these filters</p>
                  </div>
                )}
              </div>
              {!loading && (rows?.length ?? 0) > 0 && (
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  pageSize={pageSize}
                  totalItems={rows?.length ?? 0}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              )}
            </>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-paper text-[10.5px] text-muted uppercase">
                    <tr>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Date</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Tenant</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Amount</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Paid from</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Status</th>
                      <th className="px-4 pt-[11px] pb-2.5 font-bold tracking-[0.11em] whitespace-nowrap">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {collectionsLoading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
                    {!collectionsLoading &&
                      collectionPageRows.map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(r.createdAt)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-ink">{r.tenantName ?? "-"}</td>
                          <td className="font-display px-4 py-3 font-medium whitespace-nowrap text-ink">{formatCurrency(r.amount)}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted">
                            <span className="flex items-center gap-1.5">
                              <img
                                src={MOBILE_MONEY_LOGO[r.operator]}
                                alt=""
                                className="h-4 w-4 shrink-0 rounded-full object-cover"
                              />
                              {r.operator.toUpperCase()} •••• {r.phone.slice(-4)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${collectionStatusStyle[r.status]}`}>
                              {collectionStatusLabel[r.status]}
                            </span>
                            {r.isTest && (
                              <span
                                className="ml-1.5 rounded-md bg-mist px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-muted"
                                title="Simulated from the portal's test mode. No real money moved, so it isn't in your balance."
                              >
                                Test
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {r.failureReason ?? (r.isTest ? "Simulated, not in balance" : "-")}
                          </td>
                        </tr>
                      ))}
                    {!collectionsLoading && collectionPageRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10">
                          <div className="flex flex-col items-center justify-center gap-3 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                              <Wallet size={22} weight="duotone" />
                            </span>
                            <p className="text-xs font-semibold text-ink">No payments match these filters</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 p-3 md:hidden">
                {collectionsLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-2 rounded-xl border border-line p-4">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  ))}
                {!collectionsLoading &&
                  collectionPageRows.map((r) => (
                    <div key={r.id} className="rounded-xl border border-line bg-paper p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-base font-semibold text-ink">{formatCurrency(r.amount)}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {r.tenantName ?? "-"} · {formatDate(r.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${collectionStatusStyle[r.status]}`}>
                            {collectionStatusLabel[r.status]}
                          </span>
                          {r.isTest && (
                            <span className="rounded-md bg-mist px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-muted">
                              Test
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                        <img src={MOBILE_MONEY_LOGO[r.operator]} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
                        {r.operator.toUpperCase()} •••• {r.phone.slice(-4)}
                      </div>
                      {(r.failureReason || r.isTest) && (
                        <p className="mt-2 text-xs text-muted">
                          {r.failureReason ?? "Simulated, not in balance"}
                        </p>
                      )}
                    </div>
                  ))}
                {!collectionsLoading && collectionPageRows.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                      <Wallet size={22} weight="duotone" />
                    </span>
                    <p className="text-xs font-semibold text-ink">No payments match these filters</p>
                  </div>
                )}
              </div>
              {!collectionsLoading && (collectionRows?.length ?? 0) > 0 && (
                <Pagination
                  page={collectionPage}
                  pageCount={collectionPageCount}
                  pageSize={pageSize}
                  totalItems={collectionRows?.length ?? 0}
                  onPageChange={setCollectionPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setCollectionPage(1);
                  }}
                />
              )}
            </>
          )}
        </div>
        )}
      </div>

      {methodsModalOpen && propertyId && (
        <PayoutMethodsModal
          propertyId={propertyId}
          recipients={recipients}
          onChanged={refreshRecipients}
          onClose={() => setMethodsModalOpen(false)}
          onEditBank={() => {
            setMethodsModalOpen(false);
            setEditingBank(true);
          }}
          autoOpenAdd={autoOpenAddRecipient}
          onAutoOpenAddHandled={() => setAutoOpenAddRecipient(false)}
        />
      )}
      {exportModalOpen && propertyId && (
        <ExportHistoryModal kind={historyTab} propertyId={propertyId} onClose={() => setExportModalOpen(false)} />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper shadow-card"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
