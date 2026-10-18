// Runs once a day via pg_cron. For every property whose settings.payout_day matches today's weekday, OR whose payout
// was held earlier (settings.payout_retry_pending), claims whatever rent has been collected since its last payout and
// sends it out. No landlord present, no OTP, so authorization is the shared secret only pg_cron knows (CRON_SECRET).
//
// Fee model: real tiered Lenco fee plus the same K5 markup as an on-demand payout (SCHEDULED_MARKUP).
//
// Limits (see platform_money_limits, editable with SQL):
//   - One transfer never exceeds the per-transfer maximum for the destination (mobile money or bank). A bigger balance
//     is sent as several transfers in the same run (up to MAX_CHUNKS), and anything left waits for the next run.
//   - A scheduled payout under MIN_PAYOUT (K500) is not sent. The money stays and rolls into the next payout day.
//   - Before every transfer the live Lenco wallet balance is checked. If it cannot cover the transfer plus Lenco's fee,
//     the claim is released, nothing is sent, the company is emailed, and the landlord is told it is delayed.
//
// Held payouts: when a payout cannot go out for a reason that will clear (no payout account, wallet low, Lenco said no),
// the property is flagged (payout_retry_pending). It is retried on every daily run until it succeeds, and the landlord is
// emailed at most once a day with the reason.
//
// Claiming: pay_portal_claim_payout_collections atomically marks unclaimed successful collections with this payout's id
// (for update skip locked) so a concurrent on-demand request can never double-pay the same money.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { getWallet, lencoTransferFee, round2 } from '../_shared/lenco.ts';
import { getLimits, maxForRecipient } from '../_shared/limits.ts';
import { alertCompany } from '../_shared/companyAlert.ts';
import { buildNoticeEmailHtml, sendEmail } from '../_shared/noticeEmail.ts';

const SCHEDULED_MARKUP = 5;
const MIN_PAYOUT = 500;
const MAX_CHUNKS = 5;
const NOTIFY_EVERY_HOURS = 20;

function todayWeekday(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Africa/Lusaka' });
}

