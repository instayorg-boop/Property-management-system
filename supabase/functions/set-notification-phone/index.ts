// Sets the phone number that receives day-to-day text alerts (maintenance and tenant requests), and/or a
// team member's own payment-digest cadence and per-event SMS preferences.
// Invoke: supabase.functions.invoke('set-notification-phone', {
//   body: { propertyId, memberId?, phone?, paymentSmsMode?, smsNotificationPrefs?, test? }
// })
//   memberId omitted  -> the caller's own row (owner: settings.*, the owner's shared alert config;
//                        member: their own team_members row)
//   memberId given    -> owner only, for someone else's row
//   phone omitted     -> leaves the phone unchanged; '' clears it
//   paymentSmsMode / smsNotificationPrefs omitted -> left unchanged
//   test (default true) sends one confirmation text when phone is being set to a new, non-empty value
// Returns { ok, phone, testSent, paymentSmsMode, smsNotificationPrefs }.
//
// A member's own paymentSmsMode/smsNotificationPrefs start as a one-time copy of the owner's values,
// seeded by invite-team-member at invite time, and are edited independently from here on — this never
// touches the owner's settings row, and removing the member later needs no cleanup on the owner's side.

import { handleOptions } from './_shared/cors.ts';
import { sendSms } from './_shared/sms.ts';
import { adminClient, getAccess, getCaller, json, personName, writeAudit } from './_shared/team.ts';

const PAYMENT_SMS_MODES = ['off', 'hourly_digest', 'daily_digest', 'weekly_digest'];
const PREF_KEYS = ['newMaintenanceReport', 'upcomingPayout', 'overdueEscalated'];

// Accepts 09xxxxxxxx, 9xxxxxxxx, 2609xxxxxxxx, +2609xxxxxxxx (also 7x). Returns 0XXXXXXXXX or null.
function normalizeZm(input: string): string | null {
  const digits = input.split('').filter((c) => c >= '0' && c <= '9').join('');
  let n = digits;
  if (n.startsWith('260')) n = n.slice(3);
  else if (n.startsWith('0')) n = n.slice(1);
  if (n.length !== 9) return null;
  if (n[0] !== '9' && n[0] !== '7') return null;
  return `0${n}`;
}

