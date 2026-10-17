/**
 * The portal's single data entry point. Every page calls usePortal(token) and gets the same
 * cached identity + tenant + ledger, so moving between pages costs no round trip (see
 * portalCache.ts). Data still only ever comes through the narrow `pay_portal_*` SECURITY DEFINER
 * functions in src/lib/payPortal.ts — never the landlord dashboard's contexts, which would leak
 * every tenant's data on this public route.
 */
import {
  resolvePortalToken,
  getPortalProperty,
  getPortalTenant,
  getPortalLedger,
  getPortalMaintenance,
  getPortalDocuments,
  computePortalNextDueDate,
  type PortalTenant,
  type PortalLedgerRow,
  type PortalMaintenanceReport,
  type PortalDocument,
} from "../../lib/payPortal";
import { useCached, invalidate } from "./portalCache";

export type PortalIdentity = {
  propertySlug: string;
  tenantId: string;
  propertyName: string;
  propertyLogoUrl: string | null;
  propertyAddress: string;
  dueDay: number;
};

export type PortalCore = {
  identity: PortalIdentity | null;
  tenant: PortalTenant | null;
  ledger: PortalLedgerRow[];
  /** The property's next billing date, already computed from the ledger + due day. */
  nextDueDate: Date | null;
  loading: boolean;
  /** The link itself is dead (wrong/revoked token) — a different failure from "couldn't load". */
  notFound: boolean;
  error: unknown;
  refresh: () => void;
};

async function loadCore(token: string) {
  const resolved = await resolvePortalToken(token);
  if (!resolved) return null;
  const [property, tenant] = await Promise.all([
    getPortalProperty(resolved.propertySlug),
    getPortalTenant(resolved.propertySlug, resolved.tenantId),
  ]);
  const ledger = tenant ? await getPortalLedger(tenant.id) : [];
  return {
    identity: {
      propertySlug: resolved.propertySlug,
      tenantId: resolved.tenantId,
      propertyName: property?.name ?? "",
      propertyLogoUrl: property?.logoUrl ?? null,
      propertyAddress: tenant?.propertyAddress ?? "",
      // 1st-of-month is the same fallback the landlord dashboard lands on for a property that has
      // never set one — not fabricated, just not undefined.
      dueDay: property?.dueDay ?? 1,
    },
    tenant,
    ledger,
  };
}

export function usePortal(token: string | undefined): PortalCore {
  const key = token ? `core:${token}` : null;
  const { data, loading, error, refresh } = useCached(key, () => loadCore(token!));

  const tenant = data?.tenant ?? null;
  const ledger = data?.ledger ?? [];
  const identity = data?.identity ?? null;

  return {
    identity,
    tenant,
    ledger,
    nextDueDate: tenant && identity ? computePortalNextDueDate(tenant.status, ledger, identity.dueDay, new Date(), tenant.moveInDate) : null,
    loading,
    notFound: data === null && !loading,
    error,
    refresh,
  };
}

export function usePortalMaintenance(tenantId: string | null | undefined) {
  return useCached<PortalMaintenanceReport[]>(
    tenantId ? `maintenance:${tenantId}` : null,
    () => getPortalMaintenance(tenantId!)
  );
}

export function usePortalDocuments(tenantId: string | null | undefined) {
  return useCached<PortalDocument[]>(tenantId ? `documents:${tenantId}` : null, () => getPortalDocuments(tenantId!));
}

/** Called after anything that genuinely changes what the tenant owes or has reported, so the next
 * page they land on reads fresh data rather than the pre-payment snapshot. */
export function invalidatePortal(token: string, tenantId?: string) {
  invalidate(`core:${token}`);
  if (tenantId) {
    invalidate(`maintenance:${tenantId}`);
    invalidate(`documents:${tenantId}`);
  }
}

/** Narrower than invalidatePortal: for actions (like filing a maintenance report) that don't change
 * the tenant's core/ledger data, so the success screen doesn't get stuck behind a refetch of data
 * that never changed — busting `core:${token}` there made usePortal's `loading` flip back to true
 * right as the success screen was about to render, since this page checks `loading` before `sent`. */
export function invalidatePortalMaintenance(tenantId: string) {
  invalidate(`maintenance:${tenantId}`);
}
