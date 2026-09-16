import { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { formatCurrency } from "../TenantsContext";

/** Clears a tenant's live accrued late penalty — see TenantsContext.tsx's waivePenalty, which
 * resets daysOverdue (the penalty is never stored on its own; it's always derived live from that)
 * and logs an audit-only ledger row so the waiver — and why — stays visible in history. */
export default function WaivePenaltyModal({
  tenantName,
  room,
  penaltyAmount,
  daysOverdue,
  onClose,
  onConfirm,
}: {
  tenantName: string;
  room: string;
  penaltyAmount: number;
  daysOverdue: number;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const canConfirm = reason.trim().length > 0;

  return (
    <Modal
      onClose={onClose}
      title="Waive Late Penalty"
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
        <Button variant="primary" disabled={!canConfirm} onClick={() => onConfirm(reason.trim())} className="w-full py-3">
          Waive {formatCurrency(penaltyAmount)} penalty
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-700">{formatCurrency(penaltyAmount)} accrued</p>
          <p className="mt-0.5 text-xs text-amber-700/70">{daysOverdue} days overdue</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Reason (kept on record) <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why this penalty is being waived — stays visible on the tenant's ledger."
            className="w-full resize-none rounded-lg border border-line px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
      </div>
    </Modal>
  );
}
