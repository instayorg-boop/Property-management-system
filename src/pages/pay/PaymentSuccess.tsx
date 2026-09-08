import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { CheckCircle, DownloadSimple, Wrench } from "@phosphor-icons/react";
import { formatCurrency } from "../../landlord/TenantsContext";
import { getPortalProperty, getPortalTenant, type PortalTenant } from "../../lib/payPortal";
import PayShell from "./PayShell";

export default function PaymentSuccess() {
  const { propertySlug, tenantId } = useParams();
  const location = useLocation();
  const [propertyName, setPropertyName] = useState("");
  const [tenant, setTenant] = useState<PortalTenant | null>(null);

  useEffect(() => {
    if (!propertySlug || !tenantId) return;
    let cancelled = false;
    (async () => {
      const [property, t] = await Promise.all([getPortalProperty(propertySlug), getPortalTenant(propertySlug, tenantId)]);
      if (cancelled) return;
      setPropertyName(property?.name ?? "");
      setTenant(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertySlug, tenantId]);
  const state = (location.state as { amount?: number; method?: "mobile" | "card"; provider?: string } | null) ?? null;
  const amount = state?.amount;
  const methodLabel = state?.method === "card" ? "Card" : state?.provider ? `${state.provider} mobile money` : undefined;
  const paidAt = useMemo(() => new Date(), []);
  const reference = useMemo(() => `INS-${paidAt.getTime().toString().slice(-8)}`, [paidAt]);

  const [showReceipt, setShowReceipt] = useState(false);

  return (
    <PayShell propertyName={propertyName} step="done">
      <div className="flex flex-col items-center py-4 text-center print:hidden">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle size={32} weight="fill" />
        </div>
        <p className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">Payment successful</p>
        <p className="mt-1 text-sm text-muted">
          {amount ? formatCurrency(amount) : "Your payment"} received{tenant ? ` for ${tenant.name}` : ""}.
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {paidAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          {methodLabel ? ` · ${methodLabel}` : ""}
        </p>

        <div className="mt-6 w-full space-y-2">
          <button
            type="button"
            onClick={() => setShowReceipt((v) => !v)}
            className="block w-full rounded-lg bg-brand py-2.5 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
          >
            {showReceipt ? "Hide receipt" : "View receipt"}
          </button>
          <Link
            to={`/pay/${propertySlug}/${tenantId}`}
            className="block w-full rounded-lg border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            View my balance
          </Link>
          <Link
            to={`/pay/${propertySlug}/${tenantId}/report`}
            className="flex items-center justify-center gap-1.5 py-1 text-sm text-muted hover:text-ink"
          >
            <Wrench size={14} weight="duotone" />
            Report a maintenance issue
          </Link>
          <p className="text-xs text-muted">You can close this page now.</p>
        </div>
      </div>

      {showReceipt && (
        <div className="mt-2 rounded-lg border border-line bg-mist p-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-semibold tracking-tight text-ink">Payment receipt</p>
            <span className="text-[11px] text-muted">{reference}</span>
          </div>
          <div className="mt-3 divide-y divide-line rounded-lg border border-line bg-paper">
            <Row label="Property" value={propertyName} />
            <Row label="Tenant" value={tenant?.name ?? "—"} />
            <Row label="Room" value={tenant?.room ?? "—"} />
            <Row label="Method" value={methodLabel ?? "—"} />
            <Row label="Date" value={paidAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} />
            <Row label="Amount paid" value={amount ? formatCurrency(amount) : "—"} emphasis />
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper print:hidden"
          >
            <DownloadSimple size={14} weight="bold" />
            Download receipt
          </button>
        </div>
      )}
    </PayShell>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={emphasis ? "font-semibold text-ink" : "text-ink"}>{value}</span>
    </div>
  );
}
