import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";
import type { Tables } from "./database.types";

export type Bank = Tables<"banks">;
export type PayoutRecipient = Tables<"payout_recipients">;

/** Local cache of Lenco's bank list — never a live call, see supabase/functions/sync-lenco-banks. */
export async function listBanks(): Promise<Bank[]> {
  const { data, error } = await supabase.from("banks").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getPayoutRecipient(propertyId: string): Promise<PayoutRecipient | null> {
  const { data, error } = await supabase
    .from("payout_recipients")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Every payout method saved for this property — bank accounts and mobile money numbers alike, the
 * default one first. Used by the Settings "Bank & payouts" list and the withdraw flow's recipient
 * picker. */
export async function listPayoutRecipients(propertyId: string): Promise<PayoutRecipient[]> {
  const { data, error } = await supabase
    .from("payout_recipients")
    .select("*")
    .eq("property_id", propertyId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Switches which recipient a withdrawal defaults to — two plain updates rather than a stored
 * procedure; a rare double-click racing this isn't worth the extra moving part for what's a
 * low-frequency settings action. */
export async function setDefaultPayoutRecipient(propertyId: string, recipientId: string): Promise<void> {
  const { error: clearError } = await supabase.from("payout_recipients").update({ is_default: false }).eq("property_id", propertyId);
  if (clearError) throw clearError;
  const { error: setError } = await supabase.from("payout_recipients").update({ is_default: true }).eq("id", recipientId);
  if (setError) throw setError;
}

export async function deletePayoutRecipient(id: string): Promise<void> {
  const { error } = await supabase.from("payout_recipients").delete().eq("id", id);
  if (error) throw error;
}

/** Step 1 of adding a mobile-money payout recipient — texts a code to the number being added. See
 * request-payout-recipient-otp's file comment for why this (not a bank-style name resolution) is
 * how a mobile-money recipient gets verified. */
export async function requestPayoutRecipientOtp(propertyId: string, phoneNumber: string): Promise<{ maskedPhone: string; devCode?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; maskedPhone?: string; devCode?: string; error?: string }>(
    "request-payout-recipient-otp",
    { body: { propertyId, phoneNumber } }
  );
  if (error || !data?.ok || !data?.maskedPhone) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to send a code to that number."));
  }
  return { maskedPhone: data.maskedPhone, devCode: data.devCode };
}

/** Step 2 — verifying the code saves the number as a new payout_recipients row (type: mobile-money)
 * and triggers the security-alert email to the account's registered address. */
export async function verifyPayoutRecipientOtp(
  propertyId: string,
  phoneNumber: string,
  code: string,
  provider: "mtn" | "airtel" | "zamtel"
): Promise<PayoutRecipient> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; recipient?: PayoutRecipient; error?: string }>(
    "verify-payout-recipient-otp",
    { body: { propertyId, phoneNumber, code, provider } }
  );
  if (error || !data?.recipient) {
    throw new Error(await edgeFunctionErrorMessage(error, "Incorrect or expired code."));
  }
  return data.recipient;
}

/** Step 1 of authorizing a withdrawal — emails a code to the property's registered account address.
 * See request-withdrawal-otp's file comment for why this exists as a real second factor, not just a
 * UI speed bump. */
export async function requestWithdrawalOtp(propertyId: string): Promise<{ maskedEmail: string; devCode?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; maskedEmail?: string; devCode?: string; error?: string }>(
    "request-withdrawal-otp",
    { body: { propertyId } }
  );
  if (error || !data?.ok || !data?.maskedEmail) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to send a confirmation code."));
  }
  return { maskedEmail: data.maskedEmail, devCode: data.devCode };
}

/** Step 2 — a correct code returns a short-lived confirmationToken that sendPayout must be called
 * with; lenco-payout re-validates it server-side (see its file comment), so this isn't optional. */
export async function verifyWithdrawalOtp(propertyId: string, code: string): Promise<{ confirmationToken: string; expiresAt: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; confirmationToken?: string; expiresAt?: string; error?: string }>(
    "verify-withdrawal-otp",
    { body: { propertyId, code } }
  );
  if (error || !data?.ok || !data?.confirmationToken || !data?.expiresAt) {
    throw new Error(await edgeFunctionErrorMessage(error, "Incorrect or expired code."));
  }
  return { confirmationToken: data.confirmationToken, expiresAt: data.expiresAt };
}

/** Throws with a user-facing message on failure — the Settings page shows it inline, not console-only,
 * since this sits on the critical path of "will my rent actually reach my bank account". */
