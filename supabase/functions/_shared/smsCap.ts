// Per-property daily SMS cap — the safety fuse against a runaway loop, not the normal operating
// mechanism (normal payment activity should produce ~1 digest SMS regardless of tenant count, so
// this should essentially never trip in practice). Uses a single atomic
// INSERT ... ON CONFLICT ... RETURNING (public.increment_sms_daily_counter) rather than a
// check-then-insert, which would race under concurrent sends.
import { todayYMD } from "./billingPeriod.ts";

const DEFAULT_DAILY_CAP = 200;

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Increments today's counter and reports whether the property is still within its cap. Fails
 * open (allows the send) on a DB error — a monitoring hiccup shouldn't be able to silently block
 * every SMS a property sends; the actual event this guards against is a bug looping sends, not a
 * transient RPC failure. */
export async function withinDailySmsCap(supabase: SupabaseClient, propertyId: string, cap = DEFAULT_DAILY_CAP): Promise<boolean> {
  const { data, error } = await supabase.rpc("increment_sms_daily_counter", { p_property_id: propertyId, p_day: todayYMD() });
  if (error) {
    console.error("[smsCap] failed to check/increment daily cap — failing open", propertyId, error.message);
    return true;
  }
  return (data ?? 0) <= cap;
}
