import { useEffect, useRef, useState } from "react";
import { Camera, UserCircle, Minus, Plus } from "@phosphor-icons/react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/PageHeader";
import SectionLabel from "../components/SectionLabel";
import ThemeSwitcher from "../components/ThemeSwitcher";
import Button from "../components/Button";
import { useSettings, type SmsNotificationPrefs, type PaymentSmsMode } from "../SettingsContext";
import { SUBSCRIPTION_TIERS } from "../../lib/pricing";
import PhoneNumberInput from "../components/PhoneNumberInput";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-brand" : "bg-line"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-paper shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

/** One labeled setting — a row within a bordered/divided settings panel (see SettingsPanel below),
 * not its own isolated card. A linear list of related fields (rent due day, then grace period, then
 * reminder lead time) reads as one connected form when separated by thin dividers inside a shared
 * panel — the Notifications tab's grid of independent toggle cards is right for a set of unrelated
 * on/off switches, but would fragment a sequential settings form into disconnected boxes instead. */
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="font-display text-[15px] font-bold tracking-tight text-ink">{label}</p>
          {desc && <p className="mt-1 max-w-sm text-xs text-muted">{desc}</p>}
        </div>
        <div className="flex items-center justify-end">{children}</div>
      </div>
    </div>
  );
}

/** Groups a run of Rows into one bordered panel with a thin divider between each — the shared
 * container that gives Row its visual separation, distinct from Notifications' independent cards. */
function SettingsPanel({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line rounded-lg border border-line bg-paper sm:max-w-3xl">{children}</div>;
}

/** +/− stepper for a small day-count/timeframe value (due day, grace period, reminder lead time) —
 * same tactile pattern as the amount stepper in LogPaymentModal/AdjustmentModal, since typing a
 * number for "3 days" is more friction than tapping a couple of times. */
function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex w-full items-stretch overflow-hidden rounded-lg bg-mist">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease"
        className="flex w-12 shrink-0 items-center justify-center text-muted transition-colors hover:bg-line/40 hover:text-ink active:scale-95"
      >
        <Minus size={16} weight="bold" />
      </button>
      <div className="flex flex-1 items-center justify-center py-2.5 text-center text-base font-semibold text-ink">{value}</div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase"
        className="flex w-12 shrink-0 items-center justify-center text-muted transition-colors hover:bg-line/40 hover:text-ink active:scale-95"
      >
        <Plus size={16} weight="bold" />
      </button>
    </div>
  );
}

const fieldCls =
  "w-full max-w-xs rounded-lg border-none bg-mist px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/30";

// MVP: "Statutory" (NAPSA/payroll figures) is commented out along with staff/payroll everywhere
// else — see the note in Sidebar.tsx. Re-add it to this tuple to bring the tab back.
const tabs = ["Property", "Billing & invoicing", "Reminders", "Notifications", "Subscription", "Account"] as const;
type Tab = (typeof tabs)[number];

const tabSlug: Record<Tab, string> = {
  Property: "property",
  "Billing & invoicing": "billing-invoicing",
  Reminders: "reminders",
  Notifications: "notifications",
  Subscription: "subscription",
  Account: "account",
};

function tabFromSlug(slug: string | null): Tab {
  const match = tabs.find((t) => tabSlug[t] === slug?.toLowerCase());
  return match ?? "Property";
}

// The 7 underlying sections, grouped into top-level tabs so the bar doesn't sprawl — related
// settings (billing + reminders, account + notifications + subscription) live together on one
// page instead of behind separate clicks. Each group's URL slug is its first member's, so
// existing deep links ("/settings/property" from SetupChecklist) keep working unchanged. Online
// payments moved to its own page (/online-payments) — see Payouts.tsx.
const tabGroups = [
  { label: "Account", members: ["Property"] as Tab[] },
  { label: "Billing & rent", members: ["Billing & invoicing", "Reminders"] as Tab[] },
  { label: "Notifications", members: ["Notifications"] as Tab[] },
  { label: "System", members: ["Account", "Subscription"] as Tab[] },
] as const;

