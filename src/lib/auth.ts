import { supabase } from "./supabaseClient";
import { logAuditEvent } from "./auditLog";
import { edgeFunctionErrorMessage } from "./functionsError";
import type { Session, User } from "@supabase/supabase-js";

export type { Session, User };

/** Sends a 6-digit SMS code to `phone` during sign-up, before any account exists — see
 * request-signup-otp. Phone verification happens up front at sign-up (rather than leaving it to
 * Settings > SMS, which nobody finds unprompted) precisely so the alert number landlords end up
 * with is already proven to be theirs. */
export async function requestSignupOtp(phone: string): Promise<{ maskedPhone: string; devCode?: string }> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; maskedPhone?: string; devCode?: string; error?: string }>(
    "request-signup-otp",
    { body: { phone } }
  );
  if (error || !data?.ok || !data?.maskedPhone) {
    throw new Error(await edgeFunctionErrorMessage(error, "Failed to send a code. Try again."));
  }
  return { maskedPhone: data.maskedPhone, devCode: data.devCode };
}

export async function verifySignupOtp(phone: string, code: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    "verify-signup-otp",
    { body: { phone, code } }
  );
  if (error || !data?.ok) {
    throw new Error(await edgeFunctionErrorMessage(error, "Incorrect code."));
  }
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  propertyName: string,
  propertyAddress = "",
  coords?: { lat: number; lng: number } | null,
  phone = "",
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        property_name: propertyName,
        property_address: propertyAddress,
        property_lat: coords?.lat ?? null,
        property_lng: coords?.lng ?? null,
        phone,
      },
    },
  });
  if (error) throw error;
  return data;
}

// Task #12: the audit log is per-property, but at the point of sign-in/sign-out there's no
// property context loaded yet (SettingsContext/TenantsContext haven't mounted). Resolve the
// signed-in user's own property/properties directly here instead of threading propertyId through
// the whole auth flow for this one purpose. Best-effort and fire-and-forget throughout, same as
// every other logAuditEvent call site, a failure to log an auth event must never block sign-in or
// sign-out.
async function logAuthEventForOwnProperties(action: "auth.signed_in" | "auth.signed_out" | "auth.password_changed", userId: string) {
  try {
    const { data: properties } = await supabase.from("properties").select("id").eq("owner_id", userId);
    for (const property of properties ?? []) {
      void logAuditEvent({
        propertyId: property.id,
        action,
        summary:
          action === "auth.signed_in" ? "Signed in" : action === "auth.signed_out" ? "Signed out" : "Password changed",
      });
    }
  } catch (err) {
    console.error("[auth] failed to log audit event", action, String(err));
  }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) void logAuthEventForOwnProperties("auth.signed_in", data.user.id);
  return data;
}

export async function signOut() {
  // Resolve who's signing out, and log it, before the session actually ends: once signOut()
  // succeeds, auth.uid() goes null and the audit_log insert policy (actor_id = auth.uid()) would
  // reject the write.
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userId) await logAuthEventForOwnProperties("auth.signed_out", userId);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) void logAuthEventForOwnProperties("auth.password_changed", userData.user.id);
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
