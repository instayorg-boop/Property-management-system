import { supabase } from "./supabaseClient";
import { edgeFunctionErrorMessage } from "./functionsError";

// The landlord's own IPM subscription fee, paid from the direct link the reminder SMS carries,
// no dashboard sign-in needed, the same way a tenant pays rent from their own SMS link (see
// payPortal.ts). Deliberately its own small file rather than folded into payPortal.ts: that file
// is tenant-specific (session tokens, ledgers, late fees) and this is a different payer, payee
// and invoice entirely, same reasoning subscriptionCollect.ts gives for staying separate
// server-side.

export type SubscriptionPayStatus = {
  propertyName: string;
  allPaid: boolean;
  amount: number;
  dueDate: string;
  invoiceStatus: string;
  paymentId: string | null;
  paymentStatus: string | null;
};

export async function getSubscriptionStatus(token: string): Promise<SubscriptionPayStatus> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    propertyName?: string;
    allPaid?: boolean;
    amount?: number;
    dueDate?: string;
    invoiceStatus?: string;
    paymentId?: string | null;
    paymentStatus?: string | null;
    error?: string;
  }>("pay-subscription-get-status", { body: { token } });

  if (error || !data?.ok || !data?.propertyName) {
    throw new Error(await edgeFunctionErrorMessage(error, "This link isn't valid anymore."));
  }

  return {
    propertyName: data.propertyName,
    allPaid: data.allPaid ?? false,
    amount: data.amount ?? 0,
    dueDate: data.dueDate ?? "",
    invoiceStatus: data.invoiceStatus ?? "pending",
    paymentId: data.paymentId ?? null,
    paymentStatus: data.paymentStatus ?? null,
  };
}

export async function collectSubscriptionPaymentPublic(
  token: string,
  phone: string,
  operator: "mtn" | "airtel" | "zamtel"
): Promise<{ paymentId: string; status: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; paymentId?: string; status?: string; error?: string }>(
    "pay-subscription-collect",
    { body: { token, phone, operator } }
  );
  if (error || !data?.ok || !data?.paymentId) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to start the payment."));
  }
  return { paymentId: data.paymentId, status: data.status ?? "pending" };
}
