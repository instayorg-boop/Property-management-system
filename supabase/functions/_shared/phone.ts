/** Tenant phones are stored in local Zambian format ("0977 502 913") — both Africa's Talking (SMS)
 * and Lenco (mobile money collections) expect E.164 ("+260977502913"). Shared between
 * pay-portal-request-otp and pay-portal-collect-payment. */
export function toE164Zambia(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("260")) return `+${digits}`;
  if (digits.startsWith("0")) return `+260${digits.slice(1)}`;
  return `+260${digits}`;
}
