import SlideOver from "./SlideOver";
import { formatCurrency, type Tenant } from "../TenantsContext";

const ledgerStatusStyle: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};

const ledgerStatusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

export default function TenantPaymentDrawer({
  tenant,
  onClose,
  onLogPayment,
}: {
  tenant: Tenant;
  onClose: () => void;
  onLogPayment: () => void;
}) {
  return (
    <SlideOver
      onClose={onClose}
      title={tenant.name}
      description={`${tenant.room} · ${tenant.roomType}`}
      footer={
        <button
          type="button"
          onClick={onLogPayment}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          Log payment
        </button>
      }
    >
      <p className="text-sm font-medium text-ink">Payment history</p>
      <div className="mt-2 divide-y divide-line rounded-xl border border-line">
        {tenant.ledger.length === 0 && <p className="px-3.5 py-4 text-sm text-muted">No payments recorded yet.</p>}
        {tenant.ledger.map((row, i) => (
          <div key={`${row.label}-${i}`} className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-sm text-ink">{row.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">
                {row.paidAmount !== undefined ? `${formatCurrency(row.paidAmount)} of ${formatCurrency(row.amount)}` : formatCurrency(row.amount)}
              </span>
              {row.status && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ledgerStatusStyle[row.status]}`}>
                  {ledgerStatusLabel[row.status]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {tenant.owedAmount > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-mist px-4 py-3">
          <span className="text-sm font-medium text-ink">Total amount owed</span>
          <span className="font-display text-lg font-semibold text-ink">{formatCurrency(tenant.owedAmount)}</span>
        </div>
      )}
    </SlideOver>
  );
}
