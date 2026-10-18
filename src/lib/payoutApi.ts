import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";
import type { Tables } from "./database.types";
import { logAuditEvent } from "./auditLog";

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

/** Switches which recipient a withdrawal defaults to — routed through manage-payout-recipient so
 * the server (not direct table writes) enforces who's allowed to change payout methods, now that
 * a team member can hold payout_methods.manage without being the owner. */
export async function setDefaultPayoutRecipient(propertyId: string, recipientId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("manage-payout-recipient", {
    body: { action: "set_default", propertyId, recipientId },
  });
  if (error || !data?.ok) {
    throw new Error(await edgeFunctionErrorMessage(error, "Couldn't update the default method, please try again."));
  }
  void logAuditEvent({
    propertyId,
    action: "payout_recipient.added",
    summary: "Default payout method changed",
    targetType: "payout_recipient",
    targetId: recipientId,
  });
}

/** A 409 from the server means this method has past payouts and can't be removed — the server's
 * own `error` text explains that, so it's surfaced as-is rather than replaced with a generic
 * message here. */
export async function deletePayoutRecipient(id: string, propertyId?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("manage-payout-recipient", {
    body: { action: "remove", propertyId, recipientId: id },
  });
  if (error || !data?.ok) {
    throw new Error(await edgeFunctionErrorMessage(error, "Couldn't remove that method, please try again."));
  }
  if (propertyId) {
    void logAuditEvent({
      propertyId,
      action: "payout_recipient.added",
      summary: "Payout method removed",
      targetType: "payout_recipient",
      targetId: id,
    });
  }
}

/** Step 1 of adding a mobile-money payout recipient — resolves the account holder's name via Lenco,
 * the same "confirm this is you" pattern resolveBankAccount already uses for bank accounts, now that
 * this endpoint is confirmed (see resolve-mobile-money's file comment). */
export async function resolveMobileMoneyAccount(phone: string, operator: "mtn" | "airtel" | "zamtel"): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ accountName?: string; error?: string }>(
    "resolve-mobile-money",
    { body: { phone, operator } }
  );
  if (error || !data?.accountName) {
    throw new Error(await edgeFunctionErrorMessage(error, "Couldn't resolve that number — check the number and provider."));
  }
  return data.accountName;
}

/** Step 2 — saves the number as a new payout_recipients row (type: mobile-money) once the landlord
 * has confirmed the resolved name, and triggers the security-alert email to the account's
 * registered address. */
export async function createMobileMoneyRecipient(params: {
  propertyId: string;
  phoneNumber: string;
  provider: "mtn" | "airtel" | "zamtel";
  accountName: string;
  confirmationToken?: string;
}): Promise<PayoutRecipient> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; recipient?: PayoutRecipient; error?: string }>(
    "create-mobile-money-recipient",
    { body: params }
  );
  if (error || !data?.recipient) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to save that payout method."));
  }
  void logAuditEvent({
    propertyId: params.propertyId,
    action: "payout_recipient.added",
    summary: `Mobile money payout method added (${params.provider})`,
    targetType: "payout_recipient",
    targetId: data.recipient.id,
  });
  return data.recipient;
}

export type PayoutOtpPurpose = "withdrawal" | "add_recipient";

/** Step 1 of a payout-related confirmation — emails a code to the property's registered account
 * address. Shared between two purposes: authorizing an actual withdrawal, and adding a new payout
 * recipient (bank or mobile money) — `purpose` scopes the code (and the confirmationToken it
 * produces) to only that action. See request-withdrawal-otp's file comment for why this exists as a
 * real second factor, not just a UI speed bump. */
export async function requestWithdrawalOtp(
  propertyId: string,
  purpose: PayoutOtpPurpose = "withdrawal"
): Promise<{ maskedEmail: string; devCode?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; maskedEmail?: string; devCode?: string; error?: string }>(
    "request-withdrawal-otp",
    { body: { propertyId, purpose } }
  );
  if (error || !data?.ok || !data?.maskedEmail) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to send a confirmation code."));
  }
  return { maskedEmail: data.maskedEmail, devCode: data.devCode };
}

/** Step 2 — a correct code returns a short-lived confirmationToken that sendPayout / createPayoutRecipient
 * / createMobileMoneyRecipient must be called with; each re-validates it (and its purpose) server-side
 * (see their file comments), so this isn't optional. */
