// Runs every 15 minutes via pg_cron. Finds payouts stuck on 'pending' or 'processing' for more than 10 minutes,
// asks Lenco for the real status, and applies it like the webhook would. A failed transfer releases its claimed
// collections back to the balance (once only). Authorization is the shared secret only pg_cron knows (CRON_SECRET).
//
// A payout still 'processing' after 24 hours is not guessed at: the company is emailed so a person can look.

import { adminClient } from '../_shared/access.ts';
import { alertCompany } from '../_shared/companyAlert.ts';

const STUCK_AFTER_MINUTES = 10;
const ESCALATE_AFTER_HOURS = 24;
const BATCH = 50;

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const lencoSecretKey = Deno.env.get('LENCO_SECRET_KEY');
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: 'LENCO_SECRET_KEY is not configured' }), { status: 500 });
  }

  const db = adminClient();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000).toISOString();
  const { data: stuck, error } = await db
    .from('payouts')
    .select('id, property_id, status, net_amount, created_at')
    .in('status', ['pending', 'processing'])
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results: Record<string, unknown>[] = [];
  const escalate: { id: string; amount: number }[] = [];

  for (const payout of stuck ?? []) {
    let lencoStatus: string | undefined;
    let reason: string | null = null;
    let lencoTransactionId: string | undefined;
    try {
      const res = await fetch(`https://api.lenco.co/access/v2/transfers/status/${payout.id}`, {
        headers: { Authorization: `Bearer ${lencoSecretKey}`, accept: 'application/json' },
      });
      const body = await res.json();
      if (res.ok && body?.data) {
        lencoStatus = body.data.status;
        reason = body.data.reasonForFailure ?? body.data.failure_reason ?? null;
        lencoTransactionId = body.data.id;
      }
    } catch (err) {
      console.error('[reconcile-stuck-payouts] Lenco unreachable', payout.id, String(err));
    }

    if (lencoStatus !== 'successful' && lencoStatus !== 'failed') {
      const ageHours = (Date.now() - new Date(payout.created_at as string).getTime()) / 3_600_000;
      if (ageHours >= ESCALATE_AFTER_HOURS) escalate.push({ id: payout.id as string, amount: Number(payout.net_amount ?? 0) });
      results.push({ payoutId: payout.id, unchanged: payout.status, lenco: lencoStatus ?? 'unknown' });
      continue;
    }

    const { data: updated, error: updateError } = await db
      .from('payouts')
      .update({
        status: lencoStatus,
        lenco_transaction_id: lencoTransactionId ?? undefined,
        failure_reason: lencoStatus === 'failed' ? reason : null,
      })
      .eq('id', payout.id)
      .in('status', ['pending', 'processing'])
      .select('id');

    if (!updateError && lencoStatus === 'failed' && updated && updated.length > 0) {
      const { error: releaseError } = await db.rpc('pay_portal_release_payout_collections', { p_payout_id: payout.id });
      if (releaseError) console.error('[reconcile-stuck-payouts] release failed', payout.id, releaseError.message);
    }
    results.push({ payoutId: payout.id, resolved: lencoStatus });
  }

  if (escalate.length > 0) {
    await alertCompany(
      'Payouts stuck for over 24 hours',
      'Payouts need a look',
      `${escalate.length} payout(s) are still not confirmed by Lenco after ${ESCALATE_AFTER_HOURS} hours.`,
      escalate.slice(0, 10).map((e) => ({ label: 'Payout', value: `${e.id} (K${e.amount.toFixed(2)})` })),
      'The landlord money stays locked to these payouts until they resolve.',
    );
  }

  return new Response(JSON.stringify({ ok: true, checked: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
