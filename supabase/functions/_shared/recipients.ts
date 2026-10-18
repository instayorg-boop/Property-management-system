// Who receives day-to-day (operations) texts for a property, and what each of them has opted into.
//
// Routing: any active team member holding alerts.operations with a notification_phone gets it.
// If nobody qualifies, the owner's own alert phone is the fallback. If settings.ops_sms_owner_copy
// is on, the owner also gets a copy in addition to whichever managers got it.
//
// Each recipient carries their OWN effective sms_notification_prefs (team_members.sms_notification_prefs
// for a manager, settings.sms_notification_prefs for the owner) so a category can be skipped per
// recipient — e.g. a manager who turned off "new maintenance report" texts still gets everything else,
// while the owner (or another manager) who left it on still gets texted.
// deno-lint-ignore no-explicit-any
type Db = any;

export type Recipient = { phone: string; role: "owner" | "manager"; prefs: Record<string, boolean> };

// Maps a notifications.category to the settings/team_members sms_notification_prefs key that gates it.
// A category with no entry here is never gated (always sent to whoever qualifies as a recipient).
export const CATEGORY_TO_PREF: Record<string, string> = {
  maintenance: "newMaintenanceReport",
};

function effectivePrefs(raw: unknown): Record<string, boolean> {
  return (raw ?? {}) as Record<string, boolean>;
}

function tail(p: string): string {
  return p.replace(/[^0-9]/g, "").slice(-9);
}

export async function opsRecipients(db: Db, propertyId: string): Promise<Recipient[]> {
  const { data: s } = await db
    .from("settings")
    .select("notification_phone, ops_sms_owner_copy, sms_notification_prefs")
    .eq("property_id", propertyId)
    .maybeSingle();
  const { data: members } = await db
    .from("team_members")
    .select("notification_phone, permissions, sms_notification_prefs")
    .eq("property_id", propertyId)
    .eq("status", "active");

  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const m of members ?? []) {
    const perms: string[] = m.permissions ?? [];
    const phone = String(m.notification_phone ?? "").trim();
    if (!phone || !perms.includes("alerts.operations")) continue;
    const key = tail(phone);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ phone, role: "manager", prefs: effectivePrefs(m.sms_notification_prefs) });
  }
  const ownerPhone = String(s?.notification_phone ?? "").trim();
  if (ownerPhone && (out.length === 0 || s?.ops_sms_owner_copy)) {
    const key = tail(ownerPhone);
    if (key && !seen.has(key)) out.push({ phone: ownerPhone, role: "owner", prefs: effectivePrefs(s?.sms_notification_prefs) });
  }
  return out;
}

/** Drops any recipient who explicitly turned this category off for themselves. A recipient with no
 * opinion (key absent) stays in — same "default on unless set to false" rule settings has always used. */
export function filterByPref(recipients: Recipient[], category: string): Recipient[] {
  const prefKey = CATEGORY_TO_PREF[category];
  if (!prefKey) return recipients;
  return recipients.filter((r) => r.prefs[prefKey] !== false);
}
