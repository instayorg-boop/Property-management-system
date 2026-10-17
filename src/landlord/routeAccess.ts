import type { Permission } from "./permissions";

/** Ordered so the first entry a user `can()` reach becomes the fallback redirect target.
 * `null` permission = always reachable to anyone with a property (owner or active member). */
export const ROUTE_PERMISSIONS: { path: string; permission: Permission | null }[] = [
  { path: "/dashboard", permission: null },
  { path: "/tasks", permission: "tasks.manage" },
  { path: "/notifications", permission: "notifications.view" },
  { path: "/rent", permission: "rent.view" },
  { path: "/tenants", permission: "tenants.view" },
  { path: "/rooms", permission: "tenants.view" },
  { path: "/maintenance", permission: "maintenance.view" },
  { path: "/expense-tracker", permission: "expenses.view" },
  { path: "/reports", permission: "reports.view" },
  { path: "/reports/arrears-delinquency", permission: "reports.view" },
  { path: "/reports/income-expenses", permission: "reports.view" },
  { path: "/reports/occupancy-rate", permission: "reports.view" },
  { path: "/activity-log", permission: "audit.view" },
];

export function permissionForPath(pathname: string): Permission | null | undefined {
  const hit = ROUTE_PERMISSIONS.find((r) => pathname === r.path || pathname.startsWith(r.path + "/"));
  return hit?.permission;
}

export function firstAllowedPath(can: (p: Permission | "*") => boolean): string {
  for (const r of ROUTE_PERMISSIONS) {
    if (r.permission === null || can(r.permission)) return r.path;
  }
  return "/dashboard";
}
