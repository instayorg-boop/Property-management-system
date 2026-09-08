// Shared hashing helpers for the pay-portal OTP flow — codes and session tokens are stored as
// SHA-256 hashes (via digest()), never plaintext, so a database read alone can't authenticate as
// a tenant. Kept here so pay-portal-request-otp and pay-portal-verify-otp compute identically.

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A random 6-digit code, zero-padded (e.g. "042917") — crypto.getRandomValues, not Math.random(). */
export function randomOtpCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

/** A random 32-byte session token, hex-encoded (64 chars) — crypto.getRandomValues, not Math.random(). */
export function randomSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "0977123456" -> "•••• 3456" — never reveal more than the last 4 digits back to the client. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}
