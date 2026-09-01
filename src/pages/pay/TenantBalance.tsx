import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { CaretLeft, Wrench } from "@phosphor-icons/react";
import { useTenants, formatCurrency } from "../../landlord/TenantsContext";
import { useSettings } from "../../landlord/SettingsContext";
import PayShell from "./PayShell";

const statusStyle: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};
const statusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

export default function TenantBalance() {
  const { propertySlug, tenantId } = useParams();
  const navigate = useNavigate();
  const { propertyName } = useSettings();
  const { tenants, logPayment } = useTenants();
  const [paying, setPaying] = useState(false);

  const tenant = tenants.find((t) => t.id === tenantId);

  if (!tenant) {
    return (
      <PayShell propertyName={propertyName}>
        <p className="text-sm text-muted">We couldn't find that tenant.</p>
        <Link to={`/pay/${propertySlug}`} className="mt-3 inline-block text-sm font-medium text-brand hover:underline">
          ← Back to search
        </Link>
      </PayShell>
    );
  }

  const amountDue = tenant.owedAmount || tenant.rentAmount;
  const fullyPaid = tenant.status === "paid";

  const pay = () => {
    setPaying(true);
    window.setTimeout(() => {
      logPayment(tenant.id, amountDue);
      navigate(`/pay/${propertySlug}/${tenant.id}/success`, { state: { amount: amountDue } });
    }, 1500);
  };

  return (
    <PayShell propertyName={propertyName}>
      <button
        type="button"
        onClick={() => navigate(`/pay/${propertySlug}`)}
        className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
      >
        <CaretLeft size={12} weight="bold" />
        Not you?
      </button>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-semibold tracking-tight text-ink">{tenant.name}</p>
          <p className="text-xs text-muted">
            {tenant.room} · {tenant.roomType}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[tenant.status]}`}>
          {statusLabel[tenant.status]}
        </span>
      </div>

      <div className="mt-5 rounded-lg bg-mist px-4 py-4 text-center">
        <p className="text-xs text-muted">{fullyPaid ? "You're all paid up" : "Amount due"}</p>
        <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
          {fullyPaid ? formatCurrency(tenant.rentAmount) : formatCurrency(amountDue)}
        </p>
        {tenant.status === "overdue" && tenant.daysOverdue ? (
          <p className="mt-1 text-xs font-medium text-red-600">{tenant.daysOverdue} days overdue</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={pay}
        disabled={paying}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
      >
        {paying ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-paper/40 border-t-paper" />
            Processing…
          </>
        ) : (
          `Pay ${formatCurrency(amountDue)}`
        )}
      </button>

      <Link
        to={`/pay/${propertySlug}/${tenant.id}/report`}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
      >
        <Wrench size={14} weight="duotone" />
        Report a maintenance issue instead
      </Link>
    </PayShell>
  );
}
