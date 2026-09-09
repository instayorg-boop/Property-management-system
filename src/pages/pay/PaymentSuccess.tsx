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
      <div className="pay-step flex flex-col items-center py-4 text-center print:hidden">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle size={32} weight="fill" />
        </div>
        <p className="mt-4 font-display text-lg font-semibold tracking-tight text-[#0d253d]">Payment successful</p>
        <p className="mt-1 text-sm text-[#64748d]">
          {amount ? formatCurrency(amount) : "Your payment"} received{tenant ? ` for ${tenant.name}` : ""}.
        </p>
        <p className="mt-0.5 text-xs text-[#64748d]">
          {paidAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          {methodLabel ? ` · ${methodLabel}` : ""}
        </p>

        <div className="mt-6 w-full space-y-2">
          <button
            type="button"
            onClick={() => setShowReceipt((v) => !v)}
            className="block w-full rounded-full bg-[#533afd] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4434d4] active:bg-[#2e2b8c]"
          >
            {showReceipt ? "Hide receipt" : "View receipt"}
          </button>
          <Link
            to={`/pay/${propertySlug}/${tenantId}`}
            className="block w-full rounded-full border border-[#e3e8ee] py-2.5 text-sm font-medium text-[#0d253d] transition-colors hover:bg-[#f6f9fc]"
          >
            View my balance
          </Link>
          <Link
            to={`/pay/${propertySlug}/${tenantId}/report`}
            className="flex items-center justify-center gap-1.5 py-1 text-sm text-[#64748d] hover:text-[#0d253d]"
          >
            <Wrench size={14} weight="duotone" />
            Report a maintenance issue
          </Link>
          <p className="text-xs text-[#64748d]">You can close this page now.</p>
        </div>
      </div>

      {showReceipt && (
        <div className="pay-step mt-2 rounded-lg border border-[#e3e8ee] bg-[#f6f9fc] p-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-semibold tracking-tight text-[#0d253d]">Payment receipt</p>
            <span className="text-[11px] text-[#64748d]">{reference}</span>
          </div>
          <div className="mt-3 divide-y divide-[#e3e8ee] rounded-lg border border-[#e3e8ee] bg-white">
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
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-[#e3e8ee] py-2.5 text-sm font-medium text-[#0d253d] transition-colors hover:bg-white print:hidden"
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
      <span className="text-[#64748d]">{label}</span>
      <span className={emphasis ? "font-semibold text-[#0d253d]" : "text-[#0d253d]"}>{value}</span>
    </div>
  );
}