function cleanPrefs(input: unknown): { ok: true; prefs: Record<string, boolean> } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'smsNotificationPrefs must be an object.' };
  }
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!PREF_KEYS.includes(k)) return { ok: false, error: `Unknown notification preference: ${k}.` };
    if (typeof v !== 'boolean') return { ok: false, error: `${k} must be true or false.` };
    out[k] = v;
  }
  return { ok: true, prefs: out };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const admin = adminClient();
  const user = await getCaller(req, admin);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const propertyId = String(body.propertyId ?? '').trim();
  if (!propertyId) return json({ error: 'propertyId is required' }, 400);
  const memberId = typeof body.memberId === 'string' && body.memberId.trim() ? body.memberId.trim() : null;
  const sendTest = body.test !== false;

  const settingPhone = Object.prototype.hasOwnProperty.call(body, 'phone');
  const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
  let phone: string | null = null;
  if (settingPhone && rawPhone) {
    phone = normalizeZm(rawPhone);
    if (!phone) return json({ error: 'Enter a valid Zambian mobile number, for example 097 123 4567.' }, 400);
  }

  const settingMode = Object.prototype.hasOwnProperty.call(body, 'paymentSmsMode');
  if (settingMode && !PAYMENT_SMS_MODES.includes(String(body.paymentSmsMode))) {
    return json({ error: 'Unknown payment summary mode.' }, 400);
  }

  const settingPrefs = Object.prototype.hasOwnProperty.call(body, 'smsNotificationPrefs');
  let cleanedPrefs: Record<string, boolean> | null = null;
  if (settingPrefs) {
    const cleaned = cleanPrefs(body.smsNotificationPrefs);
    if (!cleaned.ok) return json({ error: cleaned.error }, 400);
    cleanedPrefs = cleaned.prefs;
  }

  const access = await getAccess(admin, propertyId, user);
  if (!access) return json({ error: `You don't have access to that property.` }, 403);

  const { data: st } = await admin.from('settings').select('landlord_name').eq('property_id', propertyId).maybeSingle();
  const actorName = personName(user, access.isOwner ? st?.landlord_name ?? undefined : undefined);
  const now = new Date().toISOString();

  let targetLabel = 'their own number';
  let resultPhone: string | null = null;
  let resultMode: string | null = null;
  let resultPrefs: Record<string, boolean> | null = null;

  if (!memberId && access.isOwner) {
    // The owner's own alert config lives in settings.
    const patch: Record<string, unknown> = {};
    if (settingPhone) patch.notification_phone = phone;
    if (settingMode) patch.payment_sms_mode = body.paymentSmsMode;
    if (settingPrefs) patch.sms_notification_prefs = cleanedPrefs;
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from('settings').update(patch).eq('property_id', propertyId);
      if (error) return json({ error: `Couldn't save that.`, detail: error.message }, 500);
    }
    const { data: row } = await admin.from('settings').select('notification_phone, payment_sms_mode, sms_notification_prefs').eq('property_id', propertyId).maybeSingle();
    resultPhone = row?.notification_phone ?? null;
    resultMode = row?.payment_sms_mode ?? null;
    resultPrefs = (row?.sms_notification_prefs ?? {}) as Record<string, boolean>;
    targetLabel = 'the owner alert settings';
  } else {
    let q = admin.from('team_members').select('id,user_id,invited_email,status,notification_phone,payment_sms_mode,sms_notification_prefs').eq('property_id', propertyId);
    q = memberId ? q.eq('id', memberId) : q.eq('user_id', user.id).eq('status', 'active');
    const { data: member } = await q.maybeSingle();
    if (!member) return json({ error: `That team member wasn't found.` }, 404);
    if (member.status === 'revoked') return json({ error: 'That person was removed from the team.' }, 400);
    if (!access.isOwner && member.user_id !== user.id) return json({ error: 'You can only change your own settings.' }, 403);

    const patch: Record<string, unknown> = { updated_at: now };
    if (settingPhone) patch.notification_phone = phone;
    if (settingMode) patch.payment_sms_mode = body.paymentSmsMode;
    if (settingPrefs) patch.sms_notification_prefs = cleanedPrefs;
    const { error } = await admin.from('team_members').update(patch).eq('id', member.id);
    if (error) return json({ error: `Couldn't save that.`, detail: error.message }, 500);

    resultPhone = settingPhone ? phone : member.notification_phone ?? null;
    resultMode = settingMode ? String(body.paymentSmsMode) : member.payment_sms_mode ?? null;
    resultPrefs = settingPrefs ? cleanedPrefs : ((member.sms_notification_prefs ?? {}) as Record<string, boolean>);
    targetLabel = member.user_id === user.id ? 'their own settings' : `the settings for ${member.invited_email}`;
  }

  await writeAudit(admin, {
    property_id: propertyId, actor_id: user.id, actor_label: actorName, action: 'team.notification_prefs',
    summary: settingPhone ? (phone ? `Set ${targetLabel} for text alerts` : `Cleared ${targetLabel} for text alerts`) : `Updated ${targetLabel}`,
    target_type: 'team_member', target_id: memberId, metadata: { settingPhone, settingMode, settingPrefs, cleared: settingPhone && !phone },
  });

  let testSent = false;
  if (settingPhone && phone && sendTest) {
    const msg = `Instay Manage: this number will now get day-to-day text alerts for ${access.prop.name}.`.slice(0, 160);
    const r = await sendSms(phone, msg);
    testSent = r.ok;
    await admin.from('sms_send_log').insert({
      property_id: propertyId, recipient_phone: phone, category: 'phone_test', status: r.ok ? 'sent' : 'failed', message: msg,
      recipient_role: memberId || !access.isOwner ? 'manager' : 'owner',
    });
  }

  return json({ ok: true, phone: resultPhone, testSent, paymentSmsMode: resultMode, smsNotificationPrefs: resultPrefs });
});