type SettingsRow = {
  property_id: string;
  payout_day: string | null;
  payout_retry_pending: boolean | null;
  payout_hold_notified_at: string | null;
  account_email: string | null;
  landlord_name: string | null;
};

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const lencoSecretKey = Deno.env.get('LENCO_SECRET_KEY');
  if (!lencoSecretKey) {
    return new Response(JSON.stringify({ error: 'LENCO_SECRET_KEY is not configured' }), { status: 500 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const today = todayWeekday();
  const limits = await getLimits(supabase);

  const { data: dueSettings, error: settingsError } = await supabase
    .from('settings')
    .select('property_id, payout_day, payout_retry_pending, payout_hold_notified_at, account_email, landlord_name')
    .or(`payout_day.eq.${today},payout_retry_pending.eq.true`);
  if (settingsError) {
    return new Response(JSON.stringify({ error: 'Failed to look up properties due today', detail: settingsError.message }), { status: 500 });
  }
  const due = (dueSettings ?? []) as SettingsRow[];

  // Read the wallet once and keep a running balance so several transfers in one run cannot overspend it.
  const wallet = due.length > 0 ? await getWallet(lencoSecretKey) : { ok: true, available: null as number | null, accountId: undefined };
  let walletLeft: number | null = wallet.available;

  const results: Record<string, unknown>[] = [];

  // Flag the property for a daily retry and tell the landlord why, at most once every NOTIFY_EVERY_HOURS.
  async function hold(row: SettingsRow, reason: string, landlordText: string) {
    const last = row.payout_hold_notified_at ? new Date(row.payout_hold_notified_at).getTime() : 0;
    const shouldNotify = Date.now() - last > NOTIFY_EVERY_HOURS * 3_600_000;
    const patch: Record<string, unknown> = { payout_retry_pending: true, payout_hold_reason: reason };
    if (shouldNotify && row.account_email) {
      try {
        const { data: prop } = await supabase.from('properties').select('name').eq('id', row.property_id).maybeSingle();
        const name = (prop?.name as string | undefined) ?? 'your property';
        const subject = `Your payout for ${name} is waiting`;
        await sendEmail(row.account_email, subject, landlordText, buildNoticeEmailHtml('Your payout is waiting', landlordText, [{ label: 'Property', value: name }]));
        patch.payout_hold_notified_at = new Date().toISOString();
      } catch (err) {
        console.error('[scheduled-payouts] landlord email failed', row.property_id, String(err));
      }
    }
    await supabase.from('settings').update(patch).eq('property_id', row.property_id);
  }

  async function clearHold(row: SettingsRow) {
    if (row.payout_retry_pending) {
      await supabase.from('settings').update({ payout_retry_pending: false, payout_hold_reason: null }).eq('property_id', row.property_id);
    }
  }

  for (const row of due) {
    const propertyId = row.property_id;

    const { data: inFlight } = await supabase
      .from('payouts')
      .select('id')
      .eq('property_id', propertyId)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .maybeSingle();
    if (inFlight) {
      results.push({ propertyId, skipped: 'a payout is already pending or processing for this property' });
      continue;
    }

    const { data: recipient } = await supabase
      .from('payout_recipients')
      .select('id, type, lenco_recipient_id, account_name, account_number, phone_number, provider')
      .eq('property_id', propertyId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();
    if (!recipient) {
      // Only worth a message when there is real money waiting.
      const { data: bal } = await supabase.from('property_balances').select('available_balance').eq('property_id', propertyId).maybeSingle();
      const waiting = round2(Number(bal?.available_balance ?? 0));
      if (waiting >= MIN_PAYOUT) {
        await hold(
          row,
          'no default payout account',
          `K${waiting.toFixed(2)} of rent is ready to be paid out, but there is no default payout account on this property. Open Payouts, add a mobile money number or bank account, and tap Make default. Your payout will go out on the next daily run after that.`,
        );
      }
      results.push({ propertyId, skipped: 'no default payout recipient set up', waiting });
      continue;
    }

    const cap = maxForRecipient(limits, recipient.type);

    for (let chunk = 1; chunk <= MAX_CHUNKS; chunk++) {
      const { data: payoutRow, error: insertError } = await supabase
        .from('payouts')
        .insert({ property_id: propertyId, payout_recipient_id: recipient.id, amount: 0, status: 'pending', narration: 'Scheduled rent payout' })
        .select()
        .single();
      if (insertError || !payoutRow) {
        results.push({ propertyId, skipped: 'failed to record payout', detail: insertError?.message });
        break;
      }

      const { data: grossRaw, error: claimError } = await supabase.rpc('pay_portal_claim_payout_collections', {
        p_property_id: propertyId,
        p_payout_id: payoutRow.id,
        p_max_amount: cap,
      });
      if (claimError) {
        await supabase.from('payouts').update({ status: 'failed', failure_reason: 'Failed to claim collections' }).eq('id', payoutRow.id);
        results.push({ propertyId, payoutId: payoutRow.id, failed: 'claim RPC error', detail: claimError.message });
        break;
      }

      const grossAmount = round2(Number(grossRaw ?? 0));
      if (grossAmount <= 0) {
        await supabase.from('payouts').delete().eq('id', payoutRow.id);
        if (chunk === 1) {
          await clearHold(row);
          results.push({ propertyId, skipped: 'nothing collected since last payout' });
        }
        break;
      }

      const release = async () => {
        await supabase.rpc('pay_portal_release_payout_collections', { p_payout_id: payoutRow.id });
        await supabase.from('payouts').delete().eq('id', payoutRow.id);
      };

      if (grossAmount < MIN_PAYOUT) {
        await release();
        // Below the minimum is not a fault: it simply rolls into the next payout day, so any old hold is cleared.
        await clearHold(row);
        results.push({ propertyId, skipped: `under the K${MIN_PAYOUT} minimum, rolls into the next payout`, grossAmount });
        break;
      }

      const feeAmount = round2(lencoTransferFee(grossAmount) + SCHEDULED_MARKUP);
      const netAmount = round2(grossAmount - feeAmount);
      if (netAmount <= 0) {
        await release();
        results.push({ propertyId, skipped: 'amount too small to cover the transfer fee', grossAmount, feeAmount });
        break;
      }

      // Wallet check: the transfer plus Lenco's own fee must fit in what is spendable right now.
      if (!wallet.ok || !wallet.accountId) {
        await release();
        await hold(row, 'payment provider unavailable', `Your payout of about K${netAmount.toFixed(2)} is delayed because our payment provider could not be reached. We will try again tomorrow, and you do not need to do anything.`);
        results.push({ propertyId, failed: 'no Lenco account' });
        break;
      }
      const needed = round2(netAmount + lencoTransferFee(netAmount));
      if (walletLeft !== null && walletLeft < needed) {
        await release();
        await alertCompany(
          'Scheduled payout held: Lenco wallet too low',
          'Payout held',
          `A scheduled payout of K${netAmount.toFixed(2)} could not be sent because the Lenco wallet has K${walletLeft.toFixed(2)} spendable. The rent stays with the landlord and retries on the next run.`,
          [{ label: 'Property', value: propertyId }, { label: 'Needed', value: `K${needed.toFixed(2)}` }],
          'Recent tenant payments may still be settling into the wallet.',
        );
        await hold(row, 'wallet low', `Your payout of K${netAmount.toFixed(2)} is delayed while recent payments finish settling. Your money is safe, it stays on your balance, and we will try again tomorrow. You do not need to do anything.`);
        results.push({ propertyId, skipped: 'wallet_low', needed, available: walletLeft });
        break;
      }

      const narration = `Scheduled rent payout - ${recipient.account_name ?? recipient.phone_number} (fee K${feeAmount.toFixed(2)})`;
      await supabase.from('payouts').update({ amount: grossAmount, fee_amount: feeAmount, net_amount: netAmount, narration }).eq('id', payoutRow.id);

      try {
        const isMobileMoney = recipient.type === 'mobile-money';
        const lencoResponse = await fetch(`https://api.lenco.co/access/v2/transfers/${isMobileMoney ? 'mobile-money' : 'bank-account'}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${lencoSecretKey}`, 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(
            isMobileMoney
              ? { accountId: wallet.accountId, amount: netAmount, reference: payoutRow.id, narration, phone: recipient.phone_number, operator: recipient.provider, country: 'zm' }
              : { accountId: wallet.accountId, amount: netAmount, reference: payoutRow.id, narration, transferRecipientId: recipient.lenco_recipient_id, country: 'zm' },
          ),
        });
        const lencoJson = await lencoResponse.json();

        if (!lencoResponse.ok && lencoResponse.status >= 500) {
          await supabase.from('payouts').update({ status: 'processing', failure_reason: 'Lenco response not confirmed, awaiting confirmation' }).eq('id', payoutRow.id);
          if (walletLeft !== null) walletLeft = round2(walletLeft - needed);
          results.push({ propertyId, payoutId: payoutRow.id, status: 'unknown' });
          break;
        }

        if (!lencoResponse.ok) {
          const reason = String(lencoJson.message ?? 'Lenco rejected the transfer');
          await supabase.from('payouts').update({ status: 'failed', failure_reason: reason }).eq('id', payoutRow.id);
          await supabase.rpc('pay_portal_release_payout_collections', { p_payout_id: payoutRow.id });
          await hold(row, `rejected: ${reason}`, `Your payout of K${netAmount.toFixed(2)} could not be sent: ${reason}. Please check your default payout account on the Payouts page. We will try again tomorrow.`);
          results.push({ propertyId, payoutId: payoutRow.id, failed: reason });
          break;
        }

        const lencoTransactionId: string | undefined = lencoJson.data?.id;
        await supabase.from('payouts').update({ status: 'processing', lenco_transaction_id: lencoTransactionId ?? null }).eq('id', payoutRow.id);
        if (walletLeft !== null) walletLeft = round2(walletLeft - needed);
        await clearHold(row);
        results.push({ propertyId, payoutId: payoutRow.id, chunk, grossAmount, feeAmount, netAmount, status: 'processing' });
        // Loop again: if the balance was bigger than one transfer allows, the next chunk sends the rest.
      } catch (err) {
        // Unknown outcome: leave processing, keep the claim locked. reconcile-stuck-payouts will resolve it.
        await supabase.from('payouts').update({ status: 'processing', failure_reason: 'Lenco response not received, awaiting confirmation' }).eq('id', payoutRow.id);
        results.push({ propertyId, payoutId: payoutRow.id, status: 'unknown', detail: String(err) });
        break;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, day: today, processed: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
