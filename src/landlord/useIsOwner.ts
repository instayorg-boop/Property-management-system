import { useAccess } from "./AccessContext";

/** Gate for owner-only UI (payouts, billing, company settings, team admin beyond the invite list).
 * Backed by `my_access` — true only when the active property's row has `is_owner`. */
export function useIsOwner(): boolean {
  const { isOwner } = useAccess();
  return isOwner;
}
