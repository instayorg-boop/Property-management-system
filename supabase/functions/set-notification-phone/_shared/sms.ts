import { toE164Zambia } from './phone.ts';

export type SendSmsResult =
  | { ok: true; dev?: boolean }
  | { ok: false; reason: 'provider_rejected' | 'network_error'; detail: string };

export async function sendSms(phone: string, message: string): Promise<SendSmsResult> {
  const atApiKey = Deno.env.get('AT_API_KEY');
  const atUsername = Deno.env.get('AT_USERNAME') || 'sandbox';
  const atSenderId = Deno.env.get('AT_SENDER_ID');

  if (Deno.env.get('SMS_DEV_MODE') === 'true') {
    console.log(`[sms:dev] to=${phone} message=${JSON.stringify(message)}`);
    return { ok: true, dev: true };
  }

  if (!atApiKey) {
    console.log(`[sms:dev] to=${phone} message=${JSON.stringify(message)}`);
    return { ok: true, dev: true };
  }

  const endpoint = atUsername === 'sandbox' ? 'https://api.sandbox.africastalking.com/version1/messaging' : 'https://api.africastalking.com/version1/messaging';

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apiKey: atApiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        username: atUsername,
        to: toE164Zambia(phone),
        message,
        ...(atSenderId ? { from: atSenderId } : {}),
      }),
    });
  } catch (err) {
    return { ok: false, reason: 'network_error', detail: String(err) };
  }

  const responseText = await response.text();
  let recipientStatus: string | undefined;
  try {
    recipientStatus = JSON.parse(responseText)?.SMSMessageData?.Recipients?.[0]?.status;
  } catch {
    // non-JSON body
  }

  if (!response.ok || (recipientStatus && recipientStatus !== 'Success')) {
    return { ok: false, reason: 'provider_rejected', detail: responseText };
  }

  return { ok: true };
}
