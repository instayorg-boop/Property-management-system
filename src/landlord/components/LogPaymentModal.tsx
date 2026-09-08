import { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";

export type LoggedPayment = { amount: number; method: "mobile" | "cash" };

export default function LogPaymentModal({
  tenantName,
  room,
  outstanding,
  onClose,
  onConfirm,
}: {
  tenantName: string;
  room: string;
  outstanding: number;
  onClose: () => void;
  onConfirm: (payment: LoggedPayment) => void;
}) {
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<"mobile" | "cash">("mobile");

  const parsedAmount = Number(amount);
  const canConfirm = Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <Modal
      onClose={onClose}
      title="Log payment"
      description={`${tenantName} · ${room}`}
      footer={
        <Button
          variant="primary"
          disabled={!canConfirm}
          onClick={() => onConfirm({ amount: parsedAmount, method })}
          className="w-full py-3"
        >
          Confirm payment
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Amount (K)</label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Method</label>
          <div className="grid grid-cols-2 gap-2">
            {(["mobile", "cash"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  method === m ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                {m === "mobile" ? "Mobile money" : "Cash"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
