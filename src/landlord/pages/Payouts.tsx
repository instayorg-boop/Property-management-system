import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  CaretLeft,
  DownloadSimple,
  Wallet,
  CheckCircle,
  WarningCircle,
  ArrowsLeftRight,
  PaperPlaneTilt,
  Laptop as LaptopIcon,
  Coins as CoinsIcon,
  Trash as TrashIcon,
  Plus as PlusIconBase,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { SkeletonRow, Skeleton } from "../components/Skeleton";
import Button from "../components/Button";
import BankSelect from "../components/BankSelect";
import { useSettings } from "../SettingsContext";
import { formatCurrency } from "../TenantsContext";
import { useIsOwner } from "../useIsOwner";
import { useWithdrawFlow, recipientLabel } from "../useWithdrawFlow";
import { usePayoutSummary } from "../usePayoutSummary";
import { MOBILE_MONEY_LOGO } from "../../lib/mobileMoneyProviders";
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

/** "Main Account" -> "MA", "K1.50" -> "K1" — first letter of up to the first two words, uppercased.
 * Only used for a bank recipient's avatar; mobile money gets the provider's actual logo instead. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

const TRANSFER_STEPS = ["Select method", "Verify", "Done"] as const;

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
function MethodAvatar({ recipient }: { recipient: PayoutRecipient }) {
  if (recipient.type === "mobile-money" && recipient.provider) {
    const logo = MOBILE_MONEY_LOGO[recipient.provider as keyof typeof MOBILE_MONEY_LOGO];
    if (logo) return <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold text-ink">
      {initials(recipient.account_name || recipient.provider || "?")}
    </span>
  );
}

function MethodRow({ recipient, selected, onSelect }: { recipient: PayoutRecipient; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected ? "border-brand bg-brand-soft" : "border-line bg-paper hover:bg-mist"
      }`}
    >
      <MethodAvatar recipient={recipient} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{recipientLabel(recipient)}</p>
        <p className="text-xs text-muted">{recipient.type === "mobile-money" ? "Mobile money" : "Bank transfer"}</p>
      </div>
      {recipient.is_default && (
        <span className="shrink-0 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink">Default</span>
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

function downloadCsv(filename: string, rows: PayoutRecord[]) {
  const header = ["Date", "Amount", "Method", "Status", "Failure reason"];
  const lines = rows.map((r) =>
    [
      formatDate(r.createdAt),
      r.amount,
      r.recipient ? recipientLabel(r.recipient as PayoutRecipient) : "",
      statusLabel[r.status],
      r.failureReason ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

function downloadCollectionsCsv(filename: string, rows: CollectionRecord[]) {
  const header = ["Date", "Tenant", "Amount", "Operator", "Phone", "Status", "Failure reason"];
  const lines = rows.map((r) =>
    [
      formatDate(r.createdAt),
      r.tenantName ?? "",
      r.amount,
      r.operator.toUpperCase(),
      r.phone,
      collectionStatusLabel[r.status],
      r.failureReason ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Same visual language as TenantProfile's stat row — icon + small-caps label, a big value
 * underneath, an optional caption line. Kept local rather than shared since neither page exports
 * its copy. */
