import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { CaretLeft, Wrench, DeviceMobile, CreditCard, CaretRight } from "@phosphor-icons/react";
import { formatCurrency } from "../../landlord/TenantsContext";
import { getPortalProperty, getPortalTenant, getPortalLedger, logPortalPayment, type PortalTenant, type PortalLedgerRow } from "../../lib/payPortal";
import PayShell, { type PayStep } from "./PayShell";

const statusStyle: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};
const statusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", unpaid: "Unpaid", partial: "Partial" };

type Method = "mobile" | "card";
type FlowStep = "review" | "method" | "pay" | "processing";
const PROVIDERS = ["MTN", "Airtel", "Zamtel"] as const;

export default function TenantBalance() {
  const { propertySlug, tenantId } = useParams();
  const navigate = useNavigate();
  const [propertyName, setPropertyName] = useState("");
  const [tenant, setTenant] = useState<PortalTenant | null | undefined>(undefined);
  const [ledger, setLedger] = useState<PortalLedgerRow[]>([]);

  const [flowStep, setFlowStep] = useState<FlowStep>("review");
  const [method, setMethod] = useState<Method | null>(null);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("MTN");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  useEffect(() => {
    if (!propertySlug || !tenantId) return;
    let cancelled = false;
    (async () => {
      const [property, t] = await Promise.all([getPortalProperty(propertySlug), getPortalTenant(propertySlug, tenantId)]);
      if (cancelled) return;
      setPropertyName(property?.name ?? "");
      setTenant(t);
      if (t) setLedger(await getPortalLedger(t.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [propertySlug, tenantId]);

  if (tenant === undefined) return <PayShell propertyName={propertyName}>{null}</PayShell>;

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
  const openLedger = ledger.filter((row) => row.status !== "paid");

  const canPay =
    method === "mobile" ? phone.trim().length >= 9 : cardNumber.replace(/\s/g, "").length >= 12 && cardExpiry.length >= 4 && cardCvv.length >= 3;

  const submitPayment = () => {
    setFlowStep("processing");
    window.setTimeout(() => {
      void logPortalPayment(tenant.id, amountDue).catch((e) => console.error("Failed to log payment", e));
      navigate(`/pay/${propertySlug}/${tenant.id}/success`, {
        state: { amount: amountDue, method, provider: method === "mobile" ? provider : "Card" },
      });
    }, 1600);
  };

  const shellStep: PayStep = flowStep === "review" ? "balance" : flowStep === "method" ? "method" : "pay";

  return (
    <PayShell propertyName={propertyName} step={shellStep}>
      {flowStep === "review" && (
        <>
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

          {!fullyPaid && openLedger.length > 0 && (
            <div className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
              {openLedger.map((row, i) => (
                <div key={i} className="flex items-center justify-between px-3.5 py-2 text-sm">
                  <span className="text-muted">{row.label}</span>
                  <span className="font-medium text-ink">
                    {formatCurrency(row.paidAmount ? row.amount - row.paidAmount : row.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!fullyPaid && (
            <button
              type="button"
              onClick={() => setFlowStep("method")}
              className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
            >
              Continue to pay {formatCurrency(amountDue)}
              <CaretRight size={14} weight="bold" />
            </button>
          )}

          <Link
            to={`/pay/${propertySlug}/${tenant.id}/report`}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            <Wrench size={14} weight="duotone" />
            Report a maintenance issue instead
          </Link>
        </>
      )}

      {flowStep === "method" && (
        <>
          <button
            type="button"
            onClick={() => setFlowStep("review")}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
          >
            <CaretLeft size={12} weight="bold" />
            Back
          </button>

          <p className="mt-3 font-display text-lg font-semibold tracking-tight text-ink">How would you like to pay?</p>
          <p className="mt-1 text-sm text-muted">{formatCurrency(amountDue)} due for {tenant.room}</p>

          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setMethod("mobile");
                setFlowStep("pay");
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-line px-4 py-3.5 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
                <DeviceMobile size={18} weight="fill" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">Mobile money</p>
                <p className="text-xs text-muted">MTN, Airtel or Zamtel</p>
              </div>
              <CaretRight size={14} weight="bold" className="text-muted" />
            </button>

            <button
              type="button"
              onClick={() => {
                setMethod("card");
                setFlowStep("pay");
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-line px-4 py-3.5 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
                <CreditCard size={18} weight="fill" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">Debit / credit card</p>
                <p className="text-xs text-muted">Visa or Mastercard</p>
              </div>
              <CaretRight size={14} weight="bold" className="text-muted" />
            </button>
          </div>
        </>
      )}

      {flowStep === "pay" && method === "mobile" && (
        <>
          <button
            type="button"
            onClick={() => setFlowStep("method")}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
          >
            <CaretLeft size={12} weight="bold" />
            Back
          </button>

          <p className="mt-3 font-display text-lg font-semibold tracking-tight text-ink">Pay with mobile money</p>
          <p className="mt-1 text-sm text-muted">{formatCurrency(amountDue)} due for {tenant.room}</p>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-muted">Network</label>
            <div className="flex gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    provider === p ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-muted">Phone number</label>
            <input
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="e.g. 097 123 4567"
              className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
            />
            <p className="mt-1.5 text-xs text-muted">You'll get a prompt on this number to approve the payment.</p>
          </div>

          <button
            type="button"
            onClick={submitPayment}
            disabled={!canPay}
            className="mt-5 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
          >
            Pay {formatCurrency(amountDue)}
          </button>
        </>
      )}

      {flowStep === "pay" && method === "card" && (
        <>
          <button
            type="button"
            onClick={() => setFlowStep("method")}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
          >
            <CaretLeft size={12} weight="bold" />
            Back
          </button>

          <p className="mt-3 font-display text-lg font-semibold tracking-tight text-ink">Pay with card</p>
          <p className="mt-1 text-sm text-muted">{formatCurrency(amountDue)} due for {tenant.room}</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Card number</label>
              <input
                autoFocus
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                inputMode="numeric"
                placeholder="1234 1234 1234 1234"
                className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-muted">Expiry</label>
                <input
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="MM/YY"
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-muted">CVV</label>
                <input
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value)}
                  inputMode="numeric"
                  placeholder="123"
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={submitPayment}
            disabled={!canPay}
            className="mt-5 w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
          >
            Pay {formatCurrency(amountDue)}
          </button>
        </>
      )}

      {flowStep === "processing" && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-soft border-t-brand" />
          <p className="mt-4 text-sm font-medium text-ink">
            {method === "mobile" ? `Check your phone to approve on ${provider}…` : "Processing your card payment…"}
          </p>
          <p className="mt-1 text-xs text-muted">Don't close this page.</p>
        </div>
      )}
    </PayShell>
  );
}
