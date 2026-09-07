import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// --- Types -------------------------------------------------------------------

export type PaymentStatus = "paid" | "overdue" | "unpaid" | "partial";
/** The room type's name, e.g. "Single" — an open string since landlords can add their own room types on the Rooms page. */
export type RoomType = string;
export type DepositStatus = "Not collected" | "Held" | "Refunded" | "Forfeited" | "Partially refunded";
export type DepositMethod = "mobile" | "cash" | "bank";
export type DepositRefundability = "Refundable" | "Non-refundable" | "Partially refundable";

export const RELATION_OPTIONS = ["Parent", "Guardian", "Spouse", "Sibling", "Friend", "Other"] as const;
export type RelationType = (typeof RELATION_OPTIONS)[number];

export type EmergencyContact = {
  id: string;
  name: string;
  relation: RelationType;
  /** Free text used only when `relation` is "Other". */
  relationOther?: string;
  phones: string[];
};

/** What to actually show for a contact's relationship — "Other" alone isn't useful to a landlord
 * scanning the list, so this falls back to the free-text description when one was given. */
export function relationLabel(contact: EmergencyContact): string {
  return contact.relation === "Other" ? contact.relationOther?.trim() || "Other" : contact.relation;
}
export type LedgerRow = {
  label: string;
  /** Amount due for this period, in Kwacha. */
  amount: number;
  /** For partial rows only: how much of `amount` has actually been paid. */
  paidAmount?: number;
  status?: PaymentStatus;
};

export type Tenant = {
  id: string;
  name: string;
  /** A tenant can be reachable on more than one number — the first is treated as primary (call/text). */
  phones: string[];
  /** Any number of emergency contacts, each with any number of their own phone numbers. */
  emergencyContacts: EmergencyContact[];
  property: string;
  room: string;
  roomType: RoomType;
  moveInDate: string;
  /** Agreed monthly rent, in Kwacha. */
  rentAmount: number;
  status: PaymentStatus;
  daysOverdue?: number;
  /** Outstanding balance, in Kwacha. 0 means nothing owed. */
  owedAmount: number;
  depositAmount: number;
  depositDate: string;
  depositMethod: DepositMethod;
  depositStatus: DepositStatus;
  /** Free-text note only the landlord sees — payment arrangements, special circumstances, etc. */
  notes: string;
  onTimeCount: number;
  /** Total number of rent periods billed so far — the denominator for onTimeCount. */
  totalMonthsCount: number;
  active: boolean;
  /** Institution (school/employer) covering this tenant's rent, if any — tenants sharing the same
   * name here can be billed together as one combined invoice instead of individually. */
  institution?: string;
  moveOutDate?: string;
  /** How the deposit was resolved on move-out, e.g. "Refunded in full" or "K200 deducted for cleaning". */
  depositResolutionNote?: string;
  ledger: LedgerRow[];
};

export function formatCurrency(n: number) {
  return `K${Math.round(n).toLocaleString("en-US")}`;
}

// Temporary switch for previewing empty states across the app — flip back to `initialTenantsSeed`
// once the preview is done.
const DEMO_EMPTY_STATE = false;

