import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
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
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Modal from "../components/Modal";
import Select from "../components/Select";
import DatePicker from "../components/DatePicker";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { SkeletonRow, Skeleton } from "../components/Skeleton";
import Button from "../components/Button";
import { useSettings } from "../SettingsContext";
import { formatCurrency } from "../TenantsContext";
import { useIsOwner } from "../useIsOwner";
import { useWithdrawFlow, recipientLabel } from "../useWithdrawFlow";
import { usePayoutSummary } from "../usePayoutSummary";
import { MOBILE_MONEY_LOGO } from "../../lib/mobileMoneyProviders";
import { listPayouts, listPayoutRecipients, type PayoutRecord, type PayoutStatus, type PayoutRecipient } from "../../lib/payoutApi";

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
function TransferFundsModal({ recipients, onClose }: { recipients: PayoutRecipient[]; onClose: () => void }) {
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
                  <Link to="/settings/online-payments" className="mt-1.5 inline-block text-xs font-medium text-brand hover:underline">
                    Add a payout method →
                  </Link>
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
                  <Link to="/settings/online-payments" className="mt-2.5 inline-block text-xs font-medium text-brand hover:underline">
                    Don't see it? Add a payout method →
                  </Link>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Modal>
  );
}

/** The dedicated Payouts hub — balance, a switcher between however many payout methods are on
 * file, the withdraw flow, and full transfer history with filters/export, all on one page in the
 * same stat-row-plus-card language TenantProfile uses. Reachable via the Accounting balance pill
 * and PayoutDetailDrawer's "View all" link — deliberately not in Sidebar.tsx, so it stays out of
 * daily nav while still being one click away from where the money actually shows up. */
export default function Payouts() {
  const { propertyId, lencoConnected } = useSettings();
  const isOwner = useIsOwner();
  const { payout, lencoAvailable } = usePayoutSummary();

  const [recipients, setRecipients] = useState<PayoutRecipient[]>([]);
  const [rows, setRows] = useState<PayoutRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | PayoutStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  useEffect(() => {
    if (!propertyId || !isOwner) return;
    listPayoutRecipients(propertyId)
      .then(setRecipients)
      .catch((e) => console.error("Failed to load payout recipients", e));
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

  const pageCount = Math.max(1, Math.ceil((rows?.length ?? 0) / pageSize));
  const pageRows = useMemo(() => (rows ?? []).slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  const lastPayout = rows?.find((r) => r.status === "successful");

  if (!isOwner) {
    return (
      <div className="px-4 py-10 text-center sm:px-8">
        <p className="text-sm text-muted">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Your balance, payout methods, and every transfer to your bank or mobile money."
        actions={
          <Button variant="primary" className="gap-1.5" onClick={() => setTransferModalOpen(true)}>
            <ArrowsLeftRight size={14} weight="bold" />
            Transfer funds
          </Button>
        }
      />

      <div className="space-y-5 px-4 pb-10 sm:px-8">
        <Link to="/accounting" className="flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink hover:underline">
          <ArrowLeft size={14} weight="bold" />
          Back to Accounting
        </Link>

        {/* Stat row — same language as the Tenant Profile page's top row: big numbers, no
            card-within-a-card, a caption line for context instead of a second metric fighting for
            attention. */}
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

        {/* History */}
        <div className="min-w-0 rounded-lg border border-line bg-paper">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
            <p className="font-display text-sm font-bold tracking-tight text-ink">Transfer history</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as "all" | PayoutStatus)}
                options={statusFilters}
                className="w-36"
              />
              <DatePicker value={fromDate} onChange={setFromDate} className="w-36 py-1.5! text-xs!" placeholder="From" />
              <span className="text-xs text-muted">to</span>
              <DatePicker value={toDate} onChange={setToDate} className="w-36 py-1.5! text-xs!" placeholder="To" />
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
            </div>
          </div>

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
                      <p className="text-xs font-semibold text-ink">No payouts match these filters</p>
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
        </div>
      </div>

      {transferModalOpen && <TransferFundsModal recipients={recipients} onClose={() => setTransferModalOpen(false)} />}
    </>
  );
}
