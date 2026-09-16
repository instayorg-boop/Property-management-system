import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getOrCreatePrimaryProperty, listProperties, createProperty, updateProperty, uploadPropertyLogo as uploadPropertyLogoRequest } from "../lib/properties";
import { getOrCreateSettings, updateSettings, type SettingsRow } from "../lib/settingsApi";
import { readSettingsCache, writeSettingsCache } from "../lib/offline/settingsCache";

export type NotificationPrefs = {
  newPayment: boolean;
  newMaintenanceReport: boolean;
  upcomingPayout: boolean;
  overdueEscalated: boolean;
};

/** SMS-specific prefs for the non-payment events — payment SMS is controlled separately by
 * `paymentSmsMode` since it needs a digest choice, not just on/off. */
export type SmsNotificationPrefs = {
  newMaintenanceReport: boolean;
  upcomingPayout: boolean;
  overdueEscalated: boolean;
};

export type PaymentSmsMode = "off" | "hourly_digest" | "daily_digest";

export type PaymentMethod = {
  type: "mtn" | "airtel" | "cash" | "bank" | "other";
  number?: string;
  bankName?: string;
  accountNumber?: string;
  /** Platform name for "other" — e.g. "Mukuru", "Zamtel Kwacha", anything not in the built-in list. */
  label?: string;
};