const initialTenantsSeed: Tenant[] = [
  {
    id: "t1", name: "A. Mwansa", phones: ["0977 123 456"], emergencyContacts: [{ id: "t1-ec1", name: "P. Mwansa", relation: "Guardian", phones: ["0966 234 567"] }],
    property: "Kabulonga House", room: "Room 12", roomType: "Single", moveInDate: "12 Jan 2025", rentAmount: 1200, status: "paid",
    owedAmount: 0, depositAmount: 1200, depositDate: "12 Jan 2025", depositMethod: "mobile", depositStatus: "Held",
    notes: "", onTimeCount: 7, totalMonthsCount: 7, active: true,
    ledger: [
      { label: "August 2026 rent", amount: 1200, status: "paid" },
      { label: "July 2026 rent", amount: 1200, status: "paid" },
      { label: "June 2026 rent", amount: 1200, status: "paid" },
    ],
  },
  {
    id: "t2", name: "B. Phiri", phones: ["0955 345 678"], emergencyContacts: [{ id: "t2-ec1", name: "R. Phiri", relation: "Guardian", phones: ["0977 456 789"] }],
    property: "Kabulonga House", room: "Room 08", roomType: "Single", moveInDate: "3 Mar 2025", rentAmount: 950, status: "overdue", daysOverdue: 12, owedAmount: 1140,
    depositAmount: 950, depositDate: "3 Mar 2025", depositMethod: "cash", depositStatus: "Held",
    notes: "Asked for a payment plan in June — pays in two installments most months.", onTimeCount: 3, totalMonthsCount: 5, active: true,
    ledger: [
      { label: "August 2026 rent", amount: 1140, status: "overdue" },
      { label: "July 2026 rent", amount: 950, status: "paid" },
      { label: "June 2026 rent", amount: 950, status: "paid" },
    ],
  },
  {
    id: "t3", name: "C. Banda", phones: ["0966 456 789"], emergencyContacts: [{ id: "t3-ec1", name: "S. Banda", relation: "Guardian", phones: ["0955 567 890"] }],
    property: "Kabulonga House", room: "Room 03", roomType: "Two sharing", moveInDate: "20 Feb 2025", rentAmount: 900, status: "partial", owedAmount: 400,
    depositAmount: 900, depositDate: "20 Feb 2025", depositMethod: "mobile", depositStatus: "Held",
    notes: "", onTimeCount: 5, totalMonthsCount: 6, active: true,
    ledger: [
      { label: "August 2026 rent", amount: 900, paidAmount: 500, status: "partial" },
      { label: "July 2026 rent", amount: 900, status: "paid" },
    ],
  },
  {
    id: "t4", name: "D. Zulu", phones: ["0977 567 890"], emergencyContacts: [{ id: "t4-ec1", name: "T. Zulu", relation: "Guardian", phones: ["0966 678 901"] }],
    property: "Kabulonga House", room: "Room 05", roomType: "Two sharing", moveInDate: "1 Apr 2025", rentAmount: 1000, status: "paid",
    owedAmount: 0, depositAmount: 1000, depositDate: "1 Apr 2025", depositMethod: "mobile", depositStatus: "Held",
    notes: "", onTimeCount: 9, totalMonthsCount: 9, active: true,
    ledger: [{ label: "August 2026 rent", amount: 1000, status: "paid" }],
  },
  {
    id: "t5", name: "F. Chileshe", phones: ["0955 678 901"], emergencyContacts: [{ id: "t5-ec1", name: "U. Chileshe", relation: "Guardian", phones: ["0977 789 012"] }],
    property: "Kabulonga House", room: "Room 19", roomType: "Two sharing", moveInDate: "15 May 2025", rentAmount: 950, status: "paid",
    owedAmount: 0, depositAmount: 950, depositDate: "15 May 2025", depositMethod: "cash", depositStatus: "Held",
    notes: "", onTimeCount: 4, totalMonthsCount: 4, active: true,
    ledger: [{ label: "August 2026 rent", amount: 950, status: "paid" }],
  },
  {
    id: "t6", name: "G. Mwape", phones: ["0977 890 123"], emergencyContacts: [{ id: "t6-ec1", name: "W. Mwape", relation: "Guardian", phones: ["0966 901 234"] }],
    property: "Kabulonga House", room: "Room 22", roomType: "Two sharing", moveInDate: "8 Jun 2025", rentAmount: 1100, status: "paid",
    owedAmount: 0, depositAmount: 1100, depositDate: "8 Jun 2025", depositMethod: "mobile", depositStatus: "Held",
    notes: "", onTimeCount: 3, totalMonthsCount: 3, active: true,
    ledger: [{ label: "August 2026 rent", amount: 1100, status: "paid" }],
  },
  {
    id: "t7", name: "H. Banda", phones: ["0955 901 234"], emergencyContacts: [{ id: "t7-ec1", name: "X. Banda", relation: "Guardian", phones: ["0977 012 345"] }],
    property: "Kabulonga House", room: "Room 14", roomType: "Single", moveInDate: "2 Jul 2025", rentAmount: 1200, status: "overdue", daysOverdue: 4, owedAmount: 1200,
    depositAmount: 1200, depositDate: "2 Jul 2025", depositMethod: "mobile", depositStatus: "Held",
    notes: "", onTimeCount: 2, totalMonthsCount: 3, active: true,
    ledger: [{ label: "August 2026 rent", amount: 1200, status: "overdue" }],
  },
  {
    id: "t8", name: "M. Ngoma", phones: ["0966 789 012"], emergencyContacts: [{ id: "t8-ec1", name: "V. Ngoma", relation: "Guardian", phones: ["0955 890 123"] }],
    property: "Kabulonga House", room: "Room 30", roomType: "Two sharing", moveInDate: "10 Nov 2024", rentAmount: 900, status: "paid",
    owedAmount: 0, depositAmount: 900, depositDate: "10 Nov 2024", depositMethod: "cash", depositStatus: "Refunded",
    notes: "", onTimeCount: 10, totalMonthsCount: 10, active: false,
    moveOutDate: "31 Jul 2026", depositResolutionNote: "Refunded in full — end of semester, no damage.",
    ledger: [{ label: "July 2026 rent", amount: 900, status: "paid" }],
  },
];

