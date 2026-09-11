import { useAuth } from "./AuthContext";

/** Gate for payout-visibility UI (the Accounting balance pill, the full payout ledger, the
 * Settings withdraw panel). There is currently no manager/staff account type in this app — every
 * signed-in user only ever has access to properties they own (`properties.owner_id = auth.uid()`,
 * enforced by RLS on every table these features touch: payouts, payout_recipients). So today this
 * is equivalent to "is signed in", and the real access boundary is already enforced server-side by
 * RLS + the lenco-payout edge function's own recipient lookup (see its file comment) rather than by
 * this hook. This hook exists as the single place to tighten once a real manager/staff role ships —
 * swap its body for an actual role check then, no caller needs to change. */
export function useIsOwner(): boolean {
  const { session } = useAuth();
  return !!session;
}
