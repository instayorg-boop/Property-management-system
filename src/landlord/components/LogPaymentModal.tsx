import { useMemo, useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import Modal from "./Modal";
import Button from "./Button";
import DatePicker from "./DatePicker";
import Select from "./Select";
import type { LedgerRow } from "../../lib/tenants";

// How much a tap of +/- moves the amount — coarse enough to be useful for rent-sized figures
// without needing dozens of taps, fine enough not to overshoot small corrections.
const AMOUNT_STEP = 50;

export type LoggedPayment = { amount: number; method: "mobile" | "cash"; label: string; date: string };

const CUSTOM = "__custom__";

// A note typed into the modal gets folded onto the label as "<label> (<note>)" so it survives on
// the ledger row — strip that back off to compare a logged entry against a plain month label.
function baseLabelOf(label: string) {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** "September Rent 2026" style labels running from the current month through December of *this*
 * year only — no past months (nothing to backdate into), no rollover into next year. */
function monthOptions() {
  const now = new Date();
  const monthsLeftThisYear = 12 - now.getMonth();
  return Array.from({ length: monthsLeftThisYear }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { key: d.toLocaleDateString("en-US", { month: "long" }), label: `${d.toLocaleDateString("en-US", { month: "long" })} Rent ${d.getFullYear()}` };
  });
}

export default function LogPaymentModal({
  tenantName,
  room,
  outstanding,
  rentAmount,
  ledger,
  onClose,
  onConfirm,
}: {
  tenantName: string;
  room: string;
  outstanding: number;
  /** Full monthly rent — what a not-yet-touched future month owes in full. */
  rentAmount: number;
  /** This tenant's payment history — used to hide months that are already fully paid off (so the
   * same month can't be logged twice) and to work out what's left owing on a partially-paid one. */
  ledger: LedgerRow[];
  onClose: () => void;
  /** One array entry per month settled — a single-month payment is a one-item array, an advance
   * payment covering several months at once comes through as several. */
  onConfirm: (payments: LoggedPayment[]) => void;
}) {
  // A month is done once any entry logged against it settled the balance in full — exclude it so
  // it can't be selected and paid again. Earlier partial entries for the same month don't exclude
  // it; only the entry that finally clears it does.
  const settledLabels = useMemo(
    () => new Set(ledger.filter((e) => e.status === "paid").map((e) => baseLabelOf(e.label))),
    [ledger]
  );
  // Only the nearest not-yet-settled month is ever independently selectable — a tenant can't skip
  // ahead and log a future month while this one still has a balance. Paying several months at once
  // is instead handled by the "months to pay" stepper below, which always fills forward from here.
  const options = useMemo(() => monthOptions().filter((o) => !settledLabels.has(o.label)), [settledLabels]);
  const currentLabel = options[0]?.label;
  function remainingFor(label: string) {
    if (label === currentLabel) return outstanding || rentAmount;
    // A "paid" entry's `amount` is the total that was due; a "partial" one's `paidAmount` is what
    // was actually paid toward it (see logPayment) — sum whichever applies to get what's been
    // collected against this label so far.
    const loggedSoFar = ledger
      .filter((e) => baseLabelOf(e.label) === label)
      .reduce((sum, e) => sum + (e.status === "paid" ? e.amount : e.paidAmount ?? 0), 0);
    return Math.max(0, rentAmount - loggedSoFar);
  }

  const [amount, setAmount] = useState(String(remainingFor(currentLabel ?? "") || ""));
  const [method, setMethod] = useState<"mobile" | "cash">("mobile");
  const [labelChoice, setLabelChoice] = useState(currentLabel ?? CUSTOM);
  const [customLabel, setCustomLabel] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  // How many consecutive months (starting at the current one) this single payment covers — 1 is
  // the ordinary case, >1 is paying ahead of schedule in one go instead of one log per month.
  const [monthsToPay, setMonthsToPay] = useState(1);

  const isMultiMonth = labelChoice === currentLabel && monthsToPay > 1;
  const coveredMonths = isMultiMonth ? options.slice(0, monthsToPay) : [];
  const multiMonthTotal = coveredMonths.reduce((sum, o) => sum + remainingFor(o.label), 0);

  const parsedAmount = isMultiMonth ? multiMonthTotal : Number(amount);
  const baseLabel = labelChoice === CUSTOM ? customLabel.trim() : labelChoice;
  // No separate note field on a ledger entry — folded into the label so it's still visible on the
  // payment-history row rather than silently dropped.
  const label = note.trim() ? `${baseLabel} (${note.trim()})` : baseLabel;
  // Manual payments shouldn't be logged for more than what's actually owed — an amount above
  // that would need to come from adjusting the rent/fees themselves, not a payment entry. Doesn't
  // apply to the multi-month bundle, whose total is computed rather than typed in.
  const cap = labelChoice === CUSTOM ? outstanding : remainingFor(labelChoice);
  const exceedsOutstanding = !isMultiMonth && cap > 0 && parsedAmount > cap;
  const canConfirm =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    baseLabel.length > 0 &&
    !exceedsOutstanding &&
    (!isMultiMonth || coveredMonths.length === monthsToPay);
  const selectedMonthName = options.find((o) => o.label === labelChoice)?.key;
  const buttonLabel = isMultiMonth
    ? `Log ${monthsToPay} months in advance (${coveredMonths[0]?.key} – ${coveredMonths[coveredMonths.length - 1]?.key})`
    : selectedMonthName
      ? `Log payment for ${selectedMonthName}`
      : "Confirm payment";

  function handleConfirm() {
    if (isMultiMonth) {
      onConfirm(coveredMonths.map((o) => ({ amount: remainingFor(o.label), method, label: o.label, date })));
      return;
    }
    onConfirm([{ amount: parsedAmount, method, label, date }]);
  }

  return (
    <Modal
      onClose={onClose}
      title="Log Manual Payment"
      description={
        <span>
          Log a payment that was collected outside the platform. For{" "}
          <strong>{tenantName}</strong>
          {room ? <> - <strong>{room}</strong>.</> : ""}
        </span>
      }
 
      footer={
        <Button variant="primary" disabled={!canConfirm} onClick={handleConfirm} className="w-full py-3">
          {buttonLabel}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Amount (K)</label>
          {isMultiMonth ? (
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-center text-base font-semibold text-ink">{multiMonthTotal.toLocaleString()}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {coveredMonths.map((o) => (
                  <li key={o.label} className="flex items-center justify-between">
                    <span>{o.key}</span>
                    <span>{remainingFor(o.label).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="flex items-stretch overflow-hidden rounded-lg bg-mist">
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.max(0, (Number(amount) || 0) - AMOUNT_STEP)))}
                  aria-label="Decrease amount"
                  className="flex w-11 shrink-0 items-center justify-center text-muted transition-colors hover:bg-line/40 hover:text-ink active:scale-95"
                >
                  <Minus size={16} weight="bold" />
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-transparent py-2.5 text-center text-base font-semibold text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.min(cap || Infinity, (Number(amount) || 0) + AMOUNT_STEP)))}
                  aria-label="Increase amount"
                  className="flex w-11 shrink-0 items-center justify-center text-muted transition-colors hover:bg-line/40 hover:text-ink active:scale-95"
                >
                  <Plus size={16} weight="bold" />
                </button>
              </div>
              {exceedsOutstanding && (
                <p className="mt-1.5 text-xs text-red-500">
                  Amount can't exceed the {cap.toLocaleString()} left owing for {selectedMonthName ?? "this"}.
                </p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            {/* Only the current unsettled month (plus "Other") is directly selectable — a tenant
                can't skip ahead to a later month while this one still owes. Paying several months
                at once is the "months to pay" stepper below, not a different month choice. */}
            <label className="mb-1.5 block text-xs font-medium text-muted">What's this for?</label>
            <Select
              value={labelChoice}
              onChange={(v) => {
                setLabelChoice(v);
                setMonthsToPay(1);
                if (v !== CUSTOM) setAmount(String(remainingFor(v) || ""));
              }}
              options={[
                ...(currentLabel ? [{ value: currentLabel, label: currentLabel }] : []),
                { value: CUSTOM, label: "Other…" },
              ]}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Date paid</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
        </div>
        {labelChoice === currentLabel && options.length > 1 && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Months to pay (advance)</label>
            <div className="flex items-stretch overflow-hidden rounded-lg bg-mist">
              <button
                type="button"
                onClick={() => setMonthsToPay((n) => Math.max(1, n - 1))}
                aria-label="Fewer months"
                className="flex w-11 shrink-0 items-center justify-center text-muted transition-colors hover:bg-line/40 hover:text-ink active:scale-95"
              >
                <Minus size={16} weight="bold" />
              </button>
              <p className="flex w-full items-center justify-center py-2.5 text-sm font-semibold text-ink">
                {monthsToPay} {monthsToPay === 1 ? "month" : "months"}
              </p>
              <button
                type="button"
                onClick={() => setMonthsToPay((n) => Math.min(options.length, n + 1))}
                aria-label="More months"
                className="flex w-11 shrink-0 items-center justify-center text-muted transition-colors hover:bg-line/40 hover:text-ink active:scale-95"
              >
                <Plus size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}
        {labelChoice === CUSTOM && (
          <input
            autoFocus
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="e.g. Partial month rent, deposit top-up"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Method</label>
          <div className="flex gap-2 items-center">
            {(["mobile", "cash"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  method === m ? "border-brand bg-brand-soft text-brand" : "border-line text-muted bg-mist"
                }`}
              >
                {m === "mobile" ? "Mobile money" : "Cash"}
              </button>
            ))}
          </div>
        </div>

        {!isMultiMonth && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid in cash, dropped off by proxy"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