export async function verifyWithdrawalOtp(
  propertyId: string,
  code: string,
  purpose: PayoutOtpPurpose = "withdrawal"
): Promise<{ confirmationToken: string; expiresAt: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; confirmationToken?: string; expiresAt?: string; error?: string }>(
    "verify-withdrawal-otp",
    { body: { propertyId, code, purpose } }
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
  confirmationToken?: string;
}): Promise<PayoutRecipient> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; recipient?: PayoutRecipient; error?: string }>(
    "create-payout-recipient",
    { body: params }
  );
  if (error || !data?.recipient) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to save payout details."));
  }
  void logAuditEvent({
    propertyId: params.propertyId,
    action: "payout_recipient.added",
    summary: "Bank payout method added",
    targetType: "payout_recipient",
    targetId: data.recipient.id,
  });
  return data.recipient;
}

/** What's actually available to withdraw via Lenco — the same set of collections
 * pay_portal_claim_payout_collections would claim for a real payout: successful, not yet linked to a
 * payout (payout_id is null), net of Lenco's own collection fee. `collected`/`paidOut` stay as the
 * all-time totals (still useful context, e.g. for a "lifetime collected" stat), but `available` is
 * deliberately NOT `collected - paidOut` — a property can have older payouts that predate the
 * payout_id linkage (or were claimed against collections that have since been reconciled elsewhere),
 * which made that subtraction go negative and floor at a wrong 0. */
export async function getLencoBalance(propertyId: string): Promise<{ collected: number; paidOut: number; available: number }> {
  const [{ data: collectedRows, error: collectedError }, { data: paidRows, error: paidError }, { data: unclaimedRows, error: unclaimedError }] =
    await Promise.all([
      supabase.from("collections").select("amount, fee_amount").eq("property_id", propertyId).eq("status", "successful").or("lenco_collection_id.is.null,lenco_collection_id.not.like.DEV-%"),
      supabase.from("payouts").select("amount").eq("property_id", propertyId).in("status", ["successful", "processing"]),
      supabase
        .from("collections")
        .select("amount, fee_amount")
        .eq("property_id", propertyId)
        .eq("status", "successful")
        .or("lenco_collection_id.is.null,lenco_collection_id.not.like.DEV-%")
        .is("payout_id", null),
    ]);
  if (collectedError) throw collectedError;
  if (paidError) throw paidError;
  if (unclaimedError) throw unclaimedError;
  // Rent only. collections.amount is what the tenant's phone was debited, rent plus the service
  // fee charged on top; the fee was never the landlord's money, so a "collected" total that
  // included it overstated what came in.
  const collected = (collectedRows ?? []).reduce((sum, r) => sum + (r.amount - (r.fee_amount ?? 0)), 0);
  const paidOut = (paidRows ?? []).reduce((sum, r) => sum + r.amount, 0);
  const available = (unclaimedRows ?? []).reduce((sum, r) => sum + (r.amount - (r.fee_amount ?? 0)), 0);
  return { collected, paidOut, available };
}

/** Sends a real transfer to one of the property's registered payout recipients (the default one if
 * `recipientId` is omitted) — but only ever a `type: "bank"` recipient; lenco-payout itself rejects
 * anything else, since mobile-money disbursement isn't connected yet (see its file comment).
 * `confirmationToken` is required — get one from verifyWithdrawalOtp first, it's the real
 * authorization for this call, not just a param that happens to be checked. */
export type SendPayoutResult = {
  payoutId: string;
  /** What was actually transferred — a cap, not a guarantee: can be less than requested if the
   * real available balance was lower. Always show this, never an echo of what the landlord typed. */
  amount: number;
  /** Includes a flat K5 on-demand markup on top of the real Lenco transfer fee — scheduled/cron
   * payouts never carry this. */
  feeAmount: number;
  netAmount: number;
  /** How many separate transfers it went out as (more than one when the amount is above what a
   * single transfer to this destination allows). The fee covers all of them. */
  transfers: number;
  /** Requested but not sent, e.g. a later transfer could not go out. Zero on a normal payout. */
  notSent: number;
};

export async function sendPayout(
  propertyId: string,
  amount: number,
  confirmationToken: string,
  recipientId?: string,
  narration?: string
): Promise<SendPayoutResult> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    payoutId?: string;
    amount?: number;
    feeAmount?: number;
    netAmount?: number;
    transfers?: number;
    notSent?: number;
    error?: string;
  }>("lenco-payout", { body: { propertyId, amount, confirmationToken, recipientId, narration } });
  if (error || !data?.ok || !data?.payoutId) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to send payout."));
  }
  const result = {
    payoutId: data.payoutId,
    amount: data.amount ?? amount,
    feeAmount: data.feeAmount ?? 0,
    netAmount: data.netAmount ?? (data.amount ?? amount),
    transfers: data.transfers ?? 1,
    notSent: data.notSent ?? 0,
  };
  void logAuditEvent({
    propertyId,
    action: "payout.requested",
    summary: `Payout requested (K${result.amount}, net K${result.netAmount})`,
    targetType: "payout",
    targetId: result.payoutId,
    metadata: { amount: result.amount, feeAmount: result.feeAmount, netAmount: result.netAmount },
  });
  return result;
}

