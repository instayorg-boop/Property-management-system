import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy as CopyIconBase,
  QrCode as QrIconBase,
  Plus as PlusIconBase,
  Check as CheckIconBase,
  CheckCircle as CheckCircleIcon,
  Laptop as LaptopIcon,
  Wallet as WalletIcon,
  Coins as CoinsIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import SectionLabel from "../components/SectionLabel";
import ThemeSwitcher from "../components/ThemeSwitcher";
import Button from "../components/Button";
import BankSelect from "../components/BankSelect";
import { useSettings, type NotificationPrefs, type PaymentMethod } from "../SettingsContext";
import { listBanks, resolveBankAccount, createPayoutRecipient, type Bank } from "../../lib/payoutApi";

function CopyIcon() {
  return <CopyIconBase size={14} weight="duotone" />;
}

function QrIcon() {
  return <QrIconBase size={14} weight="duotone" />;
}

function PlusIcon() {
  return <PlusIconBase size={14} weight="bold" />;
}

function CheckIcon() {
  return <CheckIconBase size={12} weight="bold" />;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-line"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper shadow transition-transform ${
          checked ? "translate-x-5.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** One horizontal label/description + control row — the space-efficient pattern, no boxed card per
 * field. The label reads as a small section heading (bold, ink) rather than a form-field caption,
 * since a Row is a whole labeled setting, not just one input. */
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="py-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-3xl">
        <div>
          <p className="font-display text-[15px] font-bold tracking-tight text-ink">{label}</p>
          {desc && <p className="mt-1 max-w-sm text-xs text-muted">{desc}</p>}
        </div>
        <div className="flex items-center">{children}</div>
      </div>
    </div>
  );
}

const fieldCls =
  "w-full max-w-xs rounded-lg border-none bg-mist px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/30";

// MVP: "Statutory" (NAPSA/payroll figures) is commented out along with staff/payroll everywhere
// else — see the note in Sidebar.tsx. Re-add it to this tuple to bring the tab back.
const tabs = ["Property", "Billing & invoicing", "Reminders", "Payment link", "Online payments", "Notifications", "Subscription", "Account"] as const;
type Tab = (typeof tabs)[number];

const tabSlug: Record<Tab, string> = {
  Property: "property",
  "Billing & invoicing": "billing-invoicing",
  Reminders: "reminders",
  "Payment link": "payment-link",
  "Online payments": "online-payments",
  Notifications: "notifications",
  Subscription: "subscription",
  Account: "account",
};

function tabFromSlug(slug: string | null): Tab {
  const match = tabs.find((t) => tabSlug[t] === slug?.toLowerCase());
  return match ?? "Property";
}

// The 8 underlying sections, grouped into 4 top-level tabs so the bar doesn't sprawl — related
// settings (billing + reminders, online payments + the payment link, account + notifications +
// subscription) live together on one page instead of behind separate clicks. Each group's URL
// slug is its first member's, so existing deep links ("/settings/property",
// "/settings/online-payments" from SetupChecklist/PayoutDetailDrawer) keep working unchanged.
const tabGroups = [
  { label: "Property", members: ["Property"] as Tab[] },
  { label: "Billing & rent", members: ["Billing & invoicing", "Reminders"] as Tab[] },
  { label: "Payments", members: ["Online payments", "Payment link"] as Tab[] },
  { label: "Account", members: ["Account", "Notifications", "Subscription"] as Tab[] },
] as const;

function groupFor(t: Tab) {
  return tabGroups.find((g) => (g.members as readonly Tab[]).includes(t))!;
}

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const onlinePaymentsSteps: { label: string; Icon: PhosphorIcon }[] = [
  { label: "Set up online payments", Icon: LaptopIcon },
  { label: "Add your bank account", Icon: WalletIcon },
  { label: "Accept payments", Icon: CoinsIcon },
];

