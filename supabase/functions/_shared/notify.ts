import { sendEmail, buildNoticeEmailHtml } from './noticeEmail.ts';
import type { PayoutAccess } from './access.ts';

export type NoticeOptions = {
  subject: string;
  heading: string;
  text: string;
  details: { label: string; value: string }[];
  warning?: string;
  // true = tell the owner even when the owner is the one acting (used for new payout methods)
  includeOwnerEvenIfActor?: boolean;
};

// Emails the owner (when someone else acted, or includeOwnerEvenIfActor) plus every active member holding
// alerts.receive, except the person who acted. Each send is isolated so one bounce never blocks the rest.
// deno-lint-ignore no-explicit-any
export async function notifyPayoutEvent(admin: any, access: PayoutAccess, actorId: string, opts: NoticeOptions) {
  const to = new Set<string>();
  if (!access.isOwner || opts.includeOwnerEvenIfActor) {
    const { data: s } = await admin.from('settings').select('account_email').eq('property_id', access.prop.id).maybeSingle();
    let email: string | undefined = s?.account_email ?? undefined;
    if (!email) {
      const { data } = await admin.auth.admin.getUserById(access.prop.owner_id);
      email = data?.user?.email ?? undefined;
    }
    if (email) to.add(email.toLowerCase());
  }
  const { data: members } = await admin.from('team_members').select('invited_email,user_id,permissions')
    .eq('property_id', access.prop.id).eq('status', 'active');
  for (const m of members ?? []) {
    if (m.user_id !== actorId && (m.permissions ?? []).includes('alerts.receive') && m.invited_email) {
      to.add(String(m.invited_email).toLowerCase());
    }
  }
  const html = buildNoticeEmailHtml(opts.heading, opts.text, opts.details, opts.warning);
  for (const addr of to) {
    try {
      await sendEmail(addr, opts.subject, opts.text, html);
    } catch (err) {
      console.error('[notify] email failed', String(err));
    }
  }
}
