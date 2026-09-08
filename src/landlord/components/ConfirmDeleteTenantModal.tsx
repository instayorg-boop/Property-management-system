import Modal from "./Modal";
import type { Tenant } from "../TenantsContext";

export default function ConfirmDeleteTenantModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-sm"
      title="Delete tenant?"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        This will permanently remove <span className="font-medium text-ink">{tenant.name}</span> and their payment history. This
        can't be undone.
      </p>
    </Modal>
  );
}
