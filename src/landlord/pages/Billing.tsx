import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CreditCard, CheckCircle, WarningCircle, Receipt, ArrowRight } from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import SectionLabel from "../components/SectionLabel";
import Button from "../components/Button";
import Modal from "../components/Modal";
import TierBadge from "../components/TierBadge";
import { Spinner } from "../components/Skeleton";
import { useSettings } from "../SettingsContext";
import { useToast } from "../ToastContext";
import { supabase } from "../../lib/supabaseClient";
import { formatCurrency } from "../TenantsContext";
import { PLAN_TIERS, getPlanTier, tierFromStoredLabel } from "../../lib/plans";
import { MOBILE_MONEY_LOGO } from "../../lib/mobileMoneyProviders";
import { TableCard, DataTable, DataTableHead, DataTableBody, Th, Td, StatusPill, TableEmptyState } from "../components/DataTable";

const OPERATORS = ["mtn", "airtel", "zamtel"] as const;
type Operator = (typeof OPERATORS)[number];
const OPERATOR_LABEL: Record<Operator, string> = { mtn: "MTN MoMo", airtel: "Airtel Money", zamtel: "Zamtel Kwacha" };
const OPERATOR_SHORT: Record<Operator, string> = { mtn: "MTN", airtel: "Airtel", zamtel: "Zamtel" };

// Same prefix table PortalCheckout.tsx uses to read a tenant's network off their number — kept as
// a local copy here (billing's phone input is the landlord's own number, a different payer
// entirely) rather than importing from a portal-specific file.
function detectOperator(phone: string): Operator | null {
  const digits = phone.replace(/\D/g, "").replace(/^260/, "").replace(/^0/, "");
  if (digits.length < 9) return null;
  const prefix = digits.slice(0, 2);
  if (["96", "76", "56"].includes(prefix)) return "mtn";
  if (["97", "77", "57"].includes(prefix)) return "airtel";
  if (["95", "75", "55"].includes(prefix)) return "zamtel";
  return null;
}

type Invoice = {
  id: string;
  period: string;
  amount: number;
  status: "pending" | "paid" | "overdue" | "waived";
  due_date: string;
  paid_at: string | null;
};

function formatDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function statusLabel(status: Invoice["status"]): string {
  if (status === "paid") return "Paid";
  if (status === "overdue") return "Overdue";
  if (status === "waived") return "Waived";
  return "Pending";
}

const STATUS_TONE: Record<Invoice["status"], "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  pending: "neutral",
  overdue: "danger",
  waived: "warning",
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 15;

