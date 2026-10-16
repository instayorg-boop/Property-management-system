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
      title="Archive tenant?"
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
            Archive
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        <span className="font-medium text-ink">{tenant.name}</span> will be moved out and archived. Their payment history is kept
        and you can reactivate them later.
      </p>
    </Modal>
  );
}
