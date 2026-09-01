import { useState } from "react";
import Modal from "./Modal";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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
  onConfirm: () => void;
}) {
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<"mobile" | "cash">("mobile");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");

  return (
    <Modal
      onClose={onClose}
      title="Log payment"
      description={`${tenantName} · ${room}`}
      footer={
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          Confirm payment
        </button>
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

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
      </div>
    </Modal>
  );
}
