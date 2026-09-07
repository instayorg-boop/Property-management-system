import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import {
  listTenants,
  insertTenant,
  updateTenantRow,
  deleteTenantRow,
  addLedgerEntry,
  relationLabel,
  RELATION_OPTIONS,
  type Tenant,
  type PaymentStatus,
  type DepositStatus,
  type DepositMethod,
  type LedgerRow,
  type EmergencyContact,
  type RelationType,
} from "../lib/tenants";

// --- Types -------------------------------------------------------------------

export type { Tenant, PaymentStatus, DepositStatus, DepositMethod, LedgerRow, EmergencyContact, RelationType };
export { relationLabel, RELATION_OPTIONS };
/** The room type's name, e.g. "Single" — an open string since landlords can add their own room types on the Rooms page. */
export type RoomType = string;
export type DepositRefundability = "Refundable" | "Non-refundable" | "Partially refundable";

export function formatCurrency(n: number) {
  return `K${Math.round(n).toLocaleString("en-US")}`;
}

// --- Context -------------------------------------------------------------------

type TenantsContextValue = {
  tenants: Tenant[];
  /** False until the initial Supabase fetch resolves — pages use this to show skeletons instead of an empty state. */
  isReady: boolean;
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
  const { propertyId, propertyName } = useSettings();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      const rows = await listTenants(propertyId, propertyName);
      if (!cancelled) {
        setTenants(rows);
        setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // propertyName intentionally excluded: it can change via Settings without needing a full tenant refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const addTenant = (t: Omit<Tenant, "id">): Tenant => {
    const tenant: Tenant = { ...t, id: crypto.randomUUID() };
    setTenants((prev) => [tenant, ...prev]);
    if (propertyId) void insertTenant(propertyId, tenant.id, t).catch((e) => console.error("Failed to save tenant", e));
    return tenant;
  };

  const updateTenant = (id: string, patch: Partial<Omit<Tenant, "id">>) => {
    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (propertyId) {
      const { ledger, ...rowPatch } = patch;
      const writes: Promise<void>[] = [updateTenantRow(propertyId, id, rowPatch)];
      // Every caller that passes `ledger` here does so to prepend exactly one new row (there's no
      // "replace the whole ledger" call site) — persist that one row the same way logPayment does,
      // instead of silently dropping it like this used to.
      if (ledger && ledger.length > 0) writes.push(addLedgerEntry(id, ledger[0]));
      void Promise.all(writes).catch((e) => console.error("Failed to update tenant", e));
    }
  };

  const deleteTenant = (id: string) => {
    setTenants((prev) => prev.filter((t) => t.id !== id));
    void deleteTenantRow(id).catch((e) => console.error("Failed to delete tenant", e));
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
    if (propertyId) void updateTenantRow(propertyId, id, { active: false, ...details }).catch((e) => console.error("Failed to move out tenant", e));
  };

  const reactivateTenant = (id: string, newMoveInDate: string) => {
    setTenants((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, active: true, moveInDate: newMoveInDate, moveOutDate: undefined, depositResolutionNote: undefined }
          : t
      )
    );
    if (propertyId)
      void updateTenantRow(propertyId, id, {
        active: true,
        moveInDate: newMoveInDate,
        moveOutDate: undefined,
        depositResolutionNote: undefined,
      }).catch((e) => console.error("Failed to reactivate tenant", e));
  };

  const logPayment = (id: string, amount: number, label?: string) => {
    let updated: Tenant | undefined;
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next: Tenant = {
          ...t,
          status: "paid",
          owedAmount: 0,
          onTimeCount: t.status === "overdue" || t.status === "unpaid" ? t.onTimeCount : t.onTimeCount + 1,
          totalMonthsCount: t.totalMonthsCount + 1,
          ledger: [
            {
              label: label ?? `${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} rent`,
              amount,
              status: "paid",
              createdAt: new Date().toISOString(),
            },
            ...t.ledger,
          ],
        };
        updated = next;
        return next;
      })
    );
    if (propertyId && updated) {
      const newEntry = updated.ledger[0];
      void Promise.all([
        updateTenantRow(propertyId, id, {
          status: "paid",
          owedAmount: 0,
          onTimeCount: updated.onTimeCount,
          totalMonthsCount: updated.totalMonthsCount,
        }),
        addLedgerEntry(id, newEntry),
      ]).catch((e) => console.error("Failed to log payment", e));
    }
  };

  return (
    <TenantsContext.Provider
      value={{ tenants, isReady, addTenant, updateTenant, deleteTenant, moveOutTenant, reactivateTenant, logPayment }}
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