// --- Context -------------------------------------------------------------------

type TenantsContextValue = {
  tenants: Tenant[];
  addTenant: (t: Omit<Tenant, "id">) => Tenant;
  updateTenant: (id: string, patch: Partial<Omit<Tenant, "id">>) => void;
  deleteTenant: (id: string) => void;
  moveOutTenant: (id: string, details: { moveOutDate: string; depositStatus: DepositStatus; depositResolutionNote: string }) => void;
  reactivateTenant: (id: string, newMoveInDate: string) => void;
  /** `label` defaults to the standard rent-row label when omitted — pass one explicitly for
   * anything that isn't a plain full-month rent payment (e.g. a pro-rata partial month). */
  logPayment: (id: string, amount: number, label?: string) => void;
};

const TenantsContext = createContext<TenantsContextValue | null>(null);

export function TenantsProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>(DEMO_EMPTY_STATE ? [] : initialTenantsSeed);

  const addTenant = (t: Omit<Tenant, "id">) => {
    const tenant: Tenant = { ...t, id: `t${Date.now()}` };
    setTenants((prev) => [tenant, ...prev]);
    return tenant;
  };

  const updateTenant = (id: string, patch: Partial<Omit<Tenant, "id">>) => {
    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const deleteTenant = (id: string) => {
    setTenants((prev) => prev.filter((t) => t.id !== id));
  };

  const moveOutTenant = (
    id: string,
    details: { moveOutDate: string; depositStatus: DepositStatus; depositResolutionNote: string }
  ) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, active: false, ...details } : t))
    );
    // The Rooms page derives occupancy from active tenants' `room` field (see RoomsContext's
    // useRoomsView), so setting active: false here is what actually frees the room up there too.
  };

  const reactivateTenant = (id: string, newMoveInDate: string) => {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, active: true, moveInDate: newMoveInDate, moveOutDate: undefined, depositResolutionNote: undefined }
          : t
      )
    );
  };

  const logPayment = (id: string, amount: number, label?: string) => {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "paid",
              owedAmount: 0,
              onTimeCount: t.status === "overdue" || t.status === "unpaid" ? t.onTimeCount : t.onTimeCount + 1,
              totalMonthsCount: t.totalMonthsCount + 1,
              ledger: [{ label: label ?? "August 2026 rent", amount, status: "paid" }, ...t.ledger],
            }
          : t
      )
    );
  };

  return (
    <TenantsContext.Provider
      value={{ tenants, addTenant, updateTenant, deleteTenant, moveOutTenant, reactivateTenant, logPayment }}
    >
      {children}
    </TenantsContext.Provider>
  );
}

export function useTenants() {
  const ctx = useContext(TenantsContext);
  if (!ctx) throw new Error("useTenants must be used within TenantsProvider");
  return ctx;
}

/**
 * Rent actually collected from active tenants right now — paid tenants count their full rent,
 * partial tenants count only what they've actually paid so far. Shared by Rent, Expenses, and the
 * Owner Payout / Income vs Expenses reports so "collected" means the same thing everywhere.
 */
export function useCollectedRent() {
  const { tenants } = useTenants();
  return useMemo(
    () =>
      tenants
        .filter((t) => t.active)
        .reduce((sum, t) => {
          if (t.status === "paid") return sum + t.rentAmount;
          if (t.status === "partial") return sum + (t.ledger[0]?.paidAmount ?? 0);
          return sum;
        }, 0),
    [tenants]
  );
}
