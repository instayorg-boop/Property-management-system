import type { Tenant } from "./TenantsContext";
import type { NotificationRow, NotificationCategory } from "./NotificationsContext";
import type { TodayTask } from "../lib/todaysTasksApi";

// One place that knows how to turn "a task" or "a notification" into a concrete route — replaces
// the two separate, category/type-level-only mappings that used to live in TodaysTasks.tsx
// (actionFor) and NotificationsPanel.tsx (CATEGORY_LINK). Both of those only knew how to route to a
// *section* ("/rent", "/maintenance"); this resolves to the exact record when the data allows it,
// falling back to the same section routes when it doesn't (e.g. task types with no real detector
// yet, or notification categories with no entity_id).

// Section-level fallback for a notification with no specific record to deep-link to (older rows
// written before entity_type/entity_id existed, or categories — payout, system — with no
// per-record target at all). Defined here, not in NotificationsPanel.tsx, so both that panel and
// this resolver read the same map instead of two copies drifting apart.
export const CATEGORY_LINK: Record<NotificationCategory, string> = {
  payment: "/rent",
  maintenance: "/maintenance",
  payout: "/online-payments",
  overdue: "/rent",
  system: "/dashboard",
};

/** Tenant profile pages route by portal_token, not by tenants.id (see TenantProfile.tsx / Tenants.tsx) —
 * every id-based reference has to go through this lookup before it can become a URL. */
function tenantProfileLink(tenantId: string | null | undefined, tenants: Tenant[]): string | null {
  if (!tenantId) return null;
  const tenant = tenants.find((t) => t.id === tenantId);
  return tenant ? `/tenants/${tenant.portalToken}` : null;
}

export function resolveTaskLink(task: TodayTask, tenants: Tenant[]): string {
  const facts = task.facts as Record<string, string | undefined>;

  // overdue_rent's detector already puts the tenant's portal_token straight into facts.route_token
  // (see the 20261003010000 migration) — no lookup needed, and it doesn't depend on actionTargetId.
  if (task.type === "overdue_rent") {
    return facts.route_token ? `/tenants/${facts.route_token}` : tenantProfileLink(task.actionTargetId, tenants) ?? "/rent";
  }

  if (task.actionType === "maintenance_report" && task.actionTargetId) {
    return `/maintenance?report=${task.actionTargetId}`;
  }

  if (task.actionType === "tenant_profile" && task.actionTargetId) {
    return tenantProfileLink(task.actionTargetId, tenants) ?? "/tenants";
  }

  // Task types with no detector/entity reference yet (partial_payment, vacancy, payout_ready,
  // deposit_unsettled, data_gaps, collections_below_target) fall back to their section page.
  switch (task.type) {
    case "collections_below_target":
    case "partial_payment":
      return "/rent";
    case "deposit_unsettled":
      return "/tenants";
    case "vacancy":
      return "/rooms";
    case "payout_ready":
      return "/online-payments";
    case "data_gaps":
      return "/settings";
    default:
      return "/dashboard";
  }
}

export function resolveNotificationLink(n: NotificationRow, tenants: Tenant[]): string {
  const category = (n.category as NotificationCategory) in CATEGORY_LINK ? (n.category as NotificationCategory) : "system";

  if (n.entity_type === "maintenance_report" && n.entity_id) {
    return `/maintenance?report=${n.entity_id}`;
  }
  if (n.entity_type === "tenant" && n.entity_id) {
    return tenantProfileLink(n.entity_id, tenants) ?? CATEGORY_LINK[category];
  }

  return CATEGORY_LINK[category];
}
