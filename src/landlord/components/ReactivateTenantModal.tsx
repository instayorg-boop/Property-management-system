import { useState } from "react";
import Modal from "./Modal";
import DatePicker from "./DatePicker";
import type { Tenant } from "../TenantsContext";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReactivateTenantModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: (newMoveInDate: string) => void;
}) {
  const [moveInDate, setMoveInDate] = useState(todayISO());

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Reactivate tenant"
      description={`Marks ${tenant.name} active again in ${tenant.room}, starting a new tenancy from the date below.`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(new Date(moveInDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper"
          >
            Reactivate
          </button>
        </div>
      }
    >
      <label className="mb-1.5 block text-xs font-medium text-muted">New move-in date</label>
      <DatePicker value={moveInDate} onChange={setMoveInDate} />
    </Modal>
  );
}