export default function Billing() {
  const { propertyId, subscriptionPlan, landlordPhone } = useSettings();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const tierId = tierFromStoredLabel(subscriptionPlan);
  const tier = getPlanTier(tierId);

  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [payPhone, setPayPhone] = useState("");
  const [payOperatorOverride, setPayOperatorOverride] = useState<Operator | null>(null);
  const [payOverriding, setPayOverriding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payResult, setPayResult] = useState<"successful" | "failed" | null>(null);
  const pollTimer = useRef<number | null>(null);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [requestedTier, setRequestedTier] = useState<string | null>(null);
  const [upgradeNote, setUpgradeNote] = useState("");
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);

  const loadInvoices = () => {
    if (!propertyId) return;
    supabase
      .from("subscription_invoices")
      .select("id, period, amount, status, due_date, paid_at")
      .eq("property_id", propertyId)
      .order("period", { ascending: false })
      .then(({ data }) => setInvoices((data as Invoice[] | null) ?? []));
  };

  useEffect(() => {
    if (!propertyId) return;
    loadInvoices();
  }, [propertyId]);

  useEffect(() => () => {
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
  }, []);

  const current = invoices?.find((i) => i.status !== "paid") ?? null;
  const history = invoices?.filter((i) => i.id !== current?.id) ?? [];

  const payDetected = detectOperator(payPhone);
  const payOperator = payOperatorOverride ?? payDetected;
  const payPhase: "form" | "waiting" | "success" | "failed" = payResult === "successful" ? "success" : payResult === "failed" ? "failed" : paying ? "waiting" : "form";

  const openPay = () => {
    setPayPhone(landlordPhone || "");
    setPayOperatorOverride(null);
    setPayOverriding(false);
    setPayError(null);
    setPayResult(null);
    setPayOpen(true);
  };

  // Picked up when the subscription reminder SMS links straight here with ?action=pay (same
  // pattern the global Create launcher uses for ?action=add-recipient on Payouts) — so paying
  // the subscription is one tap from the text, not a separate "find the Billing page" step.
  // Cleared immediately after so a refresh or back/forward doesn't reopen the modal, and only
  // fires once the invoice to pay has actually loaded.
  useEffect(() => {
    if (!current) return;
    if (new URLSearchParams(location.search).get("action") === "pay") {
      openPay();
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, current]);

  const poll = (paymentId: string, attempt: number) => {
    pollTimer.current = window.setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke("check-subscription-payment", { body: { paymentId } });
      if (error) return;
      if (data?.status === "successful") {
        setPayResult("successful");
        setPaying(false);
        loadInvoices();
        return;
      }
      if (data?.status === "failed") {
        setPayResult("failed");
        setPayError(data?.failureReason || "That payment didn't go through.");
        setPaying(false);
        return;
      }
      if (attempt < MAX_POLLS) {
        poll(paymentId, attempt + 1);
      } else {
        setPaying(false);
        setPayError("Still waiting on confirmation — check back shortly, or try again.");
        setPayResult("failed");
      }
    }, POLL_INTERVAL_MS);
  };

  const submitPay = async () => {
    if (!current || !payOperator) return;
    setPaying(true);
    setPayError(null);
    const { data, error } = await supabase.functions.invoke("pay-subscription-invoice", {
      body: { invoiceId: current.id, phone: payPhone, operator: payOperator },
    });
    if (error || data?.error) {
      setPaying(false);
      setPayError(data?.error ?? "Couldn't start that payment, please try again.");
      return;
    }
    if (data.status === "successful") {
      setPayResult("successful");
      setPaying(false);
      loadInvoices();
      return;
    }
    if (data.status === "failed") {
      setPayResult("failed");
      setPaying(false);
      setPayError("That payment didn't go through.");
      return;
    }
    poll(data.paymentId, 0);
  };

  const submitUpgradeRequest = async () => {
    if (!propertyId || !requestedTier) return;
    setSubmittingUpgrade(true);
    const { error } = await supabase
      .from("plan_upgrade_requests")
      .insert({ property_id: propertyId, requested_tier: requestedTier, note: upgradeNote || null });
    setSubmittingUpgrade(false);
    if (error) {
      showToast("Couldn't send that request, please try again.", "error");
      return;
    }
    showToast("Request sent — we'll be in touch.", "success");
    setUpgradeOpen(false);
    setRequestedTier(null);
    setUpgradeNote("");
  };

  return (
    <>
      <PageHeader title="Billing" description="Your IPM subscription, payment history and plan." />

      <div className="space-y-8 px-4 pt-6 pb-10 sm:px-8">
        <section>
          <SectionLabel>Subscription</SectionLabel>
          <div className="mt-3 overflow-hidden rounded-lg border border-line bg-paper">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <CreditCard size={22} weight="duotone" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <TierBadge plan={subscriptionPlan} />
                    <p className="text-sm font-semibold text-ink">{tier.bedRange}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{formatCurrency(tier.monthlyPrice)}/month</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)}>
                Request a plan change
                <ArrowRight size={14} weight="bold" />
              </Button>
            </div>

            <div className="border-t border-line p-5">
              {!current ? (
                <div className="flex items-center gap-2 text-sm text-ink">
                  <CheckCircle size={16} weight="fill" className="text-emerald-500" />
                  You're all paid up. Nothing due right now.
                </div>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{periodLabel(current.period)}</p>
                      <StatusPill tone={STATUS_TONE[current.status]}>{statusLabel(current.status)}</StatusPill>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatCurrency(current.amount)} · Due {formatDate(current.due_date)}
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={openPay}>
                    Pay now
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>Payment history</SectionLabel>
          <TableCard className="mt-3">
            <DataTable>
              <DataTableHead>
                <tr>
                  <Th>Period</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {history.length === 0 ? (
                  <TableEmptyState colSpan={4} icon={<Receipt size={18} weight="duotone" />} title="No past invoices yet" />
                ) : (
                  history.map((inv) => (
                    <tr key={inv.id}>
                      <Td>{periodLabel(inv.period)}</Td>
                      <Td>{formatCurrency(inv.amount)}</Td>
                      <Td>
                        <StatusPill tone={STATUS_TONE[inv.status]}>{statusLabel(inv.status)}</StatusPill>
                      </Td>
                      <Td>{formatDate(inv.paid_at ?? inv.due_date)}</Td>
                    </tr>
                  ))
                )}
              </DataTableBody>
            </DataTable>
          </TableCard>
        </section>
      </div>

      {payOpen && (
        <Modal
          title="Pay subscription"
          description={current ? `${formatCurrency(current.amount)} for ${periodLabel(current.period)}` : undefined}
          onClose={() => !paying && setPayOpen(false)}
          disableBackdropClose={paying}
          maxWidth="xs"
          footer={
            payPhase === "success" ? (
              <Button variant="primary" size="sm" className="w-full" onClick={() => setPayOpen(false)}>
                Done
              </Button>
            ) : payPhase === "failed" ? (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setPayOpen(false)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setPayResult(null);
                    setPayError(null);
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : payPhase === "waiting" ? (
              <Button variant="primary" size="sm" className="w-full" disabled>
                <Spinner className="h-3.5 w-3.5" />
                Waiting for approval…
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setPayOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" className="flex-1" disabled={!payOperator} onClick={submitPay}>
                  Pay {current ? formatCurrency(current.amount) : ""}
                </Button>
              </div>
            )
          }
        >
          {payPhase === "success" ? (
            <div className="flex flex-col items-center gap-2 py-5 text-center">
              <CheckCircle size={40} weight="fill" className="text-emerald-500" />
              <p className="text-sm font-semibold text-ink">Payment received</p>
              <p className="text-xs text-muted">Your subscription is up to date.</p>
            </div>
          ) : payPhase === "failed" ? (
            <div className="flex flex-col items-center gap-2 py-5 text-center">
              <WarningCircle size={40} weight="fill" className="text-red-500" />
              <p className="text-sm font-semibold text-ink">Payment didn't go through</p>
              <p className="text-xs text-muted">{payError ?? "Please try again."}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-5 text-muted">
                We'll send a mobile money prompt to this number. Approve it on your phone to complete the payment.
              </p>
              <label htmlFor="billing-pay-phone" className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Mobile money number</span>
                <div className="relative">
                  <input
                    id="billing-pay-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    disabled={paying}
                    value={payPhone}
                    onChange={(e) => {
                      setPayPhone(e.target.value);
                      setPayOperatorOverride(null);
                    }}
                    placeholder="097 000 0000"
                    style={{ paddingRight: payDetected ? 100 : undefined }}
                    className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
                  />
                  {payDetected && !payOverriding && (
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center gap-1.5">
                      <img src={MOBILE_MONEY_LOGO[payDetected]} alt="" className="h-4 w-4 rounded object-cover" />
                      <span className="text-xs font-semibold text-ink">{OPERATOR_SHORT[payDetected]}</span>
                    </span>
                  )}
                </div>
              </label>

              {payOverriding || (payPhone.trim() !== "" && !payDetected) ? (
                <div className="flex gap-2">
                  {OPERATORS.map((op) => (
                    <button
                      key={op}
                      type="button"
                      disabled={paying}
                      onClick={() => {
                        setPayOperatorOverride(op);
                        setPayOverriding(false);
                      }}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                        payOperator === op ? "border-brand bg-brand-soft text-brand" : "border-line text-ink hover:bg-mist/40"
                      }`}
                    >
                      <img src={MOBILE_MONEY_LOGO[op]} alt="" className="h-3.5 w-3.5 rounded object-cover" />
                      {OPERATOR_SHORT[op]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  {payPhone.trim() === "" ? (
                    "We'll work out your network from the number."
                  ) : payDetected ? (
                    <>
                      Charging your {OPERATOR_LABEL[payDetected]} wallet.{" "}
                      <button type="button" className="font-semibold text-brand" onClick={() => setPayOverriding(true)} disabled={paying}>
                        Not {OPERATOR_SHORT[payDetected]}?
                      </button>
                    </>
                  ) : (
                    "We don't recognise that number as a Zambian mobile money number."
                  )}
                </p>
              )}

              {payError && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <WarningCircle size={14} weight="fill" />
                  {payError}
                </p>
              )}
            </div>
          )}
        </Modal>
      )}

      {upgradeOpen && (
        <Modal
          title="Request a plan change"
          description="Pick a plan and we'll reach out to make the change."
          onClose={() => setUpgradeOpen(false)}
          maxWidth="sm"
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setUpgradeOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                disabled={!requestedTier || submittingUpgrade}
                onClick={submitUpgradeRequest}
              >
                Send request
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-2">
              {PLAN_TIERS.filter((p) => p.id !== tierId).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRequestedTier(p.label)}
                  className={`flex items-center justify-between rounded-md border p-3 text-left transition-colors ${
                    requestedTier === p.label ? "border-brand bg-brand-soft" : "border-line hover:bg-mist/40"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{p.label}</p>
                    <p className="text-xs text-muted">{p.bedRange}</p>
                  </div>
                  <p className="text-sm font-medium text-ink">{formatCurrency(p.monthlyPrice)}/mo</p>
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Note (optional)</span>
              <textarea
                value={upgradeNote}
                onChange={(e) => setUpgradeNote(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
