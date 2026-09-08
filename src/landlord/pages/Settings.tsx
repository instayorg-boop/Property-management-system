import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy as CopyIconBase,
  QrCode as QrIconBase,
  Plus as PlusIconBase,
  Check as CheckIconBase,
  CaretRight as CaretRightIcon,
  ArrowLeft as ArrowLeftIcon,
  House as HouseIcon,
  Receipt as ReceiptIcon,
  BellRinging as BellRingingIcon,
  LinkSimple as LinkSimpleIcon,
  Bank as BankIcon,
  Scales as ScalesIcon,
  Bell as BellIcon,
  Gift as GiftIcon,
  UserCircle as UserCircleIcon,
  CheckCircle as CheckCircleIcon,
  Laptop as LaptopIcon,
  Wallet as WalletIcon,
  Coins as CoinsIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import ThemeSwitcher from "../components/ThemeSwitcher";
import Button from "../components/Button";
import { useSettings, type NotificationPrefs, type PaymentMethod } from "../SettingsContext";

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

/** One horizontal label/description + control row — the space-efficient pattern, no boxed card per field. */
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="py-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-3xl">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          {desc && <p className="mt-1 max-w-sm text-xs text-muted">{desc}</p>}
        </div>
        <div className="flex items-center">{children}</div>
      </div>
    </div>
  );
}

const fieldCls = "w-full max-w-xs rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand";

const tabs = ["Property", "Billing & invoicing", "Reminders", "Payment link", "Online payments", "Statutory", "Notifications", "Subscription", "Account"] as const;
type Tab = (typeof tabs)[number];

const tabSlug: Record<Tab, string> = {
  Property: "property",
  "Billing & invoicing": "billing-invoicing",
  Reminders: "reminders",
  "Payment link": "payment-link",
  "Online payments": "online-payments",
  Statutory: "statutory",
  Notifications: "notifications",
  Subscription: "subscription",
  Account: "account",
};

const tabIcon: Record<Tab, PhosphorIcon> = {
  Property: HouseIcon,
  "Billing & invoicing": ReceiptIcon,
  Reminders: BellRingingIcon,
  "Payment link": LinkSimpleIcon,
  "Online payments": BankIcon,
  Statutory: ScalesIcon,
  Notifications: BellIcon,
  Subscription: GiftIcon,
  Account: UserCircleIcon,
};

