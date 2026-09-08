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

/** Sends a real transfer to the property's registered payout recipient. The exact Lenco transfer
 * endpoint isn't confirmed yet (see supabase/functions/lenco-payout's file comment) — this can fail
 * with a real error until that's verified, which is why callers must show `err.message`, not assume success. */
export async function sendPayout(propertyId: string, amount: number, narration?: string): Promise<{ payoutId: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; payoutId?: string; error?: string }>("lenco-payout", {
    body: { propertyId, amount, narration },
  });
  if (error || !data?.ok || !data?.payoutId) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to send payout."));
  }
  return { payoutId: data.payoutId };
}
