// Shared SMS sender — Africa's Talking, the same provider/HTTP shape already used by
// pay-portal-request-otp and request-withdrawal-otp for OTP delivery. This is the generic version
// for everything that isn't an OTP (tenant onboarding, rent reminders, escalation, landlord
// digests): no OTP-specific code generation/hashing here, just "send this phone this message".
//
// Deliberately NOT wired into pay-portal-request-otp itself — that function has its own temporary,
// explicitly-flagged fallback behavior for a zero-balance sandbox account (see the comment above
// its Africa's Talking call) that shouldn't be silently inherited by every other caller of this
// helper. New call sites (onboarding, reminders, digests) use this and get the real dev-mode /
// failure behavior below, matching the convention _shared/email.ts already uses.
//
// Deploy note: no separate deploy step — this is bundled into whichever function imports it.

import { toE164Zambia } from "./phone.ts";

export type SendSmsResult =
  | { ok: true; dev?: boolean }
  | { ok: false; reason: "provider_rejected" | "network_error"; detail: string };

export async function sendSms(phone: string, message: string): Promise<SendSmsResult> {
  const atApiKey = Deno.env.get("AT_API_KEY");
  const atUsername = Deno.env.get("AT_USERNAME") || "sandbox";

  // Explicit override, checked before the API-key check below — lets a project with AT_API_KEY
  // already configured (e.g. for real use later) still be tested end-to-end without any SMS
  // actually going out: set the SMS_DEV_MODE secret to "true" and every send logs + writes to
  // sms_send_log exactly as it would for real, just without the Africa's Talking call. Unset (or
  // "false") to go live — the AT_API_KEY-missing fallback below still covers the "no key at all"
  // case on its own.
  if (Deno.env.get("SMS_DEV_MODE") === "true") {
    console.log(`[sms:dev] to=${phone} message=${JSON.stringify(message)}`);
    return { ok: true, dev: true };
  }

  if (!atApiKey) {
    console.log(`[sms:dev] to=${phone} message=${JSON.stringify(message)}`);
    return { ok: true, dev: true };
  }

  const endpoint = atUsername === "sandbox" ? "https://api.sandbox.africastalking.com/version1/messaging" : "https://api.africastalking.com/version1/messaging";

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apiKey: atApiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        username: atUsername,
        to: toE164Zambia(phone),
        message,
      }),
    });
  } catch (err) {
    return { ok: false, reason: "network_error", detail: String(err) };
  }

  const responseText = await response.text();
  let recipientStatus: string | undefined;
  try {
    recipientStatus = JSON.parse(responseText)?.SMSMessageData?.Recipients?.[0]?.status;
  } catch {
    // non-JSON body — leave recipientStatus undefined, handled below
  }

  // Africa's Talking can return HTTP 200/201 even when the actual send failed — the real outcome
  // is in SMSMessageData.Recipients[0].status ("Success" vs a rejection reason like
  // "InvalidPhoneNumber", "UserInBlacklist", "InsufficientBalance", etc).
  if (!response.ok || (recipientStatus && recipientStatus !== "Success")) {
    return { ok: false, reason: "provider_rejected", detail: responseText };
  }

  return { ok: true };
}
