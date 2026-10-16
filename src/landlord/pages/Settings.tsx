import { useEffect, useRef, useState } from "react";
import LocationPicker from "../../components/LocationPicker";
import { Camera, UserCircle, Minus, Plus, ArrowRight, Buildings, IdentificationCard, CalendarBlank, Coins, BellRinging, Lightning, ListChecks, ChatCircleText, EnvelopeSimple, PaintBrush, CreditCard, ClockCounterClockwise, type Icon } from "@phosphor-icons/react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import SectionLabel from "../components/SectionLabel";
import ThemeSwitcher from "../components/ThemeSwitcher";
import Button from "../components/Button";
import Modal from "../components/Modal";
import ChangePasswordModal from "../components/ChangePasswordModal";
import { useToast } from "../ToastContext";
import { useSettings, type SmsNotificationPrefs, type PaymentSmsMode } from "../SettingsContext";
import type { LateFeeMode } from "../invoiceUtils";
import { getPlanTier, tierFromStoredLabel } from "../../lib/plans";
import TierBadge from "../components/TierBadge";
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
function Row({ label, desc, stack = false, children }: { label: string; desc?: string; stack?: boolean; children: React.ReactNode }) {
  return (
    <div className={`py-3.5 ${stack ? "space-y-2.5" : "flex items-center justify-between gap-4"}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{label}</p>
        {desc && <p className="mt-0.5 text-xs leading-5 text-muted">{desc}</p>}
      </div>
      <div className={stack ? "" : "flex shrink-0 items-center justify-end"}>{children}</div>
    </div>
  );
}

/** Groups a run of Rows into one bordered panel with a thin divider between each — the shared
 * container that gives Row its visual separation, distinct from Notifications' independent cards. */
function SettingsPanel({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line/60">{children}</div>;
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
  "w-full rounded-lg border-none bg-mist px-3.5 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-brand/30";

// Settings is a grid of cards (one per feature) instead of tabs: each card has a title and a one-line
// description, shows a live summary of its current value, and opens its controls in a modal.
// Slugs from the old tab layout still resolve (SetupChecklist -> /settings/property,
// NotificationsPanel -> /settings/notifications) so existing deep links keep working.
type CardKey = "property" | "account" | "rent" | "latefees" | "reminders" | "autopilot" | "tasks" | "sms" | "tenantmsgs" | "appearance";

const slugToCard: Record<string, CardKey> = {
  property: "property",
  account: "account",
  subscription: "account",
  rent: "rent",
  "billing-invoicing": "rent",
  latefees: "latefees",
  reminders: "reminders",
  autopilot: "autopilot",
  tasks: "tasks",
  sms: "sms",
  notifications: "sms",
  tenantmsgs: "tenantmsgs",
  appearance: "appearance",
};

function cardFromSlug(slug: string | undefined): CardKey | null {
  return slug ? slugToCard[slug.toLowerCase()] ?? null : null;
}

// A link card looks identical to a modal card but navigates straight to its own page instead of
// opening a section modal here — used for Billing and the Activity log, which already live on
// routes of their own (moved out of the main sidebar into Settings, see Task #12/billing cleanup).
type SettingsCard =
  | { key: CardKey; title: string; desc: string; icon: Icon; to?: undefined }
  | { key: "billing" | "activitylog"; title: string; desc: string; icon: Icon; to: string };

const cardGroups: { label: string; cards: SettingsCard[] }[] = [
  {
    label: "Property & account",
    cards: [
      { key: "property", title: "Property profile", desc: "Your property's photo, name and address as they appear on invoices and receipts.", icon: Buildings },
      { key: "account", title: "Account & plan", desc: "Your sign-in email, password and current subscription plan.", icon: IdentificationCard },
    ],
  },
  {
    label: "Rent & billing",
    cards: [
      { key: "rent", title: "Rent schedule", desc: "The day rent is due and how many grace days tenants get before it counts as overdue.", icon: CalendarBlank },
      { key: "latefees", title: "Late fees", desc: "Whether to charge a fee on overdue rent, how it is calculated and an optional cap.", icon: Coins },
    ],
  },
  {
    label: "Reminders & tasks",
    cards: [
      { key: "autopilot", title: "Autopilot", desc: "Let the system chase late rent for you and only tell you when a tenant needs a personal call.", icon: Lightning },
      { key: "reminders", title: "Tenant reminders", desc: "Pre-due text reminders, guardian escalation and who is contacted first.", icon: BellRinging },
      { key: "tasks", title: "Needs your attention", desc: "Choose which events automatically add a task to your Needs your attention list.", icon: ListChecks },
    ],
  },
  {
    label: "Messages",
    cards: [
      { key: "sms", title: "SMS alerts to you", desc: "The phone that gets alerts, payment summaries and which events text you.", icon: ChatCircleText },
      { key: "tenantmsgs", title: "Messages to tenants", desc: "Welcome text with the portal link for new tenants, and payment receipts.", icon: EnvelopeSimple },
    ],
  },
  {
    label: "Preferences",
    cards: [{ key: "appearance", title: "Appearance & sign out", desc: "Light, dark or device theme, and signing out of this device.", icon: PaintBrush }],
  },
  {
    label: "More",
    cards: [
      { key: "billing", title: "Billing", desc: "Your subscription invoices and payment history.", icon: CreditCard, to: "/billing" },
      { key: "activitylog", title: "Activity log", desc: "A record of every action taken on this account, and who did it.", icon: ClockCounterClockwise, to: "/activity-log" },
    ],
  },
];

// SMS is a separate, opt-in channel from in-app notifications (which default on for every event
// and aren't user-configurable) — deliberately no "instant" option
// for payments (that's exactly the "blasting" this was built to avoid); off/hourly/daily only.
const smsNotificationRows: { key: keyof SmsNotificationPrefs; label: string; desc: string }[] = [
  { key: "newMaintenanceReport", label: "New maintenance report", desc: "Sent right away - these are rare enough not to need digesting." },
  { key: "overdueEscalated", label: "Overdue tenant escalated to guardian", desc: "Sent once per billing period when a tenant crosses the escalation threshold." },
];

const paymentSmsModes: { value: PaymentSmsMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "hourly_digest", label: "Hourly digest" },
  { value: "daily_digest", label: "Daily digest" },
];

export default function Settings() {
  const navigate = useNavigate();
  // /settings/:section deep-links straight into a card's modal; closing it returns to /settings.
  const { section } = useParams<{ section?: string }>();
  const openKey = cardFromSlug(section);
  const openCard = (k: CardKey) => navigate(`/settings/${k}`);
  const closeCard = () => navigate("/settings");
  // Lives in the URL (/settings/password) rather than component state: the page remounts when the
  // route changes, which wiped a state flag the moment the Account card closed.
  const changingPassword = section === "password";

  const {
    // invoicesOn, setInvoicesOn, // MVP: invoicing toggle is commented out — see the note above.
    propertyName, setPropertyName, propertyNameChangesRemaining,
    propertyAddress: livePropertyAddress, setPropertyAddress: commitPropertyAddress,
    propertyCoords: livePropertyCoords, setPropertyCoords: commitPropertyCoords,
    propertyLogoUrl, uploadPropertyLogo,
    billingPeriod,
    dueDay: liveDueDay, setDueDay: commitDueDay,
    gracePeriodDays: liveGracePeriodDays, setGracePeriodDays: commitGracePeriodDays,
    dailyPenaltyRate: liveDailyPenaltyRate, setDailyPenaltyRate: commitDailyPenaltyRate,
    lateFeeEnabled: liveLateFeeEnabled, setLateFeeEnabled: commitLateFeeEnabled,
    lateFeeMode: liveLateFeeMode, setLateFeeMode: commitLateFeeMode,
    lateFeePercent: liveLateFeePercent, setLateFeePercent: commitLateFeePercent,
    lateFeeCapEnabled: liveLateFeeCapEnabled, setLateFeeCapEnabled: commitLateFeeCapEnabled,
    lateFeeCapAmount: liveLateFeeCapAmount, setLateFeeCapAmount: commitLateFeeCapAmount,
    reminderLeadDays: liveReminderLeadDays, setReminderLeadDays: commitReminderLeadDays,
    escalationDays: liveEscalationDays, setEscalationDays: commitEscalationDays,
    contactOrder: liveContactOrder, setContactOrder: commitContactOrder,
    preDueRemindersEnabled: livePreDueRemindersEnabled, setPreDueRemindersEnabled: commitPreDueRemindersEnabled,
    escalationEnabled: liveEscalationEnabled, setEscalationEnabled: commitEscalationEnabled,
    autopilotEnabled: liveAutopilotEnabled, setAutopilotEnabled: commitAutopilotEnabled,
    autopilotConfig: liveAutopilotConfig, setAutopilotConfig: commitAutopilotConfig,
    taskOverdueRentEnabled: liveTaskOverdueRentEnabled, setTaskOverdueRentEnabled: commitTaskOverdueRentEnabled,
    taskStaleMaintenanceEnabled: liveTaskStaleMaintenanceEnabled, setTaskStaleMaintenanceEnabled: commitTaskStaleMaintenanceEnabled,
    taskCollectionsTargetEnabled: liveTaskCollectionsTargetEnabled, setTaskCollectionsTargetEnabled: commitTaskCollectionsTargetEnabled,
    notificationPhone: liveNotificationPhone, setNotificationPhone: commitNotificationPhone,
    paymentSmsMode: livePaymentSmsMode, setPaymentSmsMode: commitPaymentSmsMode,
    smsNotificationPrefs: liveSmsPrefs, setSmsNotificationPref: commitSmsPref,
    sendOnboardingSms: liveSendOnboardingSms, setSendOnboardingSms: commitSendOnboardingSms,
    sendPaymentReceiptSms: liveSendPaymentReceiptSms, setSendPaymentReceiptSms: commitSendPaymentReceiptSms,
    accountEmail, setAccountEmail,
    subscriptionPlan, subscriptionRenewsAt,
    // napsaInsurableEarningsCeiling, setNapsaInsurableEarningsCeiling, // MVP: Statutory tab is commented out.
    // minimumWageReference, setMinimumWageReference,
  } = useSettings();

  const { showToast } = useToast();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Nothing here is written until the modal's Save button is pressed: edits are staged in `draft`
  // (and the two text drafts below) and discarded if the modal is closed any other way. The names
  // below shadow the live values from useSettings, so the form JSX reads and writes the draft.
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const stage = (k: string, v: unknown) => setDraft((p) => ({ ...p, [k]: v }));
  const pick = <T,>(k: string, live: T): T => (k in draft ? (draft[k] as T) : live);
  const dueDay = pick("dueDay", liveDueDay);
  const setDueDay = (v: typeof liveDueDay) => stage("dueDay", v);
  const gracePeriodDays = pick("gracePeriodDays", liveGracePeriodDays);
  const setGracePeriodDays = (v: typeof liveGracePeriodDays) => stage("gracePeriodDays", v);
  const dailyPenaltyRate = pick("dailyPenaltyRate", liveDailyPenaltyRate);
  const setDailyPenaltyRate = (v: typeof liveDailyPenaltyRate) => stage("dailyPenaltyRate", v);
  const lateFeeEnabled = pick("lateFeeEnabled", liveLateFeeEnabled);
  const setLateFeeEnabled = (v: typeof liveLateFeeEnabled) => stage("lateFeeEnabled", v);
  const lateFeeMode = pick("lateFeeMode", liveLateFeeMode);
  const setLateFeeMode = (v: typeof liveLateFeeMode) => stage("lateFeeMode", v);
  const lateFeePercent = pick("lateFeePercent", liveLateFeePercent);
  const setLateFeePercent = (v: typeof liveLateFeePercent) => stage("lateFeePercent", v);
  const lateFeeCapEnabled = pick("lateFeeCapEnabled", liveLateFeeCapEnabled);
  const setLateFeeCapEnabled = (v: typeof liveLateFeeCapEnabled) => stage("lateFeeCapEnabled", v);
  const lateFeeCapAmount = pick("lateFeeCapAmount", liveLateFeeCapAmount);
  const setLateFeeCapAmount = (v: typeof liveLateFeeCapAmount) => stage("lateFeeCapAmount", v);
  const reminderLeadDays = pick("reminderLeadDays", liveReminderLeadDays);
  const setReminderLeadDays = (v: typeof liveReminderLeadDays) => stage("reminderLeadDays", v);
  const escalationDays = pick("escalationDays", liveEscalationDays);
  const setEscalationDays = (v: typeof liveEscalationDays) => stage("escalationDays", v);
  const contactOrder = pick("contactOrder", liveContactOrder);
  const setContactOrder = (v: typeof liveContactOrder) => stage("contactOrder", v);
  const preDueRemindersEnabled = pick("preDueRemindersEnabled", livePreDueRemindersEnabled);
  const setPreDueRemindersEnabled = (v: typeof livePreDueRemindersEnabled) => stage("preDueRemindersEnabled", v);
  const escalationEnabled = pick("escalationEnabled", liveEscalationEnabled);
  const setEscalationEnabled = (v: typeof liveEscalationEnabled) => stage("escalationEnabled", v);
  const autopilotEnabled = pick("autopilotEnabled", liveAutopilotEnabled);
  const setAutopilotEnabled = (v: typeof liveAutopilotEnabled) => stage("autopilotEnabled", v);
  const autopilotConfig = pick("autopilotConfig", liveAutopilotConfig);
  const setAutopilotConfig = (v: typeof liveAutopilotConfig) => stage("autopilotConfig", v);
  const taskOverdueRentEnabled = pick("taskOverdueRentEnabled", liveTaskOverdueRentEnabled);
  const setTaskOverdueRentEnabled = (v: typeof liveTaskOverdueRentEnabled) => stage("taskOverdueRentEnabled", v);
  const taskStaleMaintenanceEnabled = pick("taskStaleMaintenanceEnabled", liveTaskStaleMaintenanceEnabled);
  const setTaskStaleMaintenanceEnabled = (v: typeof liveTaskStaleMaintenanceEnabled) => stage("taskStaleMaintenanceEnabled", v);
  const taskCollectionsTargetEnabled = pick("taskCollectionsTargetEnabled", liveTaskCollectionsTargetEnabled);
  const setTaskCollectionsTargetEnabled = (v: typeof liveTaskCollectionsTargetEnabled) => stage("taskCollectionsTargetEnabled", v);
  const notificationPhone = pick("notificationPhone", liveNotificationPhone);
  const setNotificationPhone = (v: typeof liveNotificationPhone) => stage("notificationPhone", v);
  const paymentSmsMode = pick("paymentSmsMode", livePaymentSmsMode);
  const setPaymentSmsMode = (v: typeof livePaymentSmsMode) => stage("paymentSmsMode", v);
  const sendOnboardingSms = pick("sendOnboardingSms", liveSendOnboardingSms);
  const setSendOnboardingSms = (v: typeof liveSendOnboardingSms) => stage("sendOnboardingSms", v);
  const sendPaymentReceiptSms = pick("sendPaymentReceiptSms", liveSendPaymentReceiptSms);
  const setSendPaymentReceiptSms = (v: typeof liveSendPaymentReceiptSms) => stage("sendPaymentReceiptSms", v);
  const propertyAddress = pick("propertyAddress", livePropertyAddress);
  const setPropertyAddress = (v: typeof livePropertyAddress) => stage("propertyAddress", v);
  const propertyCoords = pick("propertyCoords", livePropertyCoords);
  const setPropertyCoords = (v: typeof livePropertyCoords) => stage("propertyCoords", v);
  const smsNotificationPrefs: SmsNotificationPrefs = { ...liveSmsPrefs };
  for (const k of Object.keys(liveSmsPrefs) as (keyof SmsNotificationPrefs)[]) {
    if (`sms:${k}` in draft) smsNotificationPrefs[k] = draft[`sms:${k}`] as boolean;
  }
  const setSmsNotificationPref = (k: keyof SmsNotificationPrefs, v: boolean) => stage(`sms:${k}`, v);

  // The property name is capped at 3 changes total (a DB trigger counts each write), and the email is
  // locked once set, so both stay as local text drafts and are only written on Save.
  const [propertyNameDraft, setPropertyNameDraft] = useState(propertyName);
  const [emailDraft, setEmailDraft] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPropertyNameDraft(propertyName);
  }, [propertyName]);
  useEffect(() => {
    // A different card (or none) is open: throw away anything that was not saved.
    setDraft({});
    setPropertyNameDraft(propertyName);
    setEmailDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  const dirty = Object.keys(draft).length > 0 || propertyNameDraft !== propertyName || (!accountEmail && emailDraft.trim() !== "");

  const saveCard = async () => {
    setSaving(true);
    try {
      if (propertyNameDraft !== propertyName) await setPropertyName(propertyNameDraft);
      if (!accountEmail && emailDraft.trim()) setAccountEmail(emailDraft.trim());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commit: Record<string, (v: any) => void> = {
        dueDay: commitDueDay,
        gracePeriodDays: commitGracePeriodDays,
        dailyPenaltyRate: commitDailyPenaltyRate,
        lateFeeEnabled: commitLateFeeEnabled,
        lateFeeMode: commitLateFeeMode,
        lateFeePercent: commitLateFeePercent,
        lateFeeCapEnabled: commitLateFeeCapEnabled,
        lateFeeCapAmount: commitLateFeeCapAmount,
        reminderLeadDays: commitReminderLeadDays,
        escalationDays: commitEscalationDays,
        contactOrder: commitContactOrder,
        preDueRemindersEnabled: commitPreDueRemindersEnabled,
        escalationEnabled: commitEscalationEnabled,
        autopilotEnabled: commitAutopilotEnabled,
        autopilotConfig: commitAutopilotConfig,
        taskOverdueRentEnabled: commitTaskOverdueRentEnabled,
        taskStaleMaintenanceEnabled: commitTaskStaleMaintenanceEnabled,
        taskCollectionsTargetEnabled: commitTaskCollectionsTargetEnabled,
        notificationPhone: commitNotificationPhone,
        paymentSmsMode: commitPaymentSmsMode,
        sendOnboardingSms: commitSendOnboardingSms,
        sendPaymentReceiptSms: commitSendPaymentReceiptSms,
        propertyAddress: commitPropertyAddress,
        propertyCoords: commitPropertyCoords,
      };
      for (const [k, v] of Object.entries(draft)) {
        if (k.startsWith("sms:")) commitSmsPref(k.slice(4) as keyof SmsNotificationPrefs, v as boolean);
        else commit[k]?.(v);
      }
      showToast("Settings saved", "success");
      closeCard();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't save your settings, please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Tier is assigned by IPM directly against the property in the backend, not picked here — this
  // just resolves the stored label back to its price for display. Falls back to showing the raw
  // stored string if it doesn't match a known tier label (e.g. legacy free-text values).
  const currentTier = getPlanTier(tierFromStoredLabel(subscriptionPlan));

  const lateFeeLabel = { prorated_rent: "Rent ÷ days/month", fixed: "Fixed per day", percent_of_rent: "% of rent per day" }[lateFeeMode];
  const tasksOn = [taskOverdueRentEnabled, taskStaleMaintenanceEnabled, taskCollectionsTargetEnabled].filter(Boolean).length;
  const tenantMsgsOn = [sendOnboardingSms, sendPaymentReceiptSms].filter(Boolean).length;

  const summaries: Record<CardKey, string> = {
    property: propertyName || "Not set",
    account: subscriptionPlan || "Plan not set",
    rent: `Due on day ${dueDay}, ${gracePeriodDays} grace day${gracePeriodDays === 1 ? "" : "s"}`,
    latefees: lateFeeEnabled ? `On, ${lateFeeLabel}` : "Off",
    autopilot: autopilotEnabled ? `On, hand over after ${autopilotConfig.handover_day} days` : "Off",
    reminders: preDueRemindersEnabled ? `On, ${reminderLeadDays} day${reminderLeadDays === 1 ? "" : "s"} before due` : "Pre-due reminders off",
    tasks: `${tasksOn} of 3 on`,
    sms: paymentSmsModes.find((m) => m.value === paymentSmsMode)?.label
      ? `Payment summaries: ${paymentSmsModes.find((m) => m.value === paymentSmsMode)!.label}`
      : "Not set",
    tenantmsgs: `${tenantMsgsOn} of 2 on`,
    appearance: "Theme and sign out",
  };

  const cardContent: Record<CardKey, React.ReactNode> = {
    property: <SettingsPanel>
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
                        .then(() => showToast("Photo updated", "success"))
                        .catch((err) => {
                          console.error("Failed to upload property logo", err);
                          showToast("Couldn't upload that photo, please try again.", "error");
                        })
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
                stack
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
                  disabled={propertyNameChangesRemaining <= 0}
                  className={`${fieldCls} disabled:cursor-not-allowed disabled:opacity-60`}
                />
              </Row>
              <Row stack label="Address" desc="Shown on invoices, in the From section.">
                <LocationPicker
                  value={{ address: propertyAddress, lat: propertyCoords.lat, lng: propertyCoords.lng }}
                  onChange={(l) => {
                    setPropertyAddress(l.address);
                    setPropertyCoords({ lat: l.lat, lng: l.lng });
                  }}
                  inputClassName={fieldCls}
                />
              </Row>
              </SettingsPanel>,
    account: <SettingsPanel>
<Row stack label="Email address" desc={accountEmail ? "Your email is locked once set, contact us if it needs to change." : undefined}>
                <input
                  value={accountEmail ? accountEmail : emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  disabled={!!accountEmail}
                  className={`${fieldCls} disabled:cursor-not-allowed disabled:opacity-60`}
                />
              </Row>
              <Row label="Password" desc="Use at least 8 characters with letters and numbers.">
                <Button variant="secondary" size="sm" onClick={() => navigate("/settings/password")}>
                  Change password
                </Button>
              </Row>
              <Row
                label="Subscription tier"
                desc={
                  subscriptionRenewsAt
                    ? `Renews ${new Date(subscriptionRenewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Set by IPM at onboarding, contact us to change it.`
                    : "Set by IPM at onboarding, contact us to change it."
                }
              >
                <div className="flex flex-col items-start gap-1.5">
                  <p className="text-xs text-muted">{currentTier.bedRange} · K{currentTier.monthlyPrice}/month</p>
                  <TierBadge plan={subscriptionPlan} />
                  <Button variant="outline" size="sm" className="mt-1" onClick={() => navigate("/billing")}>
                    Manage billing
                  </Button>
                </div>
              </Row>
            </SettingsPanel>,
    rent: <SettingsPanel>
<Row label="Billing period" desc="Fixed at monthly - not configurable.">
                  <p className="text-sm font-medium text-ink">{billingPeriod}</p>
                </Row>
                <Row label="Due date" desc="Day of the month rent is due.">
                  <NumberStepper value={dueDay} onChange={(v) => { setDueDay(v); }} min={1} max={31} />
                </Row>
                <Row label="Grace period" desc="Days after the due date before rent is marked overdue.">
                  <NumberStepper value={gracePeriodDays} onChange={(v) => { setGracePeriodDays(v); }} min={0} />
                </Row>
                {/* MVP: invoicing is out of scope for now. */}
                {/* <Row
                  label="Generate invoices"
                  desc="Lets you pre-fill and send invoices for every tenant from the Rent page, including carried-over balances."
                >
                  <Toggle checked={invoicesOn} onChange={(v) => { setInvoicesOn(v); }} />
                </Row> */}
              </SettingsPanel>,
    latefees: <SettingsPanel>
<Row label="Charge late fees" desc="Automatically add a fee once a tenant's rent goes overdue. Off if this property doesn't do late fees.">
                  <Toggle checked={lateFeeEnabled} onChange={(v) => { setLateFeeEnabled(v); }} />
                </Row>
                {lateFeeEnabled && (
                  <>
                    <Row stack label="Calculation" desc="How the late fee accrues once a charge is overdue, applied automatically each day.">
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { v: "prorated_rent", label: "Rent ÷ days/month" },
                            { v: "fixed", label: "Fixed per day" },
                            { v: "percent_of_rent", label: "% of rent per day" },
                          ] as const
                        ).map((o) => (
                          <button
                            key={o.v}
                            type="button"
                            onClick={() => { setLateFeeMode(o.v as LateFeeMode); }}
                            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                              lateFeeMode === o.v ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </Row>
                    {lateFeeMode === "fixed" && (
                      <Row label="Amount per day" desc="Flat charge added for every day a tenant stays overdue.">
                        <NumberStepper value={dailyPenaltyRate} onChange={(v) => { setDailyPenaltyRate(v); }} min={0} />
                      </Row>
                    )}
                    {lateFeeMode === "percent_of_rent" && (
                      <Row label="Percent per day" desc="Share of the tenant's monthly rent added for every day overdue.">
                        <NumberStepper value={lateFeePercent} onChange={(v) => { setLateFeePercent(v); }} min={0} max={100} />
                      </Row>
                    )}
                    {lateFeeMode === "prorated_rent" && (
                      <Row label="Daily rate" desc="Automatically derived from each tenant's own rent — no separate rate to set.">
                        <p className="text-sm font-medium text-muted">Rent ÷ days in month</p>
                      </Row>
                    )}
                    <Row label="Cap total fee" desc="Stop the late fee from growing once it reaches a maximum.">
                      <Toggle checked={lateFeeCapEnabled} onChange={(v) => { setLateFeeCapEnabled(v); }} />
                    </Row>
                    {lateFeeCapEnabled && (
                      <Row label="Maximum fee" desc="The late fee never exceeds this amount, no matter how overdue a tenant is.">
                        <NumberStepper value={lateFeeCapAmount ?? 0} onChange={(v) => { setLateFeeCapAmount(v); }} min={0} />
                      </Row>
                    )}
                  </>
                )}
              </SettingsPanel>,
    autopilot: (
      <>
        <SettingsPanel>
          <Row label="Autopilot" desc="Reminders go out on a schedule and stop the moment a tenant pays. You are only told when someone needs you.">
            <Toggle checked={autopilotEnabled} onChange={(v) => { setAutopilotEnabled(v); if (v) setEscalationEnabled(false); }} />
          </Row>
          {autopilotEnabled && (
            <>
              <Row label="Hand over to me after" desc="Days overdue, counted from the due date, before a tenant appears in Needs your attention and you get a text.">
                <NumberStepper
                  value={autopilotConfig.handover_day}
                  onChange={(v) => { setAutopilotConfig({ ...autopilotConfig, handover_day: v }); }}
                  min={3}
                  max={60}
                />
              </Row>
              <Row label="Contact the guardian" desc="Off by default. When on, the guardian gets a short message a few days after a tenant has been handed over to you, never before.">
                <Toggle
                  checked={autopilotConfig.guardian_enabled}
                  onChange={(v) => { setAutopilotConfig({ ...autopilotConfig, guardian_enabled: v }); }}
                />
              </Row>
              <Row label="Weekly reminder after final notice" desc="Keep sending a short reminder every 7 days until the tenant pays.">
                <Toggle
                  checked={autopilotConfig.weekly_repeat}
                  onChange={(v) => { setAutopilotConfig({ ...autopilotConfig, weekly_repeat: v }); }}
                />
              </Row>
            </>
          )}
        </SettingsPanel>
        <div className="space-y-1.5 pt-3 text-xs text-muted">
          <p>Schedule: a friendly reminder before the due date (see Tenant reminders), then on the due day and on days 1, 3, 7 and 14 late.</p>
          <p>Messages are sent between 08:00 and 19:00, at most one per tenant per day. Pause a single tenant from their profile.</p>
        </div>
      </>
    ),
    reminders: (
      <>
        <SettingsPanel>
<Row label="Send pre-due reminders" desc="Turn this on to automatically remind tenants by text a few days before rent is due.">
                  <Toggle checked={preDueRemindersEnabled} onChange={(v) => { setPreDueRemindersEnabled(v); }} />
                </Row>
                {preDueRemindersEnabled && (
                  <Row label="Days before rent is due" desc="How many days before the due date that first reminder goes out.">
                    <NumberStepper value={reminderLeadDays} onChange={(v) => { setReminderLeadDays(v); }} min={0} />
                  </Row>
                )}
                {autopilotEnabled ? (
                  <Row label="Guardian contact" desc="Autopilot is on, so it decides when a guardian is contacted.">
                    <button
                      type="button"
                      onClick={() => openCard("autopilot")}
                      className="text-sm font-medium text-brand transition-colors hover:text-ink"
                    >
                      Open Autopilot
                    </button>
                  </Row>
                ) : (
                  <>
                    <Row label="Escalate to guardian" desc="Turn this on to automatically text the tenant's guardian once rent is significantly overdue.">
                      <Toggle checked={escalationEnabled} onChange={(v) => { setEscalationEnabled(v); }} />
                    </Row>
                    {escalationEnabled && (
                      <Row label="Days overdue before contacting guardian" desc="How many days late rent has to be before the guardian is contacted.">
                        <NumberStepper value={escalationDays} onChange={(v) => { setEscalationDays(v); }} min={0} />
                      </Row>
                    )}
                  </>
                )}
                <Row stack label="Contact order" desc="Who gets reminded first when rent is due.">
                  <div className="flex gap-2">
                    {(["student", "guardian"] as const).map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => { setContactOrder(o); }}
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
    ),
    tasks: <SettingsPanel>
<Row label="Overdue rent tasks" desc="Turn this on to automatically add a task whenever a tenant falls overdue on rent.">
                  <Toggle checked={taskOverdueRentEnabled} onChange={(v) => { setTaskOverdueRentEnabled(v); }} />
                </Row>
                <Row label="Stale maintenance tasks" desc="Turn this on to automatically add a task when a maintenance report has been sitting unresolved too long.">
                  <Toggle checked={taskStaleMaintenanceEnabled} onChange={(v) => { setTaskStaleMaintenanceEnabled(v); }} />
                </Row>
                <Row label="Collections below target tasks" desc="Turn this on to automatically add a task when this month's collections fall short of your target.">
                  <Toggle checked={taskCollectionsTargetEnabled} onChange={(v) => { setTaskCollectionsTargetEnabled(v); }} />
                </Row>
              </SettingsPanel>,
    sms: (
      <>
        <SettingsPanel>
<Row stack label="Alert phone number" desc="Where SMS alerts are sent.">
                  <PhoneNumberInput
                    value={notificationPhone}
                    onChange={(v) => { setNotificationPhone(v); }}
                  />
                </Row>
                <Row stack label="Payment summaries" desc="Get an SMS summary of new payments instead of one text per payment.">
                  <div className="flex gap-2">
                    {paymentSmsModes.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => { setPaymentSmsMode(m.value); }}
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
              <div className="space-y-2 pt-3">
                {smsNotificationRows.map((n) => (
                  <div key={n.key} className="flex items-start justify-between gap-3 rounded-lg bg-mist px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{n.label}</p>
                      {n.desc && <p className="mt-1 text-xs text-muted">{n.desc}</p>}
                    </div>
                    <Toggle checked={smsNotificationPrefs[n.key]} onChange={(v) => { setSmsNotificationPref(n.key, v); }} />
                  </div>
                ))}
              </div>

              
      </>
    ),
    tenantmsgs: <SettingsPanel>
<Row label="Welcome SMS for new tenants" desc="Turn this on to automatically text a new tenant their portal link as soon as they're added.">
                  <Toggle checked={sendOnboardingSms} onChange={(v) => { setSendOnboardingSms(v); }} />
                </Row>
                <Row label="Payment receipt SMS" desc="Turn this on to automatically text a tenant a receipt after every payment, online or logged manually.">
                  <Toggle checked={sendPaymentReceiptSms} onChange={(v) => { setSendPaymentReceiptSms(v); }} />
                </Row>
              </SettingsPanel>,
    appearance: <SettingsPanel>
<Row stack label="Appearance" desc="Switch between light, dark, or match your device.">
                <ThemeSwitcher />
              </Row>
              <Row label="Sign out" desc="You'll need to sign in again on this device.">
                <Button variant="danger" onClick={() => navigate("/sign-in")}>
                  Sign out
                </Button>
              </Row>
            </SettingsPanel>,
  };

  const openMeta = openKey ? cardGroups.flatMap((g) => g.cards).find((c) => c.key === openKey)! : null;

  return (
    <>
      <PageHeader title="Settings" description="Manage your property, billing, and account preferences." />

      <div className="space-y-8 px-4 pt-6 pb-10 sm:px-8">
        {cardGroups.map((g) => (
          <section key={g.label}>
            <SectionLabel>{g.label}</SectionLabel>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.cards.map((c) => {
                const CardIcon = c.icon;
                if (c.key === "autopilot") {
                  // Same card as the others, in the brand colour so the headline feature stands out.
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => openCard(c.key)}
                      className="group flex h-full flex-col rounded-lg border border-brand bg-brand p-5 text-left text-white transition-colors hover:bg-brand/95"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-white">
                        <CardIcon size={20} weight="fill" />
                      </span>
                      <p className="mt-3 text-sm font-semibold">{c.title}</p>
                      <p className="mt-1 text-xs leading-5 text-white/80">{c.desc}</p>
                      <span className="mt-auto flex items-center justify-between gap-2 pt-3">
                        <span className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${autopilotEnabled ? "bg-emerald-300" : "bg-white/50"}`} />
                          <span className="truncate">{summaries[c.key]}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                          Edit
                          <ArrowRight size={12} weight="bold" />
                        </span>
                      </span>
                    </button>
                  );
                }
                if (c.to) {
                  const linkTo = c.to;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => navigate(linkTo)}
                      className="group flex h-full flex-col rounded-lg border border-line bg-paper p-5 text-left transition-colors hover:border-ink/20 hover:bg-mist/30"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <CardIcon size={20} weight="duotone" />
                      </span>
                      <p className="mt-3 text-sm font-semibold text-ink">{c.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted">{c.desc}</p>
                      <span className="mt-auto flex items-center justify-end gap-2 pt-3">
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                          Open
                          <ArrowRight size={12} weight="bold" />
                        </span>
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => openCard(c.key as CardKey)}
                    className="group flex h-full flex-col rounded-lg border border-line bg-paper p-5 text-left transition-colors hover:border-ink/20 hover:bg-mist/30"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <CardIcon size={20} weight="duotone" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-ink">{c.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{c.desc}</p>
                    <span className="mt-auto flex items-center justify-between gap-2 pt-3">
                      {c.key === "account" ? (
                        <TierBadge plan={subscriptionPlan} size="sm" />
                      ) : (
                        <span className="truncate rounded-full bg-mist px-2.5 py-1 text-[11px] font-medium text-ink">{summaries[c.key as CardKey]}</span>
                      )}
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                        Edit
                        <ArrowRight size={12} weight="bold" />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <AnimatePresence>
        {changingPassword && (
          <ChangePasswordModal
            onClose={closeCard}
            onDone={() => {
              closeCard();
              showToast("Password updated", "success");
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openKey && openMeta && (
          <Modal
            key={openKey}
            onClose={closeCard}
            title={openMeta.title}
            description={openMeta.desc}
            icon={<openMeta.icon size={20} weight="duotone" />}
            maxWidth="max-w-md"
            footer={
              openKey === "appearance" ? (
                <Button variant="primary" onClick={closeCard} className="w-full py-2.5 text-[14px]">
                  Done
                </Button>
              ) : (
                <div className="flex justify-end gap-2.5">
                  <Button variant="secondary" onClick={closeCard} disabled={saving}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={() => void saveCard()} disabled={!dirty || saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )
            }
          >
            {cardContent[openKey]}
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
