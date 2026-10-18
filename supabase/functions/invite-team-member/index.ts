// Invites someone to a property's team. Owner always; a member with team.invite can too, but only for Manager/Viewer,
// never granting team.invite or anything they don't hold themselves. Only the owner can invite a Finance officer.
// Invoke: supabase.functions.invoke('invite-team-member', { body: { propertyId, email, role, permissions?, phone? } })
// permissions omitted = the role's default checklist. `phone` is optional, stored as invited_phone (display only);
// the number that receives text alerts is set afterwards with set-notification-phone. Returns { ok, memberId, devLink? }.
//
// payment_sms_mode and sms_notification_prefs are seeded here as a ONE-TIME COPY of the owner's current
// settings values (never a live reference) — so a brand-new member starts out matching the owner's cadence/prefs,
// then tunes their own independently from then on via set-notification-phone. If the owner later removes this
// member, nothing reverts: the owner's settings were never touched, and the member's row (with its own copy of
// these prefs) simply ceases to exist with them.

import { handleOptions } from './_shared/cors.ts';
import { sendEmail, buildInviteEmailHtml } from './_shared/email.ts';
import {
  EMAIL_RE, INVITE_TTL_DAYS, ROLES, ROLE_LABELS, adminClient, cleanPermissions, getAccess, getCaller,
  inviteLink, json, newInviteToken, personName, roleTemplate, seatsInfo, writeAudit,
} from './_shared/team.ts';

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
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '').trim();
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  if (!propertyId) return json({ error: 'propertyId is required' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
  if (!ROLES.includes(role)) return json({ error: 'Pick a role: manager, finance officer or viewer.' }, 400);
  if (email === (user.email ?? '').toLowerCase()) return json({ error: `You can't invite yourself.` }, 400);

  const access = await getAccess(admin, propertyId, user);
  if (!access) return json({ error: `You don't have access to that property.` }, 403);
  if (!access.isOwner && !access.perms.includes('team.invite')) {
    return json({ error: `You don't have permission to invite people.` }, 403);
  }
  if (!access.isOwner && role === 'finance_officer') {
    return json({ error: 'Only the owner can invite a Finance officer.' }, 403);
  }

  let perms: string[];
  if (body.permissions === undefined || body.permissions === null) {
    perms = await roleTemplate(admin, role);
  } else {
    const cleaned = cleanPermissions(body.permissions);
    if (!cleaned.ok) return json({ error: cleaned.error }, 400);
    perms = cleaned.perms;
  }
  if (!access.isOwner) {
    if (perms.includes('team.invite')) return json({ error: 'Only the owner can let someone invite others.' }, 403);
    const missing = perms.filter((p) => !access.perms.includes(p));
    if (missing.length) return json({ error: `You can't grant access you don't have: ${missing.join(', ')}.` }, 403);
  }

  // Seats: Viewers are free and uncounted.
  if (role !== 'viewer') {
    const seats = await seatsInfo(admin, propertyId);
    if (seats.max !== null && seats.used >= seats.max) {
      return json({
        error: `Your ${seats.plan} plan includes ${seats.max} team seats and all are in use. Viewers are free.`,
        code: 'seat_limit', seats,
      }, 409);
    }
  }

  const { data: existing } = await admin
    .from('team_members').select('id,status')
    .eq('property_id', propertyId).eq('invited_email', email)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existing?.status === 'active') return json({ error: 'That person is already on the team.', code: 'already_member' }, 409);
  if (existing?.status === 'invited') return json({ error: 'That person already has a pending invite. Use Resend.', code: 'already_invited' }, 409);

  const { token, hash } = await newInviteToken();
  const now = new Date();
  const expires = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  // One-time copy of the owner's current payment_sms_mode / sms_notification_prefs. Not a live
  // reference: from here on this member's own values live only on their team_members row.
  const { data: ownerSettings } = await admin
    .from('settings').select('landlord_name, payment_sms_mode, sms_notification_prefs').eq('property_id', propertyId).maybeSingle();

  const row = {
    property_id: propertyId, invited_email: email, invited_phone: phone, role, permissions: perms, status: 'invited',
    invited_by: user.id, invited_at: now.toISOString(), accepted_at: null, revoked_by: null, revoked_at: null,
    user_id: null, invite_token_hash: hash, invite_expires_at: expires.toISOString(), updated_at: now.toISOString(),
    payment_sms_mode: ownerSettings?.payment_sms_mode ?? 'daily_digest',
    sms_notification_prefs: ownerSettings?.sms_notification_prefs ?? {},
  };

  let memberId: string;
  if (existing?.status === 'revoked') {
    const { error } = await admin.from('team_members').update(row).eq('id', existing.id);
    if (error) return json({ error: `Couldn't save the invite.`, detail: error.message }, 500);
    memberId = existing.id;
  } else {
    const { data, error } = await admin.from('team_members').insert(row).select('id').single();
    if (error) {
      const dup = (error as { code?: string }).code === '23505';
      return json({ error: dup ? 'That person is already on the team or invited.' : `Couldn't save the invite.`, detail: error.message }, dup ? 409 : 500);
    }
    memberId = data.id;
  }

  const inviterName = personName(user, access.isOwner ? ownerSettings?.landlord_name ?? undefined : undefined);
  const roleLabel = ROLE_LABELS[role];
  const link = inviteLink(token);

  await writeAudit(admin, {
    property_id: propertyId, actor_id: user.id, actor_label: inviterName, action: 'team.invite',
    summary: `Invited ${email} as ${roleLabel}`, target_type: 'team_member', target_id: memberId,
    metadata: { email, role, permissions: perms },
  });

  const subject = `${inviterName} invited you to ${access.prop.name} on Instay Manage`;
  const text = `${inviterName} invited you to help manage ${access.prop.name} on Instay Manage as ${roleLabel}.\n\nAccept the invite: ${link}\n\nThis link expires in ${INVITE_TTL_DAYS} days. If you weren't expecting it, ignore this email.`;
  const html = buildInviteEmailHtml(
    `Join ${access.prop.name} on Instay Manage`,
    `${inviterName} invited you to help manage ${access.prop.name}. Set up your login to get started.`,
    [{ label: 'Property', value: access.prop.name }, { label: 'Your role', value: roleLabel }],
    'Accept invite', link, INVITE_TTL_DAYS,
    `You're receiving this because ${inviterName} invited you to join a property on Instay Manage. If you weren't expecting it, you can ignore this email.`,
  );

  try {
    const result = await sendEmail(email, subject, text, html);
    if (result.dev) return json({ ok: true, memberId, devLink: link });
  } catch (err) {
    console.error('[invite-team-member] email failed', String(err));
    return json({ error: 'The invite was saved but the email did not send. Use Resend to try again.', code: 'email_failed', memberId }, 502);
  }
  return json({ ok: true, memberId });
});