export async function resolveBankAccount(accountNumber: string, bankCode: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ accountName?: string; error?: string }>(
    "resolve-bank-account",
    { body: { accountNumber, bankCode } }
  );
  if (error || !data?.accountName) {
    throw new Error(await edgeFunctionErrorMessage(error, "Couldn't resolve that account — check the account number and bank."));
  }
  return data.accountName;
}

export async function createPayoutRecipient(params: {
  accountNumber: string;
  bankCode: string;
  accountName: string;
  propertyId: string;
}): Promise<PayoutRecipient> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; recipient?: PayoutRecipient; error?: string }>(
    "create-payout-recipient",
    { body: params }
  );
  if (error || !data?.recipient) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to save payout details."));
  }
  return data.recipient;
}

/** What's actually available to withdraw via Lenco — real money that flowed through Lenco
 * (successful mobile-money collections), minus what's already been paid out or is mid-transfer.
 * Deliberately NOT the same figure as the Owner Payout Statement's accounting view: no management
 * fee, no expenses subtracted, and manually-logged/cash payments never count here at all — that
 * money never touched Lenco, so there's nothing sitting there to withdraw for it. */
export async function getLencoBalance(propertyId: string): Promise<{ collected: number; paidOut: number; available: number }> {
  const [{ data: collectedRows, error: collectedError }, { data: paidRows, error: paidError }] = await Promise.all([
    supabase.from("collections").select("amount").eq("property_id", propertyId).eq("status", "successful"),
    supabase.from("payouts").select("amount").eq("property_id", propertyId).in("status", ["successful", "processing"]),
  ]);
  if (collectedError) throw collectedError;
  if (paidError) throw paidError;
  const collected = (collectedRows ?? []).reduce((sum, r) => sum + r.amount, 0);
  const paidOut = (paidRows ?? []).reduce((sum, r) => sum + r.amount, 0);
  return { collected, paidOut, available: collected - paidOut };
}

/** Sends a real transfer to one of the property's registered payout recipients (the default one if
 * `recipientId` is omitted) — but only ever a `type: "bank"` recipient; lenco-payout itself rejects
 * anything else, since mobile-money disbursement isn't connected yet (see its file comment).
 * `confirmationToken` is required — get one from verifyWithdrawalOtp first, it's the real
 * authorization for this call, not just a param that happens to be checked. */
export async function sendPayout(
  propertyId: string,
  amount: number,
  confirmationToken: string,
  recipientId?: string,
  narration?: string
): Promise<{ payoutId: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; payoutId?: string; error?: string }>("lenco-payout", {
    body: { propertyId, amount, confirmationToken, recipientId, narration },
  });
  if (error || !data?.ok || !data?.payoutId) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to send payout."));
  }
  return { payoutId: data.payoutId };
}

export type PayoutStatus = "pending" | "processing" | "successful" | "failed";

export type PayoutRecord = {
  id: string;
  amount: number;
  status: PayoutStatus;
  createdAt: string;
  failureReason: string | null;
};

/** Payout history for one property, newest first — used by PayoutDetailDrawer's "Recent payouts"
 * list and the full /accounting/payouts ledger. `status`/`from`/`to` narrow the query for the full
 * ledger's filters; omit them for the drawer's plain "last N" view. RLS already scopes this to the
 * caller's own properties, same as every other payouts-table read. */
export async function listPayouts(
  propertyId: string,
  opts?: { limit?: number; status?: PayoutStatus[]; from?: string; to?: string }
): Promise<PayoutRecord[]> {
  let query = supabase
    .from("payouts")
    .select("id, amount, status, created_at, failure_reason")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  if (opts?.status?.length) query = query.in("status", opts.status);
  if (opts?.from) query = query.gte("created_at", opts.from);
  if (opts?.to) query = query.lte("created_at", opts.to);
  if (opts?.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    amount: row.amount,
    status: row.status as PayoutStatus,
    createdAt: row.created_at,
    failureReason: row.failure_reason,
  }));
}

/** Only lenco-webhook normally moves a payout past "processing" — if that webhook was never
 * registered with Lenco (or a delivery got lost), a transfer sits at "processing" forever with no
 * way to tell it succeeded or failed, even though Lenco itself already knows. This actively
 * requeries Lenco's own transfer-status endpoint and applies the result, same as the webhook
 * would have — see supabase/functions/check-payout-status. */
export async function checkPayoutStatus(payoutId: string): Promise<{ status: PayoutStatus; failureReason: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; status?: PayoutStatus; failureReason?: string | null; error?: string }>(
    "check-payout-status",
    { body: { payoutId } }
  );
  if (error || !data?.ok || !data?.status) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to check the transfer's status."));
  }
  return { status: data.status, failureReason: data.failureReason ?? null };
}
