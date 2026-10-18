// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function isLedgerV2Enabled(supabase: SupabaseClient, propertyId: string): Promise<boolean> {
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("owner_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError || !property) {
    console.error("[isLedgerV2Enabled] failed to resolve property owner", propertyId, propertyError?.message);
    return false;
  }
  return isLedgerV2EnabledForLandlord(supabase, property.owner_id);
}

export async function isLedgerV2EnabledForLandlord(supabase: SupabaseClient, landlordId: string): Promise<boolean> {
  const { data: flag, error: flagError } = await supabase
    .from("ledger_feature_flags")
    .select("ledger_v2_enabled")
    .eq("landlord_id", landlordId)
    .maybeSingle();
  if (flagError) {
    console.error("[isLedgerV2EnabledForLandlord] failed to read ledger_feature_flags, defaulting to legacy path", landlordId, flagError.message);
    return false;
  }
  return flag?.ledger_v2_enabled === true;
}

export async function getLedgerV2DueAndOverdue(supabase: SupabaseClient, tenantId: string): Promise<{ owed: number; daysOverdue: number }> {
  const { data: dueRaw, error: dueError } = await supabase.rpc("amount_due_now", { p_tenant_id: tenantId });
  if (dueError) {
    console.error("[getLedgerV2DueAndOverdue] amount_due_now failed", tenantId, dueError.message);
    return { owed: 0, daysOverdue: 0 };
  }
  const owed = Number(dueRaw ?? 0);
  if (owed <= 0) return { owed, daysOverdue: 0 };

  const { data: periods, error: periodsError } = await supabase
    .from("period_status_view")
    .select("billing_period, period_status")
    .eq("tenant_id", tenantId)
    .neq("period_status", "PAID")
    .order("billing_period", { ascending: true })
    .limit(1);
  if (periodsError || !periods || periods.length === 0) {
    return { owed, daysOverdue: 0 };
  }
  const oldest = new Date(periods[0].billing_period).getTime();
  const daysOverdue = Math.max(0, Math.floor((Date.now() - oldest) / 86400000));
  return { owed, daysOverdue };
}
