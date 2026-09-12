import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/PageHeader";
import SectionLabel from "../components/SectionLabel";
import ThemeSwitcher from "../components/ThemeSwitcher";
import Button from "../components/Button";
import { useSettings, type NotificationPrefs } from "../SettingsContext";

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
const tabs = ["Property", "Billing & invoicing", "Reminders", "Payment link", "Notifications", "Subscription", "Account"] as const;
type Tab = (typeof tabs)[number];

const tabSlug: Record<Tab, string> = {
  Property: "property",
  "Billing & invoicing": "billing-invoicing",
  Reminders: "reminders",
  "Payment link": "payment-link",
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
  { label: "Payment link", members: ["Payment link"] as Tab[] },
  { label: "Notifications", members: ["Notifications"] as Tab[] },
  { label: "System", members: ["Account", "Subscription"] as Tab[] },
] as const;

function groupFor(t: Tab) {
  return tabGroups.find((g) => (g.members as readonly Tab[]).includes(t))!;
}

const notificationRows: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
  { key: "newPayment", label: "New payment received", desc: "A tenant's rent payment is logged." },
  { key: "newMaintenanceReport", label: "New maintenance report", desc: "A tenant or you log a new maintenance issue." },
  { key: "upcomingPayout", label: "Upcoming payout", desc: "Your scheduled bank payout is a day away." },
  { key: "overdueEscalated", label: "Overdue tenant escalated to guardian", desc: "A tenant crosses the escalation threshold and their guardian is contacted." },
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
    propertyName, setPropertyName,
    propertyAddress, setPropertyAddress,
    billingPeriod, setBillingPeriod,
    dueDay, setDueDay,
    gracePeriodDays, setGracePeriodDays,
    reminderLeadDays, setReminderLeadDays,
    escalationDays, setEscalationDays,
    contactOrder, setContactOrder,
    notificationPrefs, setNotificationPref,
    accountEmail, setAccountEmail,
    subscriptionPlan, subscriptionRenewsAt,
    // napsaInsurableEarningsCeiling, setNapsaInsurableEarningsCeiling, // MVP: Statutory tab is commented out.
    // minimumWageReference, setMinimumWageReference,
  } = useSettings();

  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg = "Saved") => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1200);
  };

  // The settings for whichever section is selected — shared between the mobile push-navigation
  // view and the desktop list-plus-detail layout so it's only written once.
  const detail = (
    <>
      {activeGroup.label === "Account" && (
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
              {/* MVP: invoicing is out of scope for now. */}
              {/* <Row
                label="Generate invoices"
                desc="Lets you pre-fill and send invoices for every tenant from the Rent page, including carried-over balances."
              >
                <Toggle checked={invoicesOn} onChange={(v) => { setInvoicesOn(v); flash(); }} />
              </Row> */}
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

          {activeGroup.label === "Payment link" && (
            <>
              <Row label="Payment links are per tenant now" desc="There's no single shared link or QR code anymore — each tenant gets their own short, personal payment link, reachable from their profile page.">
                <Link
                  to="/tenants"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                >
                  Go to Tenants →
                </Link>
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

          {activeGroup.label === "System" && (
            <>
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

          {activeGroup.label === "Notifications" && (
            <>
              <p className="pb-4 text-xs text-muted">Choose which events send you a push notification or email.</p>
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                {notificationRows.map((n) => (
                  <div key={n.key} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-paper p-4">
                    <div className="min-w-0">
                      <p className="font-display text-[15px] font-bold tracking-tight text-ink">{n.label}</p>
                      {n.desc && <p className="mt-1 text-xs text-muted">{n.desc}</p>}
                    </div>
                    <Toggle checked={notificationPrefs[n.key]} onChange={(v) => { setNotificationPref(n.key, v); flash(); }} />
                  </div>
                ))}
              </div>
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