type SettingsContextValue = {
  /** id of the property every other module (rooms, tenants, invoices) is scoped to. Null until loaded. */
  propertyId: string | null;
  /** False until the initial Supabase fetch resolves — pages use this to show skeletons instead of default values. */
  isReady: boolean;
  invoicesOn: boolean;
  setInvoicesOn: (v: boolean) => void;
  /** Landlord-configurable collection-rate goal shown on the Rent page trend card. Defaults to 90%. */
  collectionTargetPct: number;
  setCollectionTargetPct: (v: number) => void;
  /** The active property this dashboard session is scoped to. */
  propertyName: string;
  /** Rejected (thrown) once `propertyNameChangesRemaining` hits 0 — the DB enforces this too, so
   * this call is the source of truth for whether it actually took, not just a UI gate. */
  setPropertyName: (v: string) => Promise<void>;
  /** How many more times the property name can be changed — starts at 3, enforced server-side by a
   * trigger (see 20261001000000_locked_settings_fields.sql), mirrored here so the UI can disable
   * the field and explain why before the landlord even tries. */
  propertyNameChangesRemaining: number;
  /** The stable payment-portal URL segment (/pay/:propertySlug) — set once at creation, never
   * re-derived from the editable propertyName. Use this, not slugify(propertyName), anywhere a
   * portal link is built. */
  propertySlug: string;
  /** The property's logo/photo, shown side by side with its name in the sidebar's account card
   * and on every tenant-facing portal page. Null until uploaded. */
  propertyLogoUrl: string | null;
  uploadPropertyLogo: (file: File) => Promise<void>;
  propertyAddress: string;
  setPropertyAddress: (v: string) => void;
  propertyType: string;
  setPropertyType: (v: string) => void;
  /** Displayed on invoices and elsewhere landlord contact details are needed. */
  landlordName: string;
  setLandlordName: (v: string) => void;
  landlordPhone: string;
  setLandlordPhone: (v: string) => void;
  /** Payment methods offered to tenants — shown on invoices in the "How to pay" section. */
  paymentMethods: PaymentMethod[];
  setPaymentMethods: (v: PaymentMethod[]) => void;
  /** All properties this landlord manages — switching the active one sets propertyName. */
  properties: string[];
  addProperty: (name: string) => void;
  /** Management fee taken off gross rent before the owner payout, as a fraction (0.1 = 10%). */
  managementFeeRate: number;
  setManagementFeeRate: (v: number) => void;

  // Billing — drives the rent collection cycle (due date, grace period, penalties).
  billingPeriod: string;
  setBillingPeriod: (v: string) => void;
  dueDay: number;
  setDueDay: (v: number) => void;
  gracePeriodDays: number;
  setGracePeriodDays: (v: number) => void;
  dailyPenaltyRate: number;
  setDailyPenaltyRate: (v: number) => void;

  // Reminders — read by the reminder-automation workflow once built.
  reminderLeadDays: number;
  setReminderLeadDays: (v: number) => void;
  escalationDays: number;
  setEscalationDays: (v: number) => void;
  contactOrder: "student" | "guardian";
  setContactOrder: (v: "student" | "guardian") => void;

  // Notifications
  notificationPrefs: NotificationPrefs;
  setNotificationPref: (key: keyof NotificationPrefs, value: boolean) => void;

  // SMS — the alert phone is separate from landlordPhone (shown on invoices) so a landlord can
  // route SMS alerts to a different line than the one printed for tenants.
  notificationPhone: string;
  setNotificationPhone: (v: string) => void;
  paymentSmsMode: PaymentSmsMode;
  setPaymentSmsMode: (v: PaymentSmsMode) => void;
  smsNotificationPrefs: SmsNotificationPrefs;
  setSmsNotificationPref: (key: keyof SmsNotificationPrefs, value: boolean) => void;
  sendOnboardingSms: boolean;
  setSendOnboardingSms: (v: boolean) => void;
  sendPaymentReceiptSms: boolean;
  setSendPaymentReceiptSms: (v: boolean) => void;

  // Online payments (Lenco payout account)
  lencoConnected: boolean;
  setLencoConnected: (v: boolean) => void;
  bankName: string;
  setBankName: (v: string) => void;
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  accountHolderName: string;
  setAccountHolderName: (v: string) => void;
  /** Day of the week payouts go out, e.g. "Friday". */
  payoutDay: string;
  setPayoutDay: (v: string) => void;

  // Account / subscription
  accountEmail: string;
  setAccountEmail: (v: string) => void;
  subscriptionPlan: string;
  setSubscriptionPlan: (v: string) => void;
  /** ISO date the current plan renews, or "" if not set. */
  subscriptionRenewsAt: string;
  setSubscriptionRenewsAt: (v: string) => void;

  // Statutory — figures NAPSA/government update periodically, kept editable rather than hardcoded.
  napsaInsurableEarningsCeiling: number;
  setNapsaInsurableEarningsCeiling: (v: number) => void;
  minimumWageReference: number;
  setMinimumWageReference: (v: number) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function fromRow(row: SettingsRow) {
  const prefs = (row.notification_prefs ?? {}) as Partial<NotificationPrefs>;
  const smsPrefs = (row.sms_notification_prefs ?? {}) as Partial<SmsNotificationPrefs>;
  return {
    invoicesOn: row.invoices_on,
    collectionTargetPct: row.collection_target_pct,
    landlordName: row.landlord_name ?? "",
    landlordPhone: row.landlord_phone ?? "",
    paymentMethods: (row.payment_methods ?? []) as PaymentMethod[],
    managementFeeRate: row.management_fee_rate,
    billingPeriod: row.billing_period,
    dueDay: row.due_day,
    gracePeriodDays: row.grace_period_days,
    dailyPenaltyRate: row.daily_penalty_rate,
    reminderLeadDays: row.reminder_lead_days,
    escalationDays: row.escalation_days,
    contactOrder: row.contact_order as "student" | "guardian",
    notificationPrefs: {
      newPayment: prefs.newPayment ?? true,
      newMaintenanceReport: prefs.newMaintenanceReport ?? true,
      upcomingPayout: prefs.upcomingPayout ?? true,
      overdueEscalated: prefs.overdueEscalated ?? true,
    },
    notificationPhone: row.notification_phone ?? "",
    paymentSmsMode: (row.payment_sms_mode as PaymentSmsMode) ?? "daily_digest",
    smsNotificationPrefs: {
      newMaintenanceReport: smsPrefs.newMaintenanceReport ?? true,
      upcomingPayout: smsPrefs.upcomingPayout ?? true,
      overdueEscalated: smsPrefs.overdueEscalated ?? true,
    },
    sendOnboardingSms: row.send_onboarding_sms ?? true,
    sendPaymentReceiptSms: row.send_payment_receipt_sms ?? true,
    lencoConnected: row.lenco_connected,
    bankName: row.bank_name ?? "",
    accountNumber: row.account_number ?? "",
    accountHolderName: row.account_holder_name ?? "",
    payoutDay: row.payout_day ?? "Friday",
    accountEmail: row.account_email ?? "",
    subscriptionPlan: row.subscription_plan ?? "",
    subscriptionRenewsAt: row.subscription_renews_at ?? "",
    napsaInsurableEarningsCeiling: row.napsa_insurable_earnings_ceiling,
    minimumWageReference: row.minimum_wage_reference,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const [invoicesOn, setInvoicesOnState] = useState(false);
  const [collectionTargetPct, setCollectionTargetPctState] = useState(90);
  const [propertyName, setPropertyNameState] = useState("Kabulonga House");
  const [propertyNameChangeCount, setPropertyNameChangeCount] = useState(0);
  const [propertyAddress, setPropertyAddressState] = useState("Plot 14, Kabulonga, Lusaka");
  const [propertyType, setPropertyTypeState] = useState("");
  // The payment-portal URL segment — set once at property creation and never re-derived from the
  // (editable) name, unlike the old behavior in Settings.tsx that recomputed it from propertyName
  // on every render and broke every existing payment link the moment a landlord renamed their
  // property. This is the one source of truth for what the portal route actually is.
  const [propertySlug, setPropertySlugState] = useState("");
  const [propertyLogoUrl, setPropertyLogoUrlState] = useState<string | null>(null);
  const [landlordName, setLandlordNameState] = useState("");
  const [landlordPhone, setLandlordPhoneState] = useState("0977 000 000");
  const [paymentMethods, setPaymentMethodsState] = useState<PaymentMethod[]>([
    { type: "mtn", number: "0977 000 111" },
    { type: "cash" },
  ]);
  const [properties, setProperties] = useState<string[]>(["Kabulonga House"]);
  const [managementFeeRate, setManagementFeeRateState] = useState(0.1);

  const [billingPeriod, setBillingPeriodState] = useState("Monthly");
  const [dueDay, setDueDayState] = useState(30);
  const [gracePeriodDays, setGracePeriodDaysState] = useState(5);
  const [dailyPenaltyRate, setDailyPenaltyRateState] = useState(15);

  const [reminderLeadDays, setReminderLeadDaysState] = useState(3);
  const [escalationDays, setEscalationDaysState] = useState(7);
  const [contactOrder, setContactOrderState] = useState<"student" | "guardian">("student");

  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPrefs>({
    newPayment: true,
    newMaintenanceReport: true,
    upcomingPayout: true,
    overdueEscalated: true,
  });

  const [notificationPhone, setNotificationPhoneState] = useState("");
  const [paymentSmsMode, setPaymentSmsModeState] = useState<PaymentSmsMode>("daily_digest");
  const [smsNotificationPrefs, setSmsNotificationPrefsState] = useState<SmsNotificationPrefs>({
    newMaintenanceReport: true,
    upcomingPayout: true,
    overdueEscalated: true,
  });
  const [sendOnboardingSms, setSendOnboardingSmsState] = useState(true);
  const [sendPaymentReceiptSms, setSendPaymentReceiptSmsState] = useState(true);

  const [lencoConnected, setLencoConnectedState] = useState(false);
  const [bankName, setBankNameState] = useState("");
  const [accountNumber, setAccountNumberState] = useState("");
  const [accountHolderName, setAccountHolderNameState] = useState("");
  const [payoutDay, setPayoutDayState] = useState("Friday");

  const [accountEmail, setAccountEmailState] = useState("");
  const [subscriptionPlan, setSubscriptionPlanState] = useState("");
  const [subscriptionRenewsAt, setSubscriptionRenewsAtState] = useState("");

  const [napsaInsurableEarningsCeiling, setNapsaInsurableEarningsCeilingState] = useState(37236);
  const [minimumWageReference, setMinimumWageReferenceState] = useState(1978.99);

  // Applies a settings row (fresh from Supabase or from the offline cache) to state — shared by
  // both paths below so a cache hydration and a network response go through the same mapping.
  const applySettingsRow = (settingsRow: SettingsRow) => {
    const s = fromRow(settingsRow);
    setInvoicesOnState(s.invoicesOn);
    setCollectionTargetPctState(s.collectionTargetPct);
    setLandlordNameState(s.landlordName);
    setLandlordPhoneState(s.landlordPhone);
    setPaymentMethodsState(s.paymentMethods);
    setManagementFeeRateState(s.managementFeeRate);
    setBillingPeriodState(s.billingPeriod);
    setDueDayState(s.dueDay);
    setGracePeriodDaysState(s.gracePeriodDays);
    setDailyPenaltyRateState(s.dailyPenaltyRate);
    setReminderLeadDaysState(s.reminderLeadDays);
    setEscalationDaysState(s.escalationDays);
    setContactOrderState(s.contactOrder);
    setNotificationPrefsState(s.notificationPrefs);
    setNotificationPhoneState(s.notificationPhone);
    setPaymentSmsModeState(s.paymentSmsMode);
    setSmsNotificationPrefsState(s.smsNotificationPrefs);
    setSendOnboardingSmsState(s.sendOnboardingSms);
    setSendPaymentReceiptSmsState(s.sendPaymentReceiptSms);
    setLencoConnectedState(s.lencoConnected);
    setBankNameState(s.bankName);
    setAccountNumberState(s.accountNumber);
    setAccountHolderNameState(s.accountHolderName);
    setPayoutDayState(s.payoutDay);
    setAccountEmailState(s.accountEmail);
    setSubscriptionPlanState(s.subscriptionPlan);
    setSubscriptionRenewsAtState(s.subscriptionRenewsAt);
    setNapsaInsurableEarningsCeilingState(s.napsaInsurableEarningsCeiling);
    setMinimumWageReferenceState(s.minimumWageReference);
  };

  useEffect(() => {
    let cancelled = false;

    // propertyId gates every other context's fetch (Tenants, Rooms, Expenses, ...), so if this
    // never resolves — e.g. offline with no network call possible — nothing else in the app can
    // even attempt to read ITS OWN cache. Hydrate from the last known property/settings
    // immediately so a reload while offline doesn't leave the whole dashboard stuck loading.
    const cached = readSettingsCache();
    if (cached) {
      setPropertyId(cached.property.id);
      setPropertyNameState(cached.property.name);
      setPropertyAddressState(cached.property.address);
      setPropertyTypeState(cached.property.propertyType);
      setPropertySlugState(cached.property.slug);
      setPropertyLogoUrlState(cached.property.logoUrl ?? null);
      applySettingsRow(cached.settingsRow as SettingsRow);
      setProperties(cached.properties);
      setIsReady(true);
    }

    (async () => {
      try {
        const property = await getOrCreatePrimaryProperty();
        if (cancelled) return;
        setPropertyId(property.id);
        setPropertyNameState(property.name);
        setPropertyNameChangeCount(property.name_change_count ?? 0);
        setPropertyAddressState(property.address ?? "");
        setPropertyTypeState(property.property_type ?? "");
        setPropertySlugState(property.slug ?? "");
        setPropertyLogoUrlState(property.logo_url ?? null);

        const [settingsRow, allProperties] = await Promise.all([
          getOrCreateSettings(property.id),
          listProperties(),
        ]);
        if (cancelled) return;

        applySettingsRow(settingsRow);
        setProperties(allProperties.map((p) => p.name));
        setIsReady(true);
        writeSettingsCache({
          property: {
            id: property.id,
            name: property.name,
            address: property.address ?? "",
            propertyType: property.property_type ?? "",
            slug: property.slug ?? "",
            logoUrl: property.logo_url ?? null,
          },
          settingsRow,
          properties: allProperties.map((p) => p.name),
        });
      } catch (e) {
        // Offline (or the request failed) — if we already hydrated from cache above, the app is
        // usable as-is; if there was no cache either (first-ever offline load), there's nothing
        // more to wait for, so stop showing the loading skeleton rather than hang indefinitely.
        if (cancelled) return;
        if (!cached) setIsReady(true);
        if (!navigator.onLine) return;
        console.error("Failed to load settings/property", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (patch: Parameters<typeof updateSettings>[1]) => {
    if (!propertyId) return;
    void updateSettings(propertyId, patch);
  };

  const setInvoicesOn = (v: boolean) => {
    setInvoicesOnState(v);
    persist({ invoices_on: v });
  };
  const setCollectionTargetPct = (v: number) => {
    setCollectionTargetPctState(v);
    persist({ collection_target_pct: v });
  };
  const setPropertyName = async (v: string) => {
    if (!propertyId || v === propertyName) return;
    // Not optimistic — this one can actually be rejected (the 3-change limit), and the DB trigger
    // is the source of truth, not this count mirrored client-side. Only reflect the change once
    // the write is confirmed.
    await updateProperty(propertyId, { name: v });
    setPropertyNameState(v);
    setPropertyNameChangeCount((c) => c + 1);
  };
  const setPropertyAddress = (v: string) => {
    setPropertyAddressState(v);
    if (propertyId) void updateProperty(propertyId, { address: v });
  };
  const setPropertyType = (v: string) => {
    setPropertyTypeState(v);
    if (propertyId) void updateProperty(propertyId, { property_type: v });
  };
  const uploadPropertyLogo = async (file: File) => {
    if (!propertyId) return;
    const url = await uploadPropertyLogoRequest(propertyId, file);
    setPropertyLogoUrlState(url);
  };
  const setLandlordName = (v: string) => {
    setLandlordNameState(v);
    persist({ landlord_name: v });
  };
  const setLandlordPhone = (v: string) => {
    setLandlordPhoneState(v);
    persist({ landlord_phone: v });
  };
  const setPaymentMethods = (v: PaymentMethod[]) => {
    setPaymentMethodsState(v);
    persist({ payment_methods: v });
  };
  const setManagementFeeRate = (v: number) => {
    setManagementFeeRateState(v);
    persist({ management_fee_rate: v });
  };
  const setBillingPeriod = (v: string) => {
    setBillingPeriodState(v);
    persist({ billing_period: v });
  };
  const setDueDay = (v: number) => {
    setDueDayState(v);
    persist({ due_day: v });
  };
  const setGracePeriodDays = (v: number) => {
    setGracePeriodDaysState(v);
    persist({ grace_period_days: v });
  };
  const setDailyPenaltyRate = (v: number) => {
    setDailyPenaltyRateState(v);
    persist({ daily_penalty_rate: v });
  };
  const setReminderLeadDays = (v: number) => {
    setReminderLeadDaysState(v);
    persist({ reminder_lead_days: v });
  };
  const setEscalationDays = (v: number) => {
    setEscalationDaysState(v);
    persist({ escalation_days: v });
  };
  const setContactOrder = (v: "student" | "guardian") => {
    setContactOrderState(v);
    persist({ contact_order: v });
  };
  const setLencoConnected = (v: boolean) => {
    setLencoConnectedState(v);
    persist({ lenco_connected: v });
  };
  const setBankName = (v: string) => {
    setBankNameState(v);
    persist({ bank_name: v });
  };
  const setAccountNumber = (v: string) => {
    setAccountNumberState(v);
    persist({ account_number: v });
  };
  const setAccountHolderName = (v: string) => {
    setAccountHolderNameState(v);
    persist({ account_holder_name: v });
  };
  const setPayoutDay = (v: string) => {
    setPayoutDayState(v);
    persist({ payout_day: v });
  };
  const setAccountEmail = (v: string) => {
    setAccountEmailState(v);
    persist({ account_email: v });
  };
  const setSubscriptionPlan = (v: string) => {
    setSubscriptionPlanState(v);
    persist({ subscription_plan: v });
  };
  const setSubscriptionRenewsAt = (v: string) => {
    setSubscriptionRenewsAtState(v);
    persist({ subscription_renews_at: v || null });
  };
  const setNapsaInsurableEarningsCeiling = (v: number) => {
    setNapsaInsurableEarningsCeilingState(v);
    persist({ napsa_insurable_earnings_ceiling: v });
  };
  const setMinimumWageReference = (v: number) => {
    setMinimumWageReferenceState(v);
    persist({ minimum_wage_reference: v });
  };

  const addProperty = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || properties.includes(trimmed)) return;
    setProperties((prev) => [...prev, trimmed]);
    void createProperty(trimmed);
  };

  const setNotificationPref = (key: keyof NotificationPrefs, value: boolean) => {
    setNotificationPrefsState((prev) => {
      const next = { ...prev, [key]: value };
      persist({ notification_prefs: next });
      return next;
    });
  };

  const setNotificationPhone = (v: string) => {
    setNotificationPhoneState(v);
    persist({ notification_phone: v });
  };
  const setPaymentSmsMode = (v: PaymentSmsMode) => {
    setPaymentSmsModeState(v);
    persist({ payment_sms_mode: v });
  };
  const setSmsNotificationPref = (key: keyof SmsNotificationPrefs, value: boolean) => {
    setSmsNotificationPrefsState((prev) => {
      const next = { ...prev, [key]: value };
      persist({ sms_notification_prefs: next });
      return next;
    });
  };
  const setSendOnboardingSms = (v: boolean) => {
    setSendOnboardingSmsState(v);
    persist({ send_onboarding_sms: v });
  };
  const setSendPaymentReceiptSms = (v: boolean) => {
    setSendPaymentReceiptSmsState(v);
    persist({ send_payment_receipt_sms: v });
  };

  return (
    <SettingsContext.Provider
      value={{
        propertyId,
        isReady,
        invoicesOn,
        setInvoicesOn,
        collectionTargetPct,
        setCollectionTargetPct,
        propertyName,
        setPropertyName,
        propertyNameChangesRemaining: Math.max(0, 3 - propertyNameChangeCount),
        propertySlug,
        propertyLogoUrl,
        uploadPropertyLogo,
        propertyAddress,
        setPropertyAddress,
        propertyType,
        setPropertyType,
        landlordName,
        setLandlordName,
        landlordPhone,
        setLandlordPhone,
        paymentMethods,
        setPaymentMethods,
        properties,
        addProperty,
        managementFeeRate,
        setManagementFeeRate,
        billingPeriod,
        setBillingPeriod,
        dueDay,
        setDueDay,
        gracePeriodDays,
        setGracePeriodDays,
        dailyPenaltyRate,
        setDailyPenaltyRate,
        reminderLeadDays,
        setReminderLeadDays,
        escalationDays,
        setEscalationDays,
        contactOrder,
        setContactOrder,
        notificationPrefs,
        setNotificationPref,
        notificationPhone,
        setNotificationPhone,
        paymentSmsMode,
        setPaymentSmsMode,
        smsNotificationPrefs,
        setSmsNotificationPref,
        sendOnboardingSms,
        setSendOnboardingSms,
        sendPaymentReceiptSms,
        setSendPaymentReceiptSms,
        lencoConnected,
        setLencoConnected,
        bankName,
        setBankName,
        accountNumber,
        setAccountNumber,
        accountHolderName,
        setAccountHolderName,
        payoutDay,
        setPayoutDay,
        accountEmail,
        setAccountEmail,
        subscriptionPlan,
        setSubscriptionPlan,
        subscriptionRenewsAt,
        setSubscriptionRenewsAt,
        napsaInsurableEarningsCeiling,
        setNapsaInsurableEarningsCeiling,
        minimumWageReference,
        setMinimumWageReference,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
