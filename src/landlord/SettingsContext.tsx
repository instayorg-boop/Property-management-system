import { createContext, useContext, useState, type ReactNode } from "react";

export type NotificationPrefs = {
  newPayment: boolean;
  newMaintenanceReport: boolean;
  upcomingPayout: boolean;
  overdueEscalated: boolean;
};

export type PaymentMethod = {
  type: "mtn" | "airtel" | "cash" | "bank" | "other";
  number?: string;
  bankName?: string;
  accountNumber?: string;
  /** Platform name for "other" — e.g. "Mukuru", "Zamtel Kwacha", anything not in the built-in list. */
  label?: string;
};

type SettingsContextValue = {
  invoicesOn: boolean;
  setInvoicesOn: (v: boolean) => void;
  /** Landlord-configurable collection-rate goal shown on the Rent page trend card. Defaults to 90%. */
  collectionTargetPct: number;
  setCollectionTargetPct: (v: number) => void;
  /** The active property this dashboard session is scoped to. */
  propertyName: string;
  setPropertyName: (v: string) => void;
  propertyAddress: string;
  setPropertyAddress: (v: string) => void;
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

  // Online payments (Lenco payout account)
  lencoConnected: boolean;
  setLencoConnected: (v: boolean) => void;
  bankName: string;
  setBankName: (v: string) => void;
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  accountHolderName: string;
  setAccountHolderName: (v: string) => void;

  // Statutory — figures NAPSA/government update periodically, kept editable rather than hardcoded.
  napsaInsurableEarningsCeiling: number;
  setNapsaInsurableEarningsCeiling: (v: number) => void;
  minimumWageReference: number;
  setMinimumWageReference: (v: number) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [invoicesOn, setInvoicesOn] = useState(false);
  const [collectionTargetPct, setCollectionTargetPct] = useState(90);
  const [propertyName, setPropertyName] = useState("Kabulonga House");
  const [propertyAddress, setPropertyAddress] = useState("Plot 14, Kabulonga, Lusaka");
  const [landlordName, setLandlordName] = useState("Bernard Mwansa");
  const [landlordPhone, setLandlordPhone] = useState("0977 000 000");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    { type: "mtn", number: "0977 000 111" },
    { type: "cash" },
  ]);
  const [properties, setProperties] = useState<string[]>(["Kabulonga House"]);
  const [managementFeeRate, setManagementFeeRate] = useState(0.1);

  const [billingPeriod, setBillingPeriod] = useState("Monthly");
  const [dueDay, setDueDay] = useState(30);
  const [gracePeriodDays, setGracePeriodDays] = useState(5);
  const [dailyPenaltyRate, setDailyPenaltyRate] = useState(15);

  const [reminderLeadDays, setReminderLeadDays] = useState(3);
  const [escalationDays, setEscalationDays] = useState(7);
  const [contactOrder, setContactOrder] = useState<"student" | "guardian">("student");

  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    newPayment: true,
    newMaintenanceReport: true,
    upcomingPayout: true,
    overdueEscalated: true,
  });

  const [lencoConnected, setLencoConnected] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");

  const [napsaInsurableEarningsCeiling, setNapsaInsurableEarningsCeiling] = useState(37236);
  const [minimumWageReference, setMinimumWageReference] = useState(1978.99);

  const addProperty = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || properties.includes(trimmed)) return;
    setProperties((prev) => [...prev, trimmed]);
  };

  const setNotificationPref = (key: keyof NotificationPrefs, value: boolean) => {
    setNotificationPrefs((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <SettingsContext.Provider
      value={{
        invoicesOn,
        setInvoicesOn,
        collectionTargetPct,
        setCollectionTargetPct,
        propertyName,
        setPropertyName,
        propertyAddress,
        setPropertyAddress,
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
        lencoConnected,
        setLencoConnected,
        bankName,
        setBankName,
        accountNumber,
        setAccountNumber,
        accountHolderName,
        setAccountHolderName,
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
