// Initiates a payout to one of the property's registered payout recipients via Lenco.
// Allowed for the owner, or an active team member holding payouts.request (checked live, no amount limit for the person).
// Limits, all checked BEFORE the confirmation code is used up so a refused attempt never burns the code:
//   - minimum payout (MIN_WITHDRAWAL) and at least that much available
//   - maximum for ONE transfer to this destination (platform_money_limits: max_mobile_money / max_bank). A bigger request
//     is split automatically into several equal-ish transfers (up to MAX_CHUNKS) under the one confirmation code.
//   - the live Lenco wallet must be able to cover every transfer plus Lenco's fees (recent payments can still be settling)
// Fees on a split payout: Lenco's tier fee and our K5 markup are both charged on every transfer.
// confirmationToken (purpose withdrawal) is required and must belong to the SAME person: the code is emailed to the acting
// person (owner: account email; member: their own login email). After the transfer starts, the acting person is written to
// payouts.requested_by, the audit log, and the owner (plus anyone with alerts.receive) is emailed. When a team member
// requested it and settings.payout_sms_enabled is on, the owner is also texted.
// Writes use the service role after the checks above; RLS on payouts stays owner-write only.
// Invoke: supabase.functions.invoke('lenco-payout', { body: { propertyId, amount, confirmationToken, narration?, recipientId? } })

import { handleOptions } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/otpCrypto.ts';
import { adminClient, getCaller, getPayoutAccess, json, personName, writeAudit } from '../_shared/access.ts';
import { notifyPayoutEvent } from '../_shared/notify.ts';
import { sendSms } from '../_shared/sms.ts';
import { getWallet, lencoTransferFee, round2 } from '../_shared/lenco.ts';
import { getLimits, maxForRecipient } from '../_shared/limits.ts';
import { alertCompany } from '../_shared/companyAlert.ts';

type LencoPayoutPayload = {
  propertyId?: string;
  amount?: number;
  narration?: string;
  recipientId?: string;
  confirmationToken?: string;
};

const MIN_WITHDRAWAL = 100; // Kwacha. Keep in step with request-withdrawal-otp.
const ON_DEMAND_MARKUP = 5;
const MAX_CHUNKS = 5;

function last4(v?: string | null): string {
  return (v ?? '').replace(/[^0-9]/g, '').slice(-4);
}

const WALLET_LOW_MESSAGE = 'Payouts are paused for a little while as recent payments finish settling. Nothing was taken from your balance. Please try again in a few hours.';

// How much gross to aim for in the next transfer. Never leaves a remainder too small to be worth sending:
// if what would be left after a full transfer is under the minimum, the last two transfers share the rest evenly.
function nextTarget(remaining: number, cap: number): number {
  if (remaining <= cap) return round2(remaining);
  if (remaining - cap < MIN_WITHDRAWAL) return round2(remaining / 2);
  return cap;
}

// Rough plan used only for the up-front wallet check and the maximum check.
function planChunks(total: number, cap: number): number[] {
  const out: number[] = [];
  let remaining = round2(total);
  while (remaining > 0 && out.length < MAX_CHUNKS + 1) {
    const g = nextTarget(remaining, cap);
    out.push(g);
    remaining = round2(remaining - g);
  }
  return out;
}

