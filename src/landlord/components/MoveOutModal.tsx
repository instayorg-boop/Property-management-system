import { useState } from "react";
import Modal from "./Modal";
import type { DepositStatus, Tenant } from "../TenantsContext";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function MoveOutModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: (details: { moveOutDate: string; depositStatus: DepositStatus; depositResolutionNote: string }) => void;
}) {
  const [moveOutDate, setMoveOutDate] = useState(todayISO());
  const [depositStatus, setDepositStatus] = useState<DepositStatus>("Refunded");
  const [note, setNote] = useState("");

  const options: DepositStatus[] = ["Refunded", "Partially refunded", "Forfeited"];

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-md"
      title="Move out tenant"
      description={`${tenant.name} · ${tenant.room}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const resolutionNote =
                note.trim() ||
                (depositStatus === "Refunded"
                  ? "Refunded in full."
                  : depositStatus === "Forfeited"
                    ? "Forfeited — no reason given."
                    : "Partially refunded — no reason given.");
              onConfirm({ moveOutDate: new Date(moveOutDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), depositStatus, depositResolutionNote: resolutionNote });
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper"
          >
            Confirm move out
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Move-out date</label>
          <input
            type="date"
            value={moveOutDate}
            onChange={(e) => setMoveOutDate(e.target.value)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Deposit outcome</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setDepositStatus(o)}
                className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                  depositStatus === o ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Reason / notes</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={depositStatus === "Refunded" ? "Optional — e.g. no damage, full deposit returned." : "e.g. K200 deducted for cleaning."}
            className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
      </div>
    </Modal>
  );
}
