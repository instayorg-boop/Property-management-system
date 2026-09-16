import { useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import Modal from "./Modal";
import Button from "./Button";

const CHARGE = "charge";
const CREDIT = "credit";
type Kind = typeof CHARGE | typeof CREDIT;

// Same coarse step LogPaymentModal's amount stepper uses — fine enough for rent-sized figures
// without needing dozens of taps.
const AMOUNT_STEP = 50;

/** Logs an ad-hoc charge (a damage fine, a fee outside the normal rent cycle) or a credit/waiver
 * (a discount, a goodwill adjustment) against a tenant's balance — see TenantsContext.tsx's
 * addAdjustment, the one place this actually gets applied to owedAmount. Distinct from "Log a
 * manual payment": a payment settles something already owed, an adjustment changes what's owed. */
export default function AdjustmentModal({
  tenantName,
  room,
  onClose,
  onConfirm,
}: {
  tenantName: string;
  room: string;
  onClose: () => void;
  onConfirm: (input: { amount: number; label: string }) => void;
}) {
  const [kind, setKind] = useState<Kind>(CHARGE);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");

  const parsedAmount = Number(amount);
  const canConfirm = Number.isFinite(parsedAmount) && parsedAmount > 0 && description.trim().length > 0 && reason.trim().length > 0;

  function handleConfirm() {
    if (!canConfirm) return;
    const signedAmount = kind === CHARGE ? parsedAmount : -parsedAmount;
    // Same convention LogPaymentModal uses for its note field — fold the reason onto the label so
    // it's still visible on the ledger row itself, not a separate field that could get dropped.
    onConfirm({ amount: signedAmount, label: `${description.trim()} (${reason.trim()})` });
  }

  return (
    <Modal
      onClose={onClose}
      title="Add a Charge or Credit"
      description={
        <span>
          For <strong>{tenantName}</strong>
          {room ? (
            <>
              {" "}
              — <strong>{room}</strong>
            </>
          ) : (
            ""
          )}
          .
        </span>
      }
      footer={
        <Button variant="primary" disabled={!canConfirm} onClick={handleConfirm} className="w-full py-3">
          {kind === CHARGE ? "Add charge" : "Apply credit"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind(CHARGE)}
            className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              kind === CHARGE ? "border-red-300 bg-red-50 text-red-600" : "border-line text-muted hover:bg-mist"
            }`}
          >
            Charge (+)
          </button>
          <button
            type="button"
            onClick={() => setKind(CREDIT)}
            className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              kind === CREDIT ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-line text-muted hover:bg-mist"
            }`}
          >
            Credit (−)
          </button>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Amount (K) <span className="text-red-500">*</span>
          </label>
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
              placeholder="0"
              className="w-full bg-transparent py-2.5 text-center text-base font-semibold text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => setAmount(String((Number(amount) || 0) + AMOUNT_STEP))}
              aria-label="Increase amount"
              className="flex w-11 shrink-0 items-center justify-center text-muted transition-colors hover:bg-line/40 hover:text-ink active:scale-95"
            >
              <Plus size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            What's this for? <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === CHARGE ? "e.g. Broken window" : "e.g. Move-in discount"}
            className="w-full rounded-lg border border-line px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Reason (kept on record) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why this charge/credit was applied — stays visible on the tenant's ledger."
            className="w-full resize-none rounded-lg border border-line px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
      </div>
    </Modal>
  );
}