export type PayoutStatus = "pending" | "processing" | "successful" | "failed";

export type PayoutRecord = {
  id: string;
  amount: number;
  /** Fee deducted (Lenco's own transfer fee, plus a flat K5 markup for an on-demand payout — a
   * scheduled/cron one carries only the former) and what the landlord actually received —
   * null on older rows recorded before this split existed. */
  feeAmount: number | null;
  netAmount: number | null;
  /** Human-readable fee breakdown, e.g. "Rent payout — fee K12.00 (incl. K5 on-demand), net K988.00". */
  narration: string | null;
  status: PayoutStatus;
  createdAt: string;
  failureReason: string | null;
  /** The recipient this payout was sent to, for the "Method" column — null for older rows created
   * before a recipient could be deleted independently, or if the join comes back empty. */
  recipient: Pick<PayoutRecipient, "type" | "provider" | "account_name" | "account_number" | "phone_number"> | null;
  /** auth.users id of whoever requested this payout — null on older rows recorded before this
   * column existed. Resolve to a name via property_people, and render nothing (not "Unknown")
   * when it's null. */
  requestedBy: string | null;
};

/** Payout history for one property, newest first — used by PayoutDetailDrawer's "Recent payouts"
 * list and the full /online-payments ledger. `status`/`from`/`to` narrow the query for the full
 * ledger's filters; omit them for the drawer's plain "last N" view. RLS already scopes this to the
 * caller's own properties, same as every other payouts-table read. */
export async function listPayouts(
  propertyId: string,
  opts?: { limit?: number; status?: PayoutStatus[]; from?: string; to?: string }
): Promise<PayoutRecord[]> {
  let query = supabase
    .from("payouts")
    .select(
      "id, amount, fee_amount, net_amount, narration, status, created_at, failure_reason, requested_by, payout_recipients(type, provider, account_name, account_number, phone_number)"
    )
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
    feeAmount: row.fee_amount ?? null,
    netAmount: row.net_amount ?? null,
    narration: row.narration ?? null,
    status: row.status as PayoutStatus,
    createdAt: row.created_at,
    failureReason: row.failure_reason,
    recipient: Array.isArray(row.payout_recipients) ? (row.payout_recipients[0] ?? null) : row.payout_recipients,
    requestedBy: row.requested_by ?? null,
  }));
}

export type CollectionStatus = "pending" | "pay-offline" | "successful" | "failed";

export type CollectionRecord = {
  id: string;
  /** Rent received, without the processing fee the tenant paid on top. */
  amount: number;
  /** What the tenant was charged in total (rent + processing fee). */
  totalCharged: number;
  feeAmount: number;
  /** A simulated payment from the portal's dev mode: no real money moved. */
  isTest: boolean;
  status: CollectionStatus;
  createdAt: string;
  operator: "mtn" | "airtel" | "zamtel";
  phone: string;
  failureReason: string | null;
  tenantName: string | null;
};

/** Tenant rent payments collected via the payment portal's mobile-money flow (public.collections),
 * newest first — the "Payments received" side of Online payments, alongside listPayouts' outgoing
 * transfers. Same status/from/to filter shape as listPayouts so the two tables' filter UI can share
 * code. RLS scopes this to the caller's own properties (see the collections_select policy). */
export async function listCollections(
  propertyId: string,
  opts?: { limit?: number; status?: CollectionStatus[]; from?: string; to?: string }
): Promise<CollectionRecord[]> {
  let query = supabase
    .from("collections")
    .select("id, amount, fee_amount, lenco_collection_id, status, created_at, operator, phone, failure_reason, tenants(name)")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });
  if (opts?.status?.length) query = query.in("status", opts.status);
  if (opts?.from) query = query.gte("created_at", opts.from);
  if (opts?.to) query = query.lte("created_at", opts.to);
  if (opts?.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return {
      id: row.id,
      amount: Math.round((row.amount - (row.fee_amount ?? 0)) * 100) / 100,
      totalCharged: row.amount,
      feeAmount: row.fee_amount ?? 0,
      isTest: (row.lenco_collection_id ?? "").startsWith("DEV-"),
      status: row.status as CollectionStatus,
      createdAt: row.created_at,
      operator: row.operator as "mtn" | "airtel" | "zamtel",
      phone: row.phone,
      failureReason: row.failure_reason,
      tenantName: tenant?.name ?? null,
    };
  });
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
