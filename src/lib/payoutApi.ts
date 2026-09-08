import { supabase } from "./supabaseClient";
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
    throw new Error(data?.error ?? error?.message ?? "Couldn't resolve that account — check the account number and bank.");
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
    throw new Error(data?.error ?? error?.message ?? "Failed to save payout details.");
  }
  return data.recipient;
}

/** Sends a real transfer to the property's registered payout recipient. The exact Lenco transfer
 * endpoint isn't confirmed yet (see supabase/functions/lenco-payout's file comment) — this can fail
 * with a real error until that's verified, which is why callers must show `err.message`, not assume success. */
export async function sendPayout(propertyId: string, amount: number, narration?: string): Promise<{ payoutId: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; payoutId?: string; error?: string }>("lenco-payout", {
    body: { propertyId, amount, narration },
  });
  if (error || !data?.ok || !data?.payoutId) {
    throw new Error(data?.error ?? error?.message ?? "Failed to send payout.");
  }
  return { payoutId: data.payoutId };
}