function groupFor(t: Tab) {
  return tabGroups.find((g) => (g.members as readonly Tab[]).includes(t))!;
}

// SMS is a separate, opt-in channel from in-app notifications (which default on for every event
// and aren't user-configurable) — deliberately no "instant" option
// for payments (that's exactly the "blasting" this was built to avoid); off/hourly/daily only.
const smsNotificationRows: { key: keyof SmsNotificationPrefs; label: string; desc: string }[] = [
  { key: "newMaintenanceReport", label: "New maintenance report", desc: "Sent right away - these are rare enough not to need digesting." },
  { key: "upcomingPayout", label: "Upcoming payout", desc: "A single text the day before your scheduled payout." },
  { key: "overdueEscalated", label: "Overdue tenant escalated to guardian", desc: "Sent once per billing period when a tenant crosses the escalation threshold." },
];

const paymentSmsModes: { value: PaymentSmsMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "hourly_digest", label: "Hourly digest" },
  { value: "daily_digest", label: "Daily digest" },
];

export default function Settings() {
  const navigate = useNavigate();
  // Each section is its own route (/settings/:section) — navigating between them is a real page
  // change, not a shared-component tab flip, so there's no flash of intermediate sections.
  const { section } = useParams<{ section?: string }>();
  const tab = tabFromSlug(section ?? null);
  const activeGroup = groupFor(tab);

  const openTab = (t: Tab) => navigate(`/settings/${tabSlug[t]}`);

  const {
    // invoicesOn, setInvoicesOn, // MVP: invoicing toggle is commented out — see the note above.
    propertyName, setPropertyName, propertyNameChangesRemaining,
    propertyAddress, setPropertyAddress,
    propertyLogoUrl, uploadPropertyLogo,
    billingPeriod,
    dueDay, setDueDay,
    gracePeriodDays, setGracePeriodDays,
    reminderLeadDays, setReminderLeadDays,
    escalationDays, setEscalationDays,
    contactOrder, setContactOrder,
    notificationPhone, setNotificationPhone,
    paymentSmsMode, setPaymentSmsMode,
    smsNotificationPrefs, setSmsNotificationPref,
    sendOnboardingSms, setSendOnboardingSms,
    sendPaymentReceiptSms, setSendPaymentReceiptSms,
    accountEmail, setAccountEmail,
    subscriptionPlan, subscriptionRenewsAt,
    // napsaInsurableEarningsCeiling, setNapsaInsurableEarningsCeiling, // MVP: Statutory tab is commented out.
    // minimumWageReference, setMinimumWageReference,
  } = useSettings();

  const [toast, setToast] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Local draft, committed only on blur — the DB caps property-name changes at 3 total (a
  // trigger, see 20261001000000_locked_settings_fields.sql), counted per actual write. Writing on
  // every keystroke (like every other field on this page does) would burn through that budget the
  // instant someone starts typing a new name.
  const [propertyNameDraft, setPropertyNameDraft] = useState(propertyName);
  useEffect(() => {
    setPropertyNameDraft(propertyName);
  }, [propertyName]);
  // Same "don't commit mid-keystroke" concern as the property name, for a different reason here:
  // committing on every keystroke would set accountEmail to a non-empty (partial) string after the
  // very first character, which immediately disables the field per the locked-once-set rule below.
  const [emailDraft, setEmailDraft] = useState("");
  const commitPropertyName = () => {
    if (propertyNameDraft === propertyName) return;
    setPropertyName(propertyNameDraft)
      .then(() => flash())
      .catch((e) => {
        setPropertyNameDraft(propertyName); // revert the draft — the write didn't take
        flash(e instanceof Error ? e.message : "Couldn't update the property name.");
      });
  };

  const flash = (msg = "Saved") => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1200);
  };

  // Tier is assigned by IPM directly against the property in the backend, not picked here — this
  // just resolves the stored label back to its price for display. Falls back to showing the raw
  // stored string if it doesn't match a known tier label (e.g. legacy free-text values).
  const currentTier = SUBSCRIPTION_TIERS.find((t) => t.label === subscriptionPlan);

  // The settings for whichever section is selected — shared between the mobile push-navigation
  // view and the desktop list-plus-detail layout so it's only written once.
  const detail = (
    <>
      {activeGroup.label === "Account" && (
            <SettingsPanel>
              <Row label="Property photo" desc="Shown in the sidebar and on invoices/receipts.">
                <div className="flex items-center gap-3">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setUploadingLogo(true);
                      uploadPropertyLogo(file)
                        .then(() => flash("Photo updated"))
                        .catch((err) => console.error("Failed to upload property logo", err))
                        .finally(() => setUploadingLogo(false));
                    }}
                  />
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mist">
                    {propertyLogoUrl ? (
                      <img src={propertyLogoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <UserCircle size={30} weight="fill" className="text-muted" />
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Camera size={14} weight="bold" />
                    {uploadingLogo ? "Uploading…" : propertyLogoUrl ? "Change photo" : "Upload photo"}
                  </Button>
                </div>
              </Row>
              <Row
                label="Property name"
                desc={
                  propertyNameChangesRemaining > 0
                    ? `Used across the dashboard - tenants added on the Tenants page are assigned to this property automatically. You can change this ${propertyNameChangesRemaining} more time${propertyNameChangesRemaining === 1 ? "" : "s"}.`
                    : "You've used all 3 name changes for this property - contact us if it needs to change again."
                }
              >
                <input
                  value={propertyNameDraft}
                  onChange={(e) => setPropertyNameDraft(e.target.value)}
                  onBlur={commitPropertyName}
                  disabled={propertyNameChangesRemaining <= 0}
                  className={`${fieldCls} disabled:cursor-not-allowed disabled:opacity-60`}
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
              <Row label="Email address" desc={accountEmail ? "Your email is locked once set — contact us if it needs to change." : undefined}>
                <input
                  value={accountEmail ? accountEmail : emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onBlur={() => {
                    if (!accountEmail && emailDraft.trim()) {
                      setAccountEmail(emailDraft.trim());
                      flash();
                    }
                  }}
                  type="email"
                  placeholder="you@example.com"
                  disabled={!!accountEmail}
                  className={`${fieldCls} disabled:cursor-not-allowed disabled:opacity-60`}
                />
              </Row>
              <Row label="Password">
                <button type="button" className="text-sm font-medium text-brand hover:underline">
                  Change password
                </button>
              </Row>
              <Row
                label="Subscription tier"
                desc={
                  subscriptionRenewsAt
                    ? `Renews ${new Date(subscriptionRenewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Set by IPM at onboarding — contact us to change it.`
                    : "Set by IPM at onboarding — contact us to change it."
                }
              >
                {currentTier ? (
                  <div>
                    <p className="text-sm font-medium text-ink">{currentTier.label}</p>
                    <p className="mt-0.5 text-xs text-muted">K{currentTier.monthlyPriceK}/month</p>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-ink">{subscriptionPlan || "-"}</p>
                )}
              </Row>
            </SettingsPanel>
          )}

          {activeGroup.label === "Billing & rent" && (
            <>
              <SettingsPanel>
                <Row label="Billing period" desc="Fixed at monthly - not configurable.">
                  <p className="text-sm font-medium text-ink">{billingPeriod}</p>
                </Row>
                <Row label="Due date" desc="Day of the month rent is due.">
                  <NumberStepper value={dueDay} onChange={(v) => { setDueDay(v); flash(); }} min={1} max={31} />
                </Row>
                <Row label="Grace period" desc="Days after the due date before rent is marked overdue.">
                  <NumberStepper value={gracePeriodDays} onChange={(v) => { setGracePeriodDays(v); flash(); }} min={0} />
                </Row>
                {/* MVP: invoicing is out of scope for now. */}
                {/* <Row
                  label="Generate invoices"
                  desc="Lets you pre-fill and send invoices for every tenant from the Rent page, including carried-over balances."
                >
                  <Toggle checked={invoicesOn} onChange={(v) => { setInvoicesOn(v); flash(); }} />
                </Row> */}
              </SettingsPanel>
              <div className="pt-5 pb-2">
                <SectionLabel>Reminders</SectionLabel>
              </div>
              <SettingsPanel>
                <Row label="Days before rent is due" desc="How many days ahead of the due date the first reminder is sent.">
                  <NumberStepper value={reminderLeadDays} onChange={(v) => { setReminderLeadDays(v); flash(); }} min={0} />
                </Row>
                <Row label="Days overdue before guardian is contacted" desc="The parent/guardian is contacted automatically after rent is this many days late.">
                  <NumberStepper value={escalationDays} onChange={(v) => { setEscalationDays(v); flash(); }} min={0} />
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
              </SettingsPanel>
              <p className="pt-3 text-xs text-muted">Reminders and guardian escalation are each sent at most once per billing period.</p>
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

          {activeGroup.label === "System" && (
            <SettingsPanel>
              <Row label="Appearance" desc="Switch between light, dark, or match your device.">
                <ThemeSwitcher />
              </Row>
              <Row label="Sign out" desc="You'll need to sign in again on this device.">
                <Button variant="danger" onClick={() => navigate("/sign-in")}>
                  Sign out
                </Button>
              </Row>
            </SettingsPanel>
          )}

          {activeGroup.label === "Notifications" && (
            <>
              <div className="pb-2">
                <SectionLabel>SMS alerts</SectionLabel>
              </div>
              <SettingsPanel>
                <Row label="Alert phone number" desc="Where SMS alerts are sent.">
                  <PhoneNumberInput
                    value={notificationPhone}
                    onChange={(v) => { setNotificationPhone(v); flash(); }}
                  />
                </Row>
                <Row label="Payment summaries" desc="Sends an SMS only when there's new payment activity - payments are grouped into a summary, never sent one by one.">
                  <div className="flex gap-2">
                    {paymentSmsModes.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => { setPaymentSmsMode(m.value); flash(); }}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          paymentSmsMode === m.value ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </Row>
              </SettingsPanel>
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 pt-4 sm:grid-cols-2">
                {smsNotificationRows.map((n) => (
                  <div key={n.key} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-paper p-4">
                    <div className="min-w-0">
                      <p className="font-display text-[15px] font-bold tracking-tight text-ink">{n.label}</p>
                      {n.desc && <p className="mt-1 text-xs text-muted">{n.desc}</p>}
                    </div>
                    <Toggle checked={smsNotificationPrefs[n.key]} onChange={(v) => { setSmsNotificationPref(n.key, v); flash(); }} />
                  </div>
                ))}
              </div>

              <div className="pt-6 pb-2">
                <SectionLabel>Tenant messages</SectionLabel>
              </div>
              <SettingsPanel>
                <Row label="Welcome SMS for new tenants" desc="Sends the tenant a welcome message with their portal link when they're added.">
                  <Toggle checked={sendOnboardingSms} onChange={(v) => { setSendOnboardingSms(v); flash(); }} />
                </Row>
                <Row label="Payment receipt SMS" desc="Sends the tenant a receipt with their new outstanding balance after any payment - online or logged manually.">
                  <Toggle checked={sendPaymentReceiptSms} onChange={(v) => { setSendPaymentReceiptSms(v); flash(); }} />
                </Row>
              </SettingsPanel>
            </>
          )}
    </>
  );

  return (
    <>
      <PageHeader title="Settings" description="Manage your property, billing, and account preferences." />

      {/* Persistent tab bar — every section is one click away instead of a list-then-back flow.
          overflow-x-auto lets it scroll on narrow screens rather than wrap. No animation on the
          active-tab indicator — just a static underline on whichever button is current. */}
      <div className="overflow-x-auto border-b border-line px-4 sm:px-8">
        <div className="flex items-center gap-1">
          {tabGroups.map((g) => (
            <button
              key={g.label}
              type="button"
              onClick={() => openTab(g.members[0])}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap ${
                activeGroup.label === g.label ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-6 pb-10 sm:px-8 max-w-3xl">{detail}</div>

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