const notificationRows: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
  { key: "newPayment", label: "New payment received", desc: "A tenant's rent payment is logged." },
  { key: "newMaintenanceReport", label: "New maintenance report", desc: "A tenant or you log a new maintenance issue." },
  { key: "upcomingPayout", label: "Upcoming payout", desc: "Your scheduled bank payout is a day away." },
  { key: "overdueEscalated", label: "Overdue tenant escalated to guardian", desc: "A tenant crosses the escalation threshold and their guardian is contacted." },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  // Each section is its own route (/settings/:section) — navigating between them is a real page
  // change, not a shared-component tab flip, so there's no flash of intermediate sections.
  const { section } = useParams<{ section?: string }>();
  const tab = tabFromSlug(section ?? null);
  const activeGroup = groupFor(tab);

  const openTab = (t: Tab) => navigate(`/settings/${tabSlug[t]}`);

  useEffect(() => {
    if (tab !== "Online payments" || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab, location.hash]);

  const {
    // invoicesOn, setInvoicesOn, // MVP: invoicing toggle is commented out — see the note above.
    collectionTargetPct, setCollectionTargetPct,
    propertyName, setPropertyName,
    propertyAddress, setPropertyAddress,
    propertyType, setPropertyType,
    landlordName, setLandlordName,
    landlordPhone, setLandlordPhone,
    paymentMethods, setPaymentMethods,
    properties, addProperty,
    billingPeriod, setBillingPeriod,
    dueDay, setDueDay,
    gracePeriodDays, setGracePeriodDays,
    dailyPenaltyRate, setDailyPenaltyRate,
    reminderLeadDays, setReminderLeadDays,
    escalationDays, setEscalationDays,
    contactOrder, setContactOrder,
    notificationPrefs, setNotificationPref,
    propertyId,
    lencoConnected, setLencoConnected,
    bankName, setBankName,
    accountNumber, setAccountNumber,
    accountHolderName, setAccountHolderName,
    payoutDay,
    accountEmail, setAccountEmail,
    subscriptionPlan, subscriptionRenewsAt,
    // napsaInsurableEarningsCeiling, setNapsaInsurableEarningsCeiling, // MVP: Statutory tab is commented out.
    // minimumWageReference, setMinimumWageReference,
  } = useSettings();

  const [linkCopied, setLinkCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Online payments setup — a 3-step wizard (0 = not started) that runs whether this is the
  // first connection or an edit to an already-connected account.
  const [payoutStep, setPayoutStep] = useState(0);
  const [editingBank, setEditingBank] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [formBank, setFormBank] = useState<Bank | null>(null);
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formAccountHolderName, setFormAccountHolderName] = useState("");
  // The resolved account name from Lenco — separate from formAccountHolderName, which only ever
  // gets set once resolution succeeds, so "Continue" can gate on it without conflating a stale
  // typed value with a confirmed one.
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setPayoutStep(0);
    setEditingBank(false);
  }, [tab]);

  useEffect(() => {
    if (tab !== "Online payments") return;
    let cancelled = false;
    listBanks()
      .then((rows) => {
        if (!cancelled) setBanks(rows);
      })
      .catch((err) => console.error("Failed to load banks", err));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const resolveAccount = async (bank: Bank, accountNumber: string) => {
    if (!bank || !accountNumber.trim()) return;
    setResolvingAccount(true);
    setResolveError(null);
    setFormAccountHolderName("");
    try {
      const accountName = await resolveBankAccount(accountNumber, bank.code);
      setFormAccountHolderName(accountName);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : "Couldn't resolve that account.");
    } finally {
      setResolvingAccount(false);
    }
  };

  // The setup flow (intro + wizard) is a centered, full-width screen, not a left-aligned settings
  // form — it needs the full content width to actually center in, not just within the narrow column.
  const onlinePaymentsWizard = activeGroup.label === "Payments" && (!lencoConnected || editingBank);

  const startEditingBank = () => {
    // The previously-saved bank was stored by name, not code (before this table existed) — best-effort
    // match it in the local cache; if it's not found the landlord just reselects it, which is a one-time cost.
    setFormBank(banks.find((b) => b.name === bankName) ?? null);
    setFormAccountNumber(accountNumber);
    setFormAccountHolderName(accountHolderName);
    setResolveError(null);
    setSaveError(null);
    setEditingBank(true);
    setPayoutStep(1);
  };

  const flash = (msg = "Saved") => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1200);
  };

  const togglePaymentMethod = (type: PaymentMethod["type"], enabled: boolean) => {
    if (enabled) {
      if (paymentMethods.some((m) => m.type === type)) return;
      setPaymentMethods([...paymentMethods, { type }]);
    } else {
      setPaymentMethods(paymentMethods.filter((m) => m.type !== type));
    }
    flash();
  };

  const updatePaymentMethod = (type: PaymentMethod["type"], patch: Partial<PaymentMethod>) => {
    setPaymentMethods(paymentMethods.map((m) => (m.type === type ? { ...m, ...patch } : m)));
    flash();
  };

  const propertySlug = slugify(propertyName) || "property";
  const paymentLink = `pay.instay.co/${propertySlug}`;
  /** The real in-app route tenants land on — used for the QR code and the "Open" preview link. */
  const paymentPath = `/pay/${propertySlug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://${paymentLink}`);
    } catch {
      // clipboard API unavailable — UI still confirms so the user can copy manually if needed
    }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1500);
  };

  // The settings for whichever section is selected — shared between the mobile push-navigation
  // view and the desktop list-plus-detail layout so it's only written once.
  const detail = (
    <>
      {activeGroup.label === "Property" && (
            <>
              <Row label="Property name" desc="Used across the dashboard — tenants added on the Tenants page are assigned to this property automatically.">
                <input
                  value={propertyName}
                  onChange={(e) => {
                    setPropertyName(e.target.value);
                    flash();
                  }}
                  className={fieldCls}
                />
              </Row>
              <Row label="Address" desc="Shown on invoices, in the From section.">
                <input
                  value={propertyAddress}
                  onChange={(e) => {
                    setPropertyAddress(e.target.value);
                    flash();
                  }}
                  className={fieldCls}
                />
              </Row>
              
              
              
              
            </>
          )}

          {activeGroup.label === "Billing & rent" && (
            <>
              <Row label="Billing period">
                <input value={billingPeriod} onChange={(e) => { setBillingPeriod(e.target.value); flash(); }} className={fieldCls} />
              </Row>
              <Row label="Due date" desc="Day of the month rent is due.">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => { setDueDay(Math.min(31, Math.max(1, Number(e.target.value) || 1))); flash(); }}
                  className={fieldCls}
                />
              </Row>
              <Row label="Grace period" desc="Days after the due date before rent is marked overdue.">
                <input
                  type="number"
                  min={0}
                  value={gracePeriodDays}
                  onChange={(e) => { setGracePeriodDays(Math.max(0, Number(e.target.value) || 0)); flash(); }}
                  className={fieldCls}
                />
              </Row>
              <Row label="Daily penalty rate (K)" desc="Charged per day once the grace period ends.">
                <input
                  type="number"
                  min={0}
                  value={dailyPenaltyRate}
                  onChange={(e) => { setDailyPenaltyRate(Math.max(0, Number(e.target.value) || 0)); flash(); }}
                  className={fieldCls}
                />
              </Row>
              {/* MVP: invoicing is out of scope for now. */}
              {/* <Row
                label="Generate invoices"
                desc="Lets you pre-fill and send invoices for every tenant from the Rent page, including carried-over balances."
              >
                <Toggle checked={invoicesOn} onChange={(v) => { setInvoicesOn(v); flash(); }} />
              </Row> */}
              <Row
                label="Collection rate target (%)"
                desc="The goal shown against your monthly collection rate on the Rent page. Lower this during slow seasons so the trend isn't always red."
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={collectionTargetPct}
                  onChange={(e) => { setCollectionTargetPct(Math.min(100, Math.max(0, Number(e.target.value) || 0))); flash(); }}
                  className={fieldCls}
                />
              </Row>

              <div className="pt-2">
                <SectionLabel>Reminders</SectionLabel>
              </div>
              <Row label="Days before rent is due" desc="How many days ahead of the due date the first reminder is sent.">
                <input
                  type="number"
                  min={0}
                  value={reminderLeadDays}
                  onChange={(e) => { setReminderLeadDays(Math.max(0, Number(e.target.value) || 0)); flash(); }}
                  className={fieldCls}
                />
              </Row>
              <Row label="Days overdue before guardian is contacted" desc="The parent/guardian is contacted automatically after rent is this many days late.">
                <input
                  type="number"
                  min={0}
                  value={escalationDays}
                  onChange={(e) => { setEscalationDays(Math.max(0, Number(e.target.value) || 0)); flash(); }}
                  className={fieldCls}
                />
              </Row>
              <Row label="Contact order" desc="Who gets reminded first when rent is due.">
                <div className="flex gap-2">
                  {(["student", "guardian"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => { setContactOrder(o); flash(); }}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                        contactOrder === o ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                      }`}
                    >
                      {o === "student" ? "Student first" : "Parent/guardian first"}
                    </button>
                  ))}
                </div>
              </Row>
              <p className="pb-5 text-xs text-muted">These values are ready for the reminder automation to read once it's built — nothing sends yet.</p>
            </>
          )}

          {activeGroup.label === "Payments" && (
            <>
              <SectionLabel>Bank & payouts</SectionLabel>
              {lencoConnected && !editingBank ? (
                <>
                  <div className="border-b border-line py-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-3xl">
                      <div>
                        <p className="text-sm font-medium text-ink">Lenco</p>
                        <p className="mt-1 max-w-sm text-xs text-muted">
                          Payouts are sent to your bank account automatically on your scheduled day.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">Connected</span>
                        <Button variant="secondary">Manage in Lenco</Button>
                      </div>
                    </div>
                  </div>
                  <Row label="Bank account">
                    <span className="text-sm font-medium text-ink">
                      {bankName} •••• {accountNumber.slice(-4)}
                    </span>
                  </Row>
                  <Row label="Account holder">
                    <span className="text-sm font-medium text-ink">{accountHolderName}</span>
                  </Row>
                  <Row label="Scheduled payout day">
                    <span className="text-sm font-medium text-ink">Every {payoutDay}</span>
                  </Row>
                  <Row label="Payout details">
                    <Button variant="secondary" onClick={startEditingBank}>
                      Edit payout details
                    </Button>
                  </Row>
                  
                </>
              ) : (
                <AnimatePresence mode="wait">
                  {payoutStep === 0 ? (
                    <motion.div
                      key="intro"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      className="mx-auto max-w-xl py-10 text-center"
                    >
                      <p className="font-display text-2xl font-semibold tracking-tight text-ink">Get payments online!</p>
                      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                        Accept rent payments straight to your bank account through your payment link.
                      </p>

                      <div className="mt-8 grid grid-cols-3 gap-4">
                        {onlinePaymentsSteps.map(({ label, Icon }) => (
                          <div key={label} className="flex flex-col items-center gap-3">
                            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
                              <Icon size={28} weight="duotone" />
                            </span>
                            <p className="text-xs font-medium text-ink">{label}</p>
                          </div>
                        ))}
                      </div>

                      <Button variant="primary" className="mt-8 px-8 py-2.5" onClick={() => setPayoutStep(1)}>
                        Set up
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={payoutStep}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="mx-auto max-w-md py-10"
                    >
                      <div className="mb-5 flex items-center gap-2">
                        {[1, 2, 3].map((s) => (
                          <div
                            key={s}
                            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${s <= payoutStep ? "bg-brand" : "bg-line"}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs font-medium text-muted">Step {Math.min(payoutStep, 3)} of 3</p>

                      {payoutStep === 1 && (
                        <>
                          <p className="mt-1 font-display text-lg font-semibold text-ink">Add your bank account</p>
                          <p className="mt-1 text-sm text-muted">
                            Make sure these details match your bank exactly — payouts go here automatically.
                          </p>
                          <div className="mt-4 space-y-3">
                            <div>
                              <label className="mb-1.5 block text-xs font-medium text-muted">Bank</label>
                              <BankSelect
                                banks={banks}
                                selectedCode={formBank?.code ?? null}
                                onSelect={(bank) => {
                                  setFormBank(bank);
                                  setResolveError(null);
                                  setFormAccountHolderName("");
                                }}
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-medium text-muted">Account number</label>
                              <div className="flex gap-2">
                                <input
                                  value={formAccountNumber}
                                  onChange={(e) => {
                                    setFormAccountNumber(e.target.value.replace(/\D/g, ""));
                                    setResolveError(null);
                                    setFormAccountHolderName("");
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && formBank && formAccountNumber.trim()) void resolveAccount(formBank, formAccountNumber);
                                  }}
                                  inputMode="numeric"
                                  placeholder="Your full account number"
                                  className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="shrink-0 px-4"
                                  disabled={!formBank || !formAccountNumber.trim() || resolvingAccount}
                                  onClick={() => formBank && void resolveAccount(formBank, formAccountNumber)}
                                >
                                  {resolvingAccount ? "Checking…" : "Check account"}
                                </Button>
                              </div>
                              {!formBank && formAccountNumber.trim() && (
                                <p className="mt-1 text-xs text-muted">Pick a bank above, then check the account.</p>
                              )}
                            </div>

                            {/* Resolved account name — a read-only confirmation, not an editable field, so the
                                landlord can't accidentally save a name that doesn't match what Lenco resolved.
                                Only checked when the button (or Enter) is pressed — not on every keystroke or
                                blur, so this isn't firing a database/API request while you're mid-typing. */}
                            {!resolvingAccount && resolveError && <p className="text-xs text-red-600">{resolveError}</p>}
                            {!resolvingAccount && !resolveError && formAccountHolderName && (
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                                <p className="text-xs text-emerald-700">Account holder</p>
                                <p className="mt-0.5 text-sm font-medium text-emerald-800">{formAccountHolderName}</p>
                              </div>
                            )}
                          </div>
                          <div className="mt-5 flex gap-2">
                            {editingBank && (
                              <Button variant="secondary" className="flex-1 py-2.5" onClick={() => setEditingBank(false)}>
                                Cancel
                              </Button>
                            )}
                            <Button
                              variant="primary"
                              className="flex-1 py-2.5"
                              disabled={!formBank || !formAccountNumber.trim() || !formAccountHolderName || resolvingAccount}
                              onClick={() => setPayoutStep(2)}
                            >
                              Continue
                            </Button>
                          </div>
                        </>
                      )}

                      {payoutStep === 2 && formBank && (
                        <>
                          <p className="mt-1 font-display text-lg font-semibold text-ink">Confirm your details</p>
                          <p className="mt-1 text-sm text-muted">Double-check these are correct — this is where every payout will be sent.</p>
                          <div className="mt-4 divide-y divide-line rounded-lg border border-line">
                            <div className="px-4 py-3">
                              <p className="text-xs text-muted">Bank name</p>
                              <p className="mt-0.5 text-sm font-medium text-ink">{formBank.name}</p>
                            </div>
                            <div className="px-4 py-3">
                              <p className="text-xs text-muted">Account number</p>
                              <p className="mt-0.5 text-sm font-medium text-ink">{formAccountNumber}</p>
                            </div>
                            <div className="px-4 py-3">
                              <p className="text-xs text-muted">Account holder</p>
                              <p className="mt-0.5 text-sm font-medium text-ink">{formAccountHolderName}</p>
                            </div>
                          </div>
                          {saveError && <p className="mt-3 text-xs text-red-600">{saveError}</p>}
                          <div className="mt-5 flex gap-2">
                            <Button variant="secondary" className="flex-1 py-2.5" onClick={() => setPayoutStep(1)} disabled={savingRecipient}>
                              Back
                            </Button>
                            <Button
                              variant="primary"
                              className="flex-1 py-2.5"
                              disabled={savingRecipient}
                              onClick={async () => {
                                if (!propertyId || !formBank) return;
                                setSavingRecipient(true);
                                setSaveError(null);
                                try {
                                  await createPayoutRecipient({
                                    accountNumber: formAccountNumber,
                                    bankCode: formBank.code,
                                    accountName: formAccountHolderName,
                                    propertyId,
                                  });
                                  setBankName(formBank.name);
                                  setAccountNumber(formAccountNumber);
                                  setAccountHolderName(formAccountHolderName);
                                  setLencoConnected(true);
                                  if (editingBank) {
                                    setEditingBank(false);
                                    setPayoutStep(0);
                                    flash("Payout details updated");
                                  } else {
                                    setPayoutStep(3);
                                  }
                                } catch (err) {
                                  setSaveError(err instanceof Error ? err.message : "Failed to save payout details.");
                                } finally {
                                  setSavingRecipient(false);
                                }
                              }}
                            >
                              {savingRecipient ? "Saving…" : editingBank ? "Save changes" : "Confirm & connect"}
                            </Button>
                          </div>
                        </>
                      )}

                      {payoutStep === 3 && (
                        <>
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                            <CheckCircleIcon size={24} weight="duotone" />
                          </span>
                          <p className="mt-4 font-display text-lg font-semibold text-ink">You're all set</p>
                          <p className="mt-1.5 text-sm text-muted">
                            All rent collected through your payment link will now be paid out to {formBank?.name} · •••• {formAccountNumber.slice(-4)}.
                          </p>
                          <Button variant="primary" className="mt-5 py-2.5" onClick={() => setPayoutStep(0)}>
                            Done
                          </Button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}

              <div className="pt-2">
                <SectionLabel>Payment link</SectionLabel>
              </div>
              <Row label="Your payment link" desc="Share this with tenants directly, or display the QR code at the property office.">
                <div className="w-full max-w-md space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-line bg-mist px-3 py-2">
                    <span className="flex-1 truncate text-sm text-muted">{paymentLink}</span>
                    <Button variant="secondary" size="sm" className="gap-1.5" onClick={copyLink}>
                      <CopyIcon />
                      {linkCopied ? "Copied" : "Copy"}
                    </Button>
                    <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setShowQr((v) => !v)}>
                      <QrIcon />
                      QR code
                    </Button>
                  </div>
                  {showQr && (
                    <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-paper p-5">
                      <QRCodeSVG value={`${window.location.origin}${paymentPath}`} size={160} />
                      <p className="text-xs text-muted">Print or screenshot this for the property office.</p>
                    </div>
                  )}
                  <a href={paymentPath} target="_blank" rel="noreferrer" className="inline-block text-xs font-medium text-brand hover:underline">
                    Open the tenant-facing page →
                  </a>
                </div>
              </Row>
            </>
          )}

          {/* MVP: Statutory (NAPSA/payroll figures) — commented out along with staff/payroll.
              Re-add "Statutory" to the `tabs` tuple above to bring this back. */}
          {/* {tab === "Statutory" && (
            <>
              <p className="pt-5 text-xs text-muted">
                Government-published figures that change periodically — keep these current so payroll stays accurate without a code change.
              </p>
              <Row
                label="NAPSA insurable earnings ceiling (K/month)"
                desc="NAPSA updates this annually. Contributions are capped at 5% of this figure."
              >
                <input
                  type="number"
                  min={0}
                  value={napsaInsurableEarningsCeiling}
                  onChange={(e) => { setNapsaInsurableEarningsCeiling(Math.max(0, Number(e.target.value) || 0)); flash(); }}
                  className={fieldCls}
                />
              </Row>
              <Row label="Minimum wage reference (K/month)" desc="For reference when setting pay rates — not enforced automatically.">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={minimumWageReference}
                  onChange={(e) => { setMinimumWageReference(Math.max(0, Number(e.target.value) || 0)); flash(); }}
                  className={fieldCls}
                />
              </Row>
            </>
          )} */}

          {activeGroup.label === "Account" && (
            <>
              <Row label="Email address">
                <input
                  value={accountEmail}
                  onChange={(e) => {
                    setAccountEmail(e.target.value);
                    flash();
                  }}
                  type="email"
                  placeholder="you@example.com"
                  className={fieldCls}
                />
              </Row>
              <Row label="Password">
                <button type="button" className="text-sm font-medium text-brand hover:underline">
                  Change password
                </button>
              </Row>
              <Row label="Appearance" desc="Switch between light, dark, or match your device.">
                <ThemeSwitcher />
              </Row>
              <Row
                label="Current plan"
                desc={
                  subscriptionRenewsAt
                    ? `Renews ${new Date(subscriptionRenewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`
                    : "No renewal date set."
                }
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-ink">{subscriptionPlan || "—"}</span>
                  <Button variant="primary" size="sm">
                    Upgrade
                  </Button>
                </div>
              </Row>
              <Row label="Sign out" desc="You'll need to sign in again on this device.">
                <Button variant="danger" onClick={() => navigate("/sign-in")}>
                  Sign out
                </Button>
              </Row>

              <div className="pt-2">
                <SectionLabel>Notifications</SectionLabel>
              </div>
              <p className="pt-3 text-xs text-muted">Choose which events send you a push notification or email.</p>
              {notificationRows.map((n) => (
                <Row key={n.key} label={n.label} desc={n.desc}>
                  <Toggle checked={notificationPrefs[n.key]} onChange={(v) => { setNotificationPref(n.key, v); flash(); }} />
                </Row>
              ))}
            </>
          )}
    </>
  );

  return (
    <>
      <PageHeader title="Settings" description="Manage your property, billing, and account preferences." />

      {/* Persistent tab bar — every section is one click away instead of a list-then-back flow.
          overflow-x-auto lets it scroll on narrow screens rather than wrap, so the sliding
          underline never has to jump between lines. */}
      <div className="overflow-x-auto border-b border-line px-4 sm:px-8">
        <div className="flex items-center gap-1">
          {tabGroups.map((g) => (
            <button
              key={g.label}
              type="button"
              onClick={() => openTab(g.members[0])}
              className={`relative shrink-0 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeGroup.label === g.label ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {g.label}
              {activeGroup.label === g.label && (
                <motion.span
                  layoutId="settings-tab"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-brand"
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={`px-4 pt-6 pb-10 sm:px-8 ${onlinePaymentsWizard ? "" : "max-w-3xl"}`}>{detail}</div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper shadow-card"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
