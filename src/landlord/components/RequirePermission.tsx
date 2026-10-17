import { Navigate } from "react-router-dom";
import { useAccess } from "../AccessContext";
import { firstAllowedPath } from "../routeAccess";
import type { Permission } from "../permissions";

/** Wraps a route element; redirects to the first page the signed-in user can reach instead of
 * rendering a blank/forbidden screen when they lack the given permission(s). Pass `permission`
 * for a single required key, or `anyPermission` when any one of several keys is enough (e.g. the
 * Payouts page, reachable with `payouts.view`, `payouts.request` or `payout_methods.manage`). */
export default function RequirePermission({
  permission,
  anyPermission,
  children,
}: {
  permission?: Permission;
  anyPermission?: Permission[];
  children: React.ReactNode;
}) {
  const { can, isOwner } = useAccess();
  const allowed = isOwner
    || (permission ? can(permission) : false)
    || (anyPermission ? anyPermission.some((p) => can(p)) : false);
  if (!allowed) return <Navigate to={firstAllowedPath(can)} replace />;
  return <>{children}</>;
}