function tabFromSlug(slug: string | null): Tab {
  const match = tabs.find((t) => tabSlug[t] === slug?.toLowerCase());
  return match ?? "Property";
}

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Plain-language explanation of what each section actually contains — shown on the section list so
// landlords don't have to open a section just to find out what's in it.
const tabDescription: Record<Tab, string> = {
  Property: "Your property's name and address, plus switching between properties you manage.",
  "Billing & invoicing": "When rent is due, late-payment penalties, and generating tenant invoices.",
  Reminders: "When tenants and their guardians get reminded about upcoming or overdue rent.",
  "Payment link": "The link and QR code tenants use to pay their rent online.",
  "Online payments": "Connect a bank account so rent paid online lands there automatically.",
  Statutory: "NAPSA and minimum wage figures used to calculate payroll correctly.",
  Notifications: "Which events send you a push notification or email.",
  Subscription: "Your current plan, billing, and upgrade options.",
  Account: "Your login email, password, and app appearance.",
};

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
  const sectionOpen = !!section;

  const openTab = (t: Tab) => navigate(`/settings/${tabSlug[t]}`);
  const goToList = () => navigate("/settings");

  useEffect(() => {
    if (tab !== "Online payments" || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab, location.hash]);

  const {
    invoicesOn, setInvoicesOn,
    collectionTargetPct, setCollectionTargetPct,
    propertyName, setPropertyName,
    propertyAddress, setPropertyAddress,
    propertyType, setPropertyType,
    landlordName, setLandlordName,
    landlordPhone, setLandlordPhone,
    paymentMethods, setPaymentMethods,
    properties, addProperty,
    managementFeeRate, setManagementFeeRate,
    billingPeriod, setBillingPeriod,
    dueDay, setDueDay,
    gracePeriodDays, setGracePeriodDays,
    dailyPenaltyRate, setDailyPenaltyRate,
    reminderLeadDays, setReminderLeadDays,
    escalationDays, setEscalationDays,
    contactOrder, setContactOrder,
    notificationPrefs, setNotificationPref,
    lencoConnected, setLencoConnected,
    bankName, setBankName,
    accountNumber, setAccountNumber,
    accountHolderName, setAccountHolderName,
    payoutDay,
    accountEmail, setAccountEmail,
    subscriptionPlan, subscriptionRenewsAt,
    napsaInsurableEarningsCeiling, setNapsaInsurableEarningsCeiling,
    minimumWageReference, setMinimumWageReference,
  } = useSettings();

  const [linkCopied, setLinkCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Online payments setup — a 3-step wizard (0 = not started) that runs whether this is the
  // first connection or an edit to an already-connected account.
  const [payoutStep, setPayoutStep] = useState(0);
  const [editingBank, setEditingBank] = useState(false);
  const [formBankName, setFormBankName] = useState("");
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formAccountHolderName, setFormAccountHolderName] = useState("");

  useEffect(() => {
    setPayoutStep(0);
    setEditingBank(false);
  }, [tab]);

  // The setup flow (intro + wizard) is a centered, full-width screen, not a left-aligned settings
  // form — it needs the full content width to actually center in, not just within the narrow column.
  const onlinePaymentsWizard = tab === "Online payments" && (!lencoConnected || editingBank);

  const startEditingBank = () => {
    setFormBankName(bankName);
    setFormAccountNumber(accountNumber);
    setFormAccountHolderName(accountHolderName);
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
      {tab === "Property" && (
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
              <Row label="Property type">
                <input
                  value={propertyType}
                  onChange={(e) => {
                    setPropertyType(e.target.value);
                    flash();
                  }}
                  placeholder="e.g. Student accommodation"
                  className={fieldCls}
                />
              </Row>
              <Row label="Landlord name" desc="Shown on invoices, in the From section.">
                <input
                  value={landlordName}
                  onChange={(e) => {
                    setLandlordName(e.target.value);
                    flash();
                  }}
                  className={fieldCls}
                />
              </Row>
              <Row label="Landlord phone" desc="Shown on invoices as the mobile money payment number.">
                <input
                  value={landlordPhone}
                  onChange={(e) => {
                    setLandlordPhone(e.target.value);
                    flash();
                  }}
                  className={fieldCls}
                />
              </Row>
              <Row label="Your properties" desc="Switch which property the dashboard is scoped to, or add another one you manage.">
                <div className="w-full max-w-xs space-y-2">
                  {properties.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPropertyName(p);
                        flash();
                      }}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                        p === propertyName ? "border-brand bg-brand-soft text-brand" : "border-line text-ink hover:bg-mist"
                      }`}
                    >
                      {p}
                      {p === propertyName && <CheckIcon />}
                    </button>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={newPropertyName}
                      onChange={(e) => setNewPropertyName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newPropertyName.trim()) {
                          addProperty(newPropertyName.trim());
                          setNewPropertyName("");
                          flash("Property added");
                        }
                      }}
                      placeholder="New property name"
                      className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newPropertyName.trim()) return;
                        addProperty(newPropertyName.trim());
                        setNewPropertyName("");
                        flash("Property added");
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-mist"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>
              </Row>
            </>
          )}

          {tab === "Billing & invoicing" && (
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
              <Row
                label="Generate invoices"
                desc="Lets you pre-fill and send invoices for every tenant from the Rent page, including carried-over balances."
              >
                <Toggle checked={invoicesOn} onChange={(v) => { setInvoicesOn(v); flash(); }} />
              </Row>
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
            </>
          )}

          {tab === "Reminders" && (
            <>
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

          {tab === "Payment link" && (
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
          )}

          {tab === "Online payments" && (
            <>
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
                      {bankName} · •••• {accountNumber.slice(-4)}
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
                  <Row
                    label="Management fee (%)"
                    desc="Taken off gross rent before the owner payout statement calculates net to owner."
                  >
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(managementFeeRate * 100)}
                      onChange={(e) => { setManagementFeeRate(Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100); flash(); }}
                      className={fieldCls}
                    />
                  </Row>

                  <div className="py-5">
                    <p className="text-sm font-medium text-ink">Payment methods</p>
                    <p className="mt-1 max-w-sm text-xs text-muted">Shown to tenants on invoices, in the "How to pay" section.</p>

                    <div className="mt-3 max-w-md space-y-3">
                      {(
                        [
                          { type: "mtn", checkboxLabel: "MTN MoMo" },
                          { type: "airtel", checkboxLabel: "Airtel Money" },
                          { type: "cash", checkboxLabel: "Cash" },
                          { type: "bank", checkboxLabel: "Bank transfer" },
                          { type: "other", checkboxLabel: "Other (Mukuru, Zamtel Kwacha, etc.)" },
                        ] as const
                      ).map(({ type, checkboxLabel }) => {
                        const method = paymentMethods.find((m) => m.type === type);
                        const enabled = !!method;
                        return (
                          <div key={type} className="rounded-lg border border-line p-3">
                            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) => togglePaymentMethod(type, e.target.checked)}
                                className="h-4 w-4 rounded border-line accent-brand"
                              />
                              {checkboxLabel}
                            </label>

                            {enabled && (type === "mtn" || type === "airtel") && (
                              <input
                                value={method?.number ?? ""}
                                onChange={(e) => updatePaymentMethod(type, { number: e.target.value })}
                                placeholder="Phone number"
                                className="mt-2.5 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                              />
                            )}

                            {enabled && type === "bank" && (
                              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <input
                                  value={method?.bankName ?? ""}
                                  onChange={(e) => updatePaymentMethod(type, { bankName: e.target.value })}
                                  placeholder="Bank name"
                                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                                <input
                                  value={method?.accountNumber ?? ""}
                                  onChange={(e) => updatePaymentMethod(type, { accountNumber: e.target.value })}
                                  placeholder="Account number"
                                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                              </div>
                            )}

                            {enabled && type === "other" && (
                              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <input
                                  value={method?.label ?? ""}
                                  onChange={(e) => updatePaymentMethod(type, { label: e.target.value })}
                                  placeholder="Platform name (e.g. Mukuru)"
                                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                                <input
                                  value={method?.number ?? ""}
                                  onChange={(e) => updatePaymentMethod(type, { number: e.target.value })}
                                  placeholder="Account / number"
                                  className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                              <label className="mb-1.5 block text-xs font-medium text-muted">Bank name</label>
                              <input
                                value={formBankName}
                                onChange={(e) => setFormBankName(e.target.value)}
                                placeholder="e.g. Zanaco"
                                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-medium text-muted">Account number</label>
                              <input
                                value={formAccountNumber}
                                onChange={(e) => setFormAccountNumber(e.target.value.replace(/\D/g, ""))}
                                placeholder="0000000000"
                                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-xs font-medium text-muted">Account holder name</label>
                              <input
                                value={formAccountHolderName}
                                onChange={(e) => setFormAccountHolderName(e.target.value)}
                                placeholder="Must match the bank account"
                                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
                              />
                            </div>
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
                              disabled={!formBankName.trim() || !formAccountNumber.trim() || !formAccountHolderName.trim()}
                              onClick={() => setPayoutStep(2)}
                            >
                              Continue
                            </Button>
                          </div>
                        </>
                      )}

                      {payoutStep === 2 && (
                        <>
                          <p className="mt-1 font-display text-lg font-semibold text-ink">Confirm your details</p>
                          <p className="mt-1 text-sm text-muted">Double-check these are correct — this is where every payout will be sent.</p>
                          <div className="mt-4 divide-y divide-line rounded-lg border border-line">
                            <div className="px-4 py-3">
                              <p className="text-xs text-muted">Bank name</p>
                              <p className="mt-0.5 text-sm font-medium text-ink">{formBankName}</p>
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
                          <div className="mt-5 flex gap-2">
                            <Button variant="secondary" className="flex-1 py-2.5" onClick={() => setPayoutStep(1)}>
                              Back
                            </Button>
                            <Button
                              variant="primary"
                              className="flex-1 py-2.5"
                              onClick={() => {
                                setBankName(formBankName.trim());
                                setAccountNumber(formAccountNumber.trim());
                                setAccountHolderName(formAccountHolderName.trim());
                                setLencoConnected(true);
                                if (editingBank) {
                                  setEditingBank(false);
                                  setPayoutStep(0);
                                  flash("Payout details updated");
                                } else {
                                  setPayoutStep(3);
                                }
                              }}
                            >
                              {editingBank ? "Save changes" : "Confirm & connect"}
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
                            All rent collected through your payment link will now be paid out to {formBankName} · •••• {formAccountNumber.slice(-4)}.
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
            </>
          )}

          {tab === "Statutory" && (
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
          )}

          {tab === "Notifications" && (
            <>
              <p className="pt-5 text-xs text-muted">Choose which events send you a push notification or email.</p>
              {notificationRows.map((n) => (
                <Row key={n.key} label={n.label} desc={n.desc}>
                  <Toggle checked={notificationPrefs[n.key]} onChange={(v) => { setNotificationPref(n.key, v); flash(); }} />
                </Row>
              ))}
            </>
          )}

          {tab === "Subscription" && (
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
          )}

          {tab === "Account" && (
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
              <Row label="Sign out" desc="You'll need to sign in again on this device.">
                <Button variant="danger" onClick={() => navigate("/sign-in")}>
                  Sign out
                </Button>
              </Row>
            </>
          )}
    </>
  );

  return (
    <>
      {!sectionOpen ? (
        <>
          <PageHeader title="Settings" />
          <div className="px-4 pb-10 sm:px-8">
            <div className="grid grid-cols-1 gap-x-8 gap-y-7 py-2 sm:grid-cols-2 lg:grid-cols-3">
              {tabs.map((t) => {
                const Icon = tabIcon[t];
                const linkLabel = t === "Online payments" ? (lencoConnected ? "Manage" : "Set up") : "Manage";
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => openTab(t)}
                    className="group flex flex-col items-start rounded-lg text-left transition-colors hover:bg-mist -m-2 p-2"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <Icon size={17} weight="duotone" className="text-muted" />
                      {t}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{tabDescription[t]}</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand">
                      {linkLabel}
                      <CaretRightIcon size={11} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Selected section replaces the list entirely — back returns to the list, not a split view */}
          <div className="bg-paper px-4 pt-5 pb-6 sm:px-8">
            <button
              type="button"
              onClick={goToList}
              className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-brand"
            >
              <ArrowLeftIcon size={20} weight="bold" />
              {tab}
            </button>
          </div>
          <div className={`px-4 pb-10 sm:px-8 ${onlinePaymentsWizard ? "" : "max-w-3xl"}`}>{detail}</div>
        </>
      )}

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