function StatCard({
  icon,
  label,
  value,
  valueClassName = "",
  caption,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  caption?: string;
}) {
  return (
    <div className="flex-1 px-5 py-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {icon}
        {label}
      </p>
      <p className={`font-display mt-2 text-2xl font-bold tracking-tight sm:text-[28px] ${valueClassName || "text-ink"}`}>{value}</p>
      {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
    </div>
  );
}

/** The "Transfer funds" flow — select which payout method to use, an email-OTP confirmation, then
 * the result (success or failure, with a reason) shown right here since a transfer resolves near-
 * instantly. Deliberately can't be dismissed by clicking outside or Escape (Modal's
 * disableBackdropClose) — only the X button closes it, so a landlord mid-transfer can't lose their
 * place to an accidental click. Shares its state machine with Settings' inline "Available to
 * withdraw" block via useWithdrawFlow; this component only owns this modal's own layout. */
function TransferFundsModal({
  recipients,
  onClose,
  onAddMethod,
}: {
  recipients: PayoutRecipient[];
  onClose: () => void;
  onAddMethod: () => void;
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
  } = useWithdrawFlow(recipients);

  // The modal always opens straight into method-selection — "idle" is only meaningful for the
  // inline Settings block, which has its own separate "Withdraw" button to get there.
  useEffect(() => {
    if (step === "idle") setStep("confirm");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Buttons live in the Modal's fixed footer, not inline in each step's content, so they don't
  // shift position as the step above them changes height. Each one is named for what happens
  // next, not a generic "Start"/"Continue" — "Continue to verification" tells you a code is
  // coming, not just that *something* is about to happen.
  const footer = !payout
    ? undefined
    : step === "confirm"
      ? (
          <Button variant="primary" className="w-full py-2.5" disabled={!selectedRecipient} onClick={startConfirmation}>
            Continue to verification
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

  return (
    <Modal onClose={onClose} title="Transfer funds" disableBackdropClose maxWidth="max-w-md" footer={footer}>
      {payout && <TransferStepper current={stepperIndex(step)} onBack={step === "otp" ? () => setStep("confirm") : undefined} />}

      {/* Fixed height across every step, not just whatever that step's content happens to need —
          so the modal doesn't visibly grow/shrink as you move between "pick a method" and "enter a
          code". Steps with less content (sending/success/error) center within it instead of
          sitting flush at the top. */}
      <div className="flex min-h-90 flex-col">
        <AnimatePresence mode="wait">
          {!payout ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                <Wallet size={22} weight="duotone" />
              </span>
              <div>
                <p className="text-xs font-semibold text-ink">Nothing to withdraw yet</p>
                <p className="mt-0.5 text-xs text-muted">Rent paid online through your payment link will show up here.</p>
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
              <p className="mt-1 text-sm text-muted">Sending {payout.amount} — this only takes a moment.</p>
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
              <p className="mt-4 font-display text-lg font-semibold text-ink">Transfer sent</p>
              <p className="mt-1 text-sm text-muted">{payout.amount} is on its way — usually within one business day.</p>
            </motion.div>
          ) : step === "otp" || step === "otp-sending" ? (
            <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
              <p className="font-display text-lg font-semibold text-ink">Enter confirmation code</p>
              <p className="mt-1 text-sm text-muted">
                {step === "otp-sending" ? "Sending a code…" : `We emailed a 6-digit code to ${maskedEmail}. It expires in 5 minutes.`}
              </p>
              {devCode && (
                <p className="mt-1 text-xs text-amber-600">
                  Dev mode — email isn't connected yet, your code is <span className="font-mono font-semibold">{devCode}</span>.
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
            // step "confirm" — select a method, then start.
            <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
              <p className="text-sm text-muted">{payout.amount} ready to transfer. Choose where it goes, then continue.</p>
              <label className="mt-4 mb-1.5 block text-xs font-medium text-muted">Select a method</label>
              {recipients.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line px-4 py-4 text-center">
                  <p className="text-xs text-muted">No payout methods saved yet.</p>
                  <button
                    type="button"
                    onClick={onAddMethod}
                    className="mt-1.5 inline-block text-xs font-medium text-brand hover:underline"
                  >
                    Add a payout method →
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    {recipients.map((r) => (
                      <MethodRow
                        key={r.id}
                        recipient={r}
                        selected={(selectedRecipient?.id ?? recipients[0]?.id) === r.id}
                        onSelect={() => setRecipientId(r.id)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onAddMethod}
                    className="mt-2.5 inline-block text-xs font-medium text-brand hover:underline"
                  >
                    Don't see it? Add a payout method →
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
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
function AddMobileMoneyRecipient({ propertyId, onAdded }: { propertyId: string; onAdded: () => void }) {
  const [step, setStep] = useState<AddMobileMoneyStep>("closed");
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
  };

  const resolve = async () => {
    if (phone.trim().length < 9) return;
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
      reset();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save that payout method.");
      setStep("otp");
    }
  };

  if (step === "closed") {
    return (
      <button
        type="button"
        onClick={() => setStep("form")}
        className="flex items-center gap-1.5 text-sm font-medium text-brand transition active:scale-95 hover:text-ink"
      >
        <PlusIcon />
        Add mobile money number
      </button>
    );
  }

  return (
    <div className="mt-3 max-w-sm rounded-lg border border-line p-4">
      {step === "confirm" ? (
        <>
          <p className="text-sm font-medium text-ink">Confirm this is you</p>
          <div className="mt-2 rounded-lg bg-mist px-3 py-2.5">
            <p className="text-xs text-muted">Account holder</p>
            <p className="text-sm font-semibold text-ink">{resolvedName}</p>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setStep("form")}>
              Back
            </Button>
            <Button variant="primary" className="flex-1" onClick={startConfirmation}>
              Continue
            </Button>
          </div>
        </>
      ) : step === "otp-sending" || step === "otp" || step === "saving" ? (
        <>
          <p className="text-sm font-medium text-ink">Confirm it's you</p>
          <p className="mt-1 text-xs text-muted">
            {step === "otp-sending" ? "Sending a code…" : `We emailed a 6-digit code to ${maskedEmail}. It expires in 5 minutes.`}
          </p>
          {devCode && (
            <p className="mt-1 text-xs text-amber-600">
              Dev mode — email isn't connected yet, your code is <span className="font-mono font-semibold">{devCode}</span>.
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
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={step === "saving"} onClick={() => setStep("confirm")}>
              Back
            </Button>
            <Button variant="primary" className="flex-1" disabled={step !== "otp" || otpCode.length !== 6} onClick={confirm}>
              {step === "saving" ? "Saving…" : "Confirm & save"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-ink">Add a mobile money number</p>
          <p className="mt-1 text-xs text-muted">We'll look up the account holder's name so you can confirm it before saving.</p>
          <div className="mt-3 space-y-2.5">
            <div className="flex gap-2">
              {MOBILE_PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProvider(p.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    provider === p.value ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0977 123 456"
              inputMode="tel"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={reset}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" disabled={phone.trim().length < 9 || step === "sending"} onClick={resolve}>
              {step === "sending" ? "Looking up…" : "Continue"}
            </Button>
          </div>
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
}: {
  propertyId: string;
  recipients: PayoutRecipient[];
  onChanged: () => void;
  onClose: () => void;
  onEditBank: () => void;
}) {
  const bankRecipients = recipients.filter((r) => r.type === "bank");
  const mobileMoneyRecipients = recipients.filter((r) => r.type === "mobile-money");
  const [removing, setRemoving] = useState<PayoutRecipient | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const makeDefault = async (id: string) => {
    setBusyId(id);
    try {
      await setDefaultPayoutRecipient(propertyId, id);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal onClose={onClose} title="Payment methods" disableBackdropClose maxWidth="max-w-md">
      <p className="text-xs text-muted">
        Where your rent payouts can be sent — your connected bank account and any mobile money numbers you've
        added. Add another one below, or set which one a withdrawal uses by default.
      </p>

      {bankRecipients.length > 0 && (
        <div className="mt-3 divide-y divide-line rounded-lg border border-line">
          {bankRecipients.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <MethodAvatar recipient={r} />
                <div>
                  <p className="text-sm font-medium text-ink">{recipientLabel(r)}</p>
                  <p className="text-[11px] text-muted">{r.is_default ? "Default" : "Available for withdrawals"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onEditBank}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-mist hover:text-ink"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {mobileMoneyRecipients.length > 0 && (
        <div className="mt-3 divide-y divide-line rounded-lg border border-line">
          {mobileMoneyRecipients.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <MethodAvatar recipient={r} />
                <div>
                  <p className="text-sm font-medium text-ink">{recipientLabel(r)}</p>
                  <p className="text-[11px] text-muted">{r.is_default ? "Default" : "Available for withdrawals"}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!r.is_default && (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => makeDefault(r.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-mist hover:text-ink"
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
          ))}
        </div>
      )}

      <div className="mt-3">
        <AddMobileMoneyRecipient propertyId={propertyId} onAdded={onChanged} />
      </div>

      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-paper p-5 shadow-card">
            <p className="text-sm font-medium text-ink">Remove this payout method?</p>
            <p className="mt-1 text-xs text-muted">{recipientLabel(removing)} will no longer be available for withdrawals.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button
                variant="dangerSolid"
                onClick={async () => {
                  await deletePayoutRecipient(removing.id);
                  setRemoving(null);
                  onChanged();
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

const onlinePaymentsSteps: { label: string; Icon: PhosphorIcon }[] = [
  { label: "Set up online payments", Icon: LaptopIcon },
  { label: "Add your bank account", Icon: Wallet },
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
}: {
  propertyId: string;
  editingBank: boolean;
  onCancelEdit: () => void;
  onConnected: (bank: Bank, accountNumber: string, accountHolderName: string) => void;
}) {
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
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">Get payments online!</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Accept rent payments straight to your bank account through your payment link.
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

            {payoutStep === 1 && (
              <>
                <p className="mt-1 font-display text-lg font-semibold text-ink">Add your bank account</p>
                <p className="mt-1 text-sm text-muted">
                  Make sure these details match your bank exactly — payouts go here automatically.
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
                        className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
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
                <p className="mt-1 text-sm text-muted">Double-check these are correct — this is where every payout will be sent.</p>
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
                    {savingRecipient ? "Sending…" : "Continue"}
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
                {bankOtpDevCode && (
                  <p className="mt-1 text-xs text-amber-600">
                    Dev mode — email isn't connected yet, your code is <span className="font-mono font-semibold">{bankOtpDevCode}</span>.
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
                  All rent collected through your payment link will now be paid out to {formBank?.name} · •••• {formAccountNumber.slice(-4)}.
                </p>
                <Button variant="primary" className="mt-5 py-2.5" onClick={() => setPayoutStep(0)}>
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
  const [historyTab, setHistoryTab] = useState<"sent" | "received">("sent");
  const [rows, setRows] = useState<PayoutRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | PayoutStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [collectionRows, setCollectionRows] = useState<CollectionRecord[] | null>(null);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionStatusFilter, setCollectionStatusFilter] = useState<"all" | CollectionStatus>("successful");
  const [collectionPage, setCollectionPage] = useState(1);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [methodsModalOpen, setMethodsModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1600);
  };

  const refreshRecipients = () => {
    if (!propertyId) return;
    listPayoutRecipients(propertyId)
      .then(setRecipients)
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
    listPayouts(propertyId, {
      status: statusFilter === "all" ? undefined : [statusFilter],
      from: fromDate ? new Date(fromDate).toISOString() : undefined,
      to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
    })
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
  }, [propertyId, isOwner, statusFilter, fromDate, toDate]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, fromDate, toDate]);

  useEffect(() => {
    if (!propertyId || !isOwner) return;
    let cancelled = false;
    setCollectionsLoading(true);
    listCollections(propertyId, {
      status: collectionStatusFilter === "all" ? undefined : [collectionStatusFilter],
      from: fromDate ? new Date(fromDate).toISOString() : undefined,
      to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
    })
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
  }, [propertyId, isOwner, collectionStatusFilter, fromDate, toDate]);

  useEffect(() => {
    setCollectionPage(1);
  }, [collectionStatusFilter, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil((rows?.length ?? 0) / pageSize));
  const pageRows = useMemo(() => (rows ?? []).slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  const collectionPageCount = Math.max(1, Math.ceil((collectionRows?.length ?? 0) / pageSize));
  const collectionPageRows = useMemo(
    () => (collectionRows ?? []).slice((collectionPage - 1) * pageSize, collectionPage * pageSize),
    [collectionRows, collectionPage, pageSize]
  );
  const lastPayout = rows?.find((r) => r.status === "successful");

  if (!isOwner) {
    return (
      <div className="px-4 py-10 text-center sm:px-8">
        <p className="text-sm text-muted">You don't have access to this page.</p>
      </div>
    );
  }

  const wizardActive = propertyId && (!lencoConnected || editingBank);

  return (
    <>
      <PageHeader
        title="Online payments"
        description="Your balance, payout methods, and every transfer to your bank or mobile money."
        actions={
          !wizardActive ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setMethodsModalOpen(true)}>
                Manage
              </Button>
              <Button variant="primary" className="gap-1.5" onClick={() => setTransferModalOpen(true)}>
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
              setLencoConnected(true);
              refreshRecipients();
              if (editingBank) flash("Payout details updated");
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
              />
              <StatCard
                icon={<CheckCircle size={13} weight="bold" />}
                label="Online payments"
                value={lencoConnected ? "Connected" : "Not connected"}
                valueClassName={lencoConnected ? "text-emerald-600" : "text-amber-600"}
              />
              <StatCard
                icon={<ArrowLeft size={13} weight="bold" className="rotate-180" />}
                label="Last payout"
                value={lastPayout ? formatDate(lastPayout.createdAt) : "—"}
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
                  historyTab === "sent" ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                Transfers sent
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab("received")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  historyTab === "received" ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                Payments received
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {historyTab === "sent" ? (
                <Select
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as "all" | PayoutStatus)}
                  options={statusFilters}
                  className="w-36"
                />
              ) : (
                <Select
                  value={collectionStatusFilter}
                  onChange={(v) => setCollectionStatusFilter(v as "all" | CollectionStatus)}
                  options={collectionStatusFilters}
                  className="w-36"
                />
              )}
              <DatePicker value={fromDate} onChange={setFromDate} className="w-36 py-1.5! text-xs!" placeholder="From" />
              <span className="text-xs text-muted">to</span>
              <DatePicker value={toDate} onChange={setToDate} className="w-36 py-1.5! text-xs!" placeholder="To" />
              {historyTab === "sent" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  disabled={!rows || rows.length === 0}
                  onClick={() => rows && downloadCsv("payout-history.csv", rows)}
                >
                  <DownloadSimple size={14} weight="bold" />
                  Export
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  disabled={!collectionRows || collectionRows.length === 0}
                  onClick={() => collectionRows && downloadCollectionsCsv("payments-received.csv", collectionRows)}
                >
                  <DownloadSimple size={14} weight="bold" />
                  Export
                </Button>
              )}
            </div>
          </div>

          {historyTab === "sent" ? (
            <>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-paper text-[11px] text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium tracking-wide">Date</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Amount</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Method</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Status</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Details</th>
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
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyle[r.status]}`}>
                            {statusLabel[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted">{r.failureReason ?? "—"}</td>
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
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-paper text-[11px] text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium tracking-wide">Date</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Tenant</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Amount</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Paid from</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Status</th>
                    <th className="px-4 py-3 font-medium tracking-wide">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {collectionsLoading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
                  {!collectionsLoading &&
                    collectionPageRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(r.createdAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-ink">{r.tenantName ?? "—"}</td>
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
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${collectionStatusStyle[r.status]}`}>
                            {collectionStatusLabel[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted">{r.failureReason ?? "—"}</td>
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

      {transferModalOpen && (
        <TransferFundsModal
          recipients={recipients}
          onClose={() => setTransferModalOpen(false)}
          onAddMethod={() => {
            setTransferModalOpen(false);
            setMethodsModalOpen(true);
          }}
        />
      )}
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
        />
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