function chunkFee(gross: number): number {
  return round2(lencoTransferFee(gross) + ON_DEMAND_MARKUP);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: LencoPayoutPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const propertyId = payload.propertyId?.trim() ?? '';
  const amount = payload.amount;
  const confirmationToken = payload.confirmationToken?.trim() ?? '';
  const recipientId = payload.recipientId?.trim() || null;
  if (!propertyId || !amount || amount <= 0) return json({ error: 'propertyId and a positive amount are required' }, 400);
  if (!confirmationToken) {
    return json({ error: 'A withdrawal confirmation is required. Verify the code emailed to you first.' }, 401);
  }
  if (!req.headers.get('Authorization')) return json({ error: 'Missing Authorization header' }, 401);

  const lencoSecretKey = Deno.env.get('LENCO_SECRET_KEY');
  if (!lencoSecretKey) return json({ error: 'LENCO_SECRET_KEY is not configured' }, 500);

  const db = adminClient();
  const user = await getCaller(req, db);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const access = await getPayoutAccess(db, propertyId, user, ['payouts.request']);
  if (!access) return json({ error: `You don't have access to that property.` }, 403);
  if (!access.allowed) return json({ error: `You don't have permission to request payouts.` }, 403);

  // Minimum payout.
  if (amount < MIN_WITHDRAWAL) {
    return json({ error: `The smallest payout is K${MIN_WITHDRAWAL}.`, code: 'below_minimum', min: MIN_WITHDRAWAL }, 400);
  }
  const { data: balRow } = await db.from('property_balances').select('available_balance').eq('property_id', propertyId).maybeSingle();
  const availableNow = Number(balRow?.available_balance ?? 0);
  if (availableNow < MIN_WITHDRAWAL) {
    return json({
      error: `There is not enough to pay out yet. The smallest payout is K${MIN_WITHDRAWAL} and K${availableNow.toFixed(2)} is available.`,
      code: 'below_minimum', min: MIN_WITHDRAWAL, available: availableNow,
    }, 400);
  }

  // Destination, looked up BEFORE the code is burned so a bad destination or amount never costs a code.
  let recipientQuery = db
    .from('payout_recipients')
    .select('id, type, lenco_recipient_id, account_name, account_number, phone_number, provider')
    .eq('property_id', propertyId);
  recipientQuery = recipientId ? recipientQuery.eq('id', recipientId) : recipientQuery.eq('is_default', true);
  const { data: recipient, error: recipientError } = await recipientQuery.limit(1).maybeSingle();

  if (recipientError) return json({ error: 'Failed to look up payout recipient', detail: recipientError.message }, 500);
  if (!recipient) {
    return json({ error: 'No payout recipient is set up for this property yet. Add one in Settings > Bank & payouts.' }, 400);
  }
  if (recipient.type === 'bank' && !recipient.lenco_recipient_id) {
    return json({ error: 'This bank recipient is missing its Lenco reference. Re-add it in Settings.' }, 400);
  }
  if (recipient.type === 'mobile-money' && (!recipient.phone_number || !recipient.provider)) {
    return json({ error: 'This mobile money recipient is missing its phone or provider. Re-add it in Settings.' }, 400);
  }

  // Maximum for one transfer to this kind of destination. Bigger amounts are split, up to MAX_CHUNKS transfers.
  const limits = await getLimits(db);
  const cap = maxForRecipient(limits, recipient.type);
  const plan = planChunks(amount, cap);
  if (plan.length > MAX_CHUNKS) {
    const where = recipient.type === 'mobile-money' ? 'a mobile money number' : 'a bank account';
    const maxTotal = cap * MAX_CHUNKS;
    return json({
      error: `The most you can send to ${where} in one request is K${maxTotal.toLocaleString('en-US')}. Pay out up to that, then request the rest.`,
      code: 'above_maximum', max: maxTotal,
    }, 400);
  }

  // Can the Lenco wallet actually cover every transfer right now? (Checked early, before the code is burned.)
  const wallet = await getWallet(lencoSecretKey);
  if (!wallet.ok || !wallet.accountId) {
    return json({ error: `Couldn't find a Lenco account to pay out from`, detail: wallet.detail }, 502);
  }
  const walletNeedsEarly = round2(
    plan.reduce((sum, g) => {
      const net = Math.max(round2(g - chunkFee(g)), 0);
      return sum + net + lencoTransferFee(net);
    }, 0),
  );
  if (wallet.available !== null && wallet.available < walletNeedsEarly) {
    await alertCompany(
      'Payout blocked: Lenco wallet too low',
      'Payout blocked',
      `${access.prop.name} tried to pay out K${amount.toFixed(2)} but the Lenco wallet has K${wallet.available.toFixed(2)} spendable.`,
      [{ label: 'Property', value: access.prop.name }, { label: 'Needed', value: `K${walletNeedsEarly.toFixed(2)}` }],
      'Recent tenant payments may still be settling into the wallet.',
    );
    return json({ error: WALLET_LOW_MESSAGE, code: 'wallet_low' }, 503);
  }

  // The actual authorization boundary for moving money: the token must exist, be unexpired, match this purpose,
  // this property AND this person. It is burned in the same statement so it can't be replayed.
  const confirmationTokenHash = await sha256Hex(confirmationToken);
  const { data: burnedConfirmation } = await db
    .from('payout_withdrawal_otp_codes')
    .update({ confirmation_token_hash: null })
    .eq('property_id', propertyId)
    .eq('purpose', 'withdrawal')
    .eq('user_id', user.id)
    .eq('confirmation_token_hash', confirmationTokenHash)
    .gt('confirmation_expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (!burnedConfirmation) {
    return json({ error: 'That confirmation has expired or was already used. Request a new code.' }, 401);
  }

  // One transfer per loop. A failure on the first transfer is reported as an error; once at least one transfer has
  // been sent, a later problem ends the loop and the response says how much went out and how much did not.
  type Sent = { payoutId: string; gross: number; fee: number; net: number; unknown: boolean };
  const sent: Sent[] = [];
  let remaining = round2(amount);
  let stopReason: string | null = null;
  let firstError: Response | null = null;
  let walletLeft: number | null = wallet.available;
  const isMobileMoney = recipient.type === 'mobile-money';

  for (let i = 0; i < MAX_CHUNKS && remaining >= MIN_WITHDRAWAL; i++) {
    const isFirst = sent.length === 0;
    const target = nextTarget(remaining, cap);

    const { data: payoutRow, error: insertError } = await db
      .from('payouts')
      .insert({
        property_id: propertyId,
        payout_recipient_id: recipient.id,
        amount: 0,
        status: 'pending',
        narration: payload.narration ?? 'On-demand rent payout',
        requested_by: user.id,
      })
      .select()
      .single();
    if (insertError || !payoutRow) {
      if (isFirst) firstError = json({ error: 'Failed to record payout', detail: insertError?.message }, 500);
      else stopReason = 'Failed to record the next transfer';
      break;
    }

    const { data: claimedRaw, error: claimError } = await db.rpc('pay_portal_claim_payout_collections', {
      p_property_id: propertyId,
      p_payout_id: payoutRow.id,
      p_max_amount: target,
    });
    if (claimError) {
      await db.from('payouts').delete().eq('id', payoutRow.id);
      if (isFirst) firstError = json({ error: 'Failed to check available balance', detail: claimError.message }, 500);
      else stopReason = 'Failed to check the available balance';
      break;
    }

    const claimedAmount = round2(Number(claimedRaw ?? 0));
    if (claimedAmount <= 0) {
      await db.from('payouts').delete().eq('id', payoutRow.id);
      if (isFirst) firstError = json({ error: `There's nothing available to pay out right now.` }, 400);
      break; // later transfers: simply nothing more to send
    }

    const feeAmount = chunkFee(claimedAmount);
    const netAmount = round2(claimedAmount - feeAmount);
    if (netAmount <= 0) {
      await db.rpc('pay_portal_release_payout_collections', { p_payout_id: payoutRow.id });
      await db.from('payouts').delete().eq('id', payoutRow.id);
      if (isFirst) firstError = json({ error: 'That amount is too small to cover the transfer fee.' }, 400);
      break;
    }

    const narration = payload.narration ?? `Rent payout - ${recipient.account_name ?? recipient.phone_number} (fee K${feeAmount.toFixed(2)})`;
    await db.from('payouts').update({ amount: claimedAmount, fee_amount: feeAmount, net_amount: netAmount, narration }).eq('id', payoutRow.id);

    try {
      // Wallet check with the real claimed amount (the money may have moved since the early check).
      const needed = round2(netAmount + lencoTransferFee(netAmount));
      if (walletLeft !== null && walletLeft < needed) {
        await db.rpc('pay_portal_release_payout_collections', { p_payout_id: payoutRow.id });
        await db.from('payouts').delete().eq('id', payoutRow.id);
        if (isFirst) firstError = json({ error: WALLET_LOW_MESSAGE, code: 'wallet_low' }, 503);
        else stopReason = 'The wallet could not cover the next transfer yet';
        break;
      }

      const lencoResponse = await fetch(
        `https://api.lenco.co/access/v2/transfers/${isMobileMoney ? 'mobile-money' : 'bank-account'}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${lencoSecretKey}`, 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(
            isMobileMoney
              ? { accountId: wallet.accountId, amount: netAmount, reference: payoutRow.id, narration, phone: recipient.phone_number, operator: recipient.provider, country: 'zm' }
              : { accountId: wallet.accountId, amount: netAmount, reference: payoutRow.id, narration, transferRecipientId: recipient.lenco_recipient_id, country: 'zm' },
          ),
        },
      );
      const lencoJson = await lencoResponse.json();

      if (!lencoResponse.ok && lencoResponse.status >= 500) {
        // Unknown outcome: keep claimed money locked, leave processing for the status checker, and stop sending more.
        await db.from('payouts').update({ status: 'processing', failure_reason: 'Lenco response not confirmed, awaiting confirmation' }).eq('id', payoutRow.id);
        sent.push({ payoutId: payoutRow.id, gross: claimedAmount, fee: feeAmount, net: netAmount, unknown: true });
        stopReason = 'The last transfer is awaiting confirmation';
        break;
      }

      if (!lencoResponse.ok) {
        const reason = String(lencoJson.message ?? 'Lenco rejected the transfer');
        await db.from('payouts').update({ status: 'failed', failure_reason: reason }).eq('id', payoutRow.id);
        await db.rpc('pay_portal_release_payout_collections', { p_payout_id: payoutRow.id });
        if (!isFirst) {
          stopReason = reason;
          break;
        }
        // Lenco or the mobile money operator refused the size of the transfer: say so in plain words.
        if (/limit|exceed|maximum/i.test(reason)) {
          firstError = json({
            error: 'That amount is more than the bank or mobile money operator allows in one go. Nothing was taken. Try a smaller amount.',
            code: 'above_limit', lencoStatus: lencoResponse.status,
          }, 400);
        } else if (/insufficient|balance|fund/i.test(reason)) {
          await alertCompany('Payout rejected: not enough funds', 'Payout rejected', `Lenco said: ${reason}`, [{ label: 'Property', value: access.prop.name }, { label: 'Amount', value: `K${netAmount.toFixed(2)}` }]);
          firstError = json({ error: WALLET_LOW_MESSAGE, code: 'wallet_low' }, 503);
        } else {
          firstError = json({ error: reason, lencoStatus: lencoResponse.status, detail: lencoJson }, lencoResponse.status === 400 ? 400 : 502);
        }
        break;
      }

      const lencoTransactionId: string | undefined = lencoJson.data?.id;
      await db.from('payouts').update({ status: 'processing', lenco_transaction_id: lencoTransactionId ?? null }).eq('id', payoutRow.id);
      if (walletLeft !== null) walletLeft = round2(walletLeft - needed);
      sent.push({ payoutId: payoutRow.id, gross: claimedAmount, fee: feeAmount, net: netAmount, unknown: false });
      remaining = round2(remaining - claimedAmount);
    } catch (err) {
      // Timeout / network error: the transfer may have gone through. Never release the claim here.
      console.error('[lenco-payout] unknown outcome reaching Lenco', String(err));
      await db.from('payouts').update({ status: 'processing', failure_reason: 'Lenco response not received, awaiting confirmation' }).eq('id', payoutRow.id);
      sent.push({ payoutId: payoutRow.id, gross: claimedAmount, fee: feeAmount, net: netAmount, unknown: true });
      stopReason = 'The last transfer is awaiting confirmation';
      break;
    }
  }

  if (sent.length === 0) {
    return firstError ?? json({ error: `There's nothing available to pay out right now.` }, 400);
  }

  const totalGross = round2(sent.reduce((s, x) => s + x.gross, 0));
  const totalFee = round2(sent.reduce((s, x) => s + x.fee, 0));
  const totalNet = round2(sent.reduce((s, x) => s + x.net, 0));
  const anyUnknown = sent.some((x) => x.unknown);
  const notSent = round2(Math.max(amount - totalGross, 0));

  // Records who did it and tells the owner. Never allowed to break the payout response.
  try {
    const dest = isMobileMoney
      ? `${String(recipient.provider).toUpperCase()} mobile money ending ${last4(recipient.phone_number)}`
      : `${recipient.account_name ?? 'Bank account'} ending ${last4(recipient.account_number)}`;
    const { data: st } = await db.from('settings').select('landlord_name,payout_sms_enabled,notification_phone').eq('property_id', propertyId).maybeSingle();
    const who = personName(user, access.isOwner ? st?.landlord_name ?? undefined : undefined);
    const parts = sent.length > 1 ? ` in ${sent.length} transfers` : '';
    await writeAudit(db, {
      property_id: propertyId, actor_id: user.id, actor_label: who, action: 'payout.request',
      summary: `Requested a payout of K${totalGross.toFixed(2)} to ${dest}${parts}`, target_type: 'payout', target_id: sent[0].payoutId,
      metadata: { amount: totalGross, fee: totalFee, net: totalNet, recipient_id: recipient.id, payout_ids: sent.map((x) => x.payoutId) },
    });
    await notifyPayoutEvent(db, access, user.id, {
      subject: `${who} requested a payout of K${totalGross.toFixed(2)}`,
      heading: 'Payout requested',
      text: `${who} requested a payout from ${access.prop.name}. The transfer to ${dest} has started${parts}.`,
      details: [
        { label: 'Property', value: access.prop.name },
        { label: 'Requested by', value: who },
        { label: 'Amount', value: `K${totalGross.toFixed(2)}` },
        { label: 'Fee', value: `K${totalFee.toFixed(2)}` },
        { label: 'Sent', value: `K${totalNet.toFixed(2)} to ${dest}` },
      ],
      warning: access.isOwner ? undefined : 'Not expected? Remove their access in Settings > Team.',
    });
    // Optional text to the owner when a team member (not the owner) requested the payout.
    const ownerPhone = String(st?.notification_phone ?? '').trim();
    if (!access.isOwner && st?.payout_sms_enabled && ownerPhone) {
      const sms = `${who} requested a payout of K${totalGross.toFixed(2)} from ${access.prop.name}. Not expected? Remove their access in Settings > Team.`.slice(0, 160);
      const r = await sendSms(ownerPhone, sms);
      await db.from('sms_send_log').insert({ property_id: propertyId, recipient_phone: ownerPhone, category: 'payout_requested', status: r.ok ? 'sent' : 'failed', message: sms, recipient_role: 'owner' });
    }
  } catch (err) {
    console.error('[lenco-payout] announce failed', String(err));
  }

  const body = {
    ok: true,
    payoutId: sent[0].payoutId,
    payoutIds: sent.map((x) => x.payoutId),
    transfers: sent.length,
    amount: totalGross,
    feeAmount: totalFee,
    netAmount: totalNet,
    notSent,
    partial: notSent >= 1 && !!stopReason,
    note: stopReason,
  };
  // 202 keeps the old meaning: at least one transfer is still awaiting confirmation.
  return json(anyUnknown ? { ...body, status: 'unknown' } : body, anyUnknown ? 202 : 200);
});
