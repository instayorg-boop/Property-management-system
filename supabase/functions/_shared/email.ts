// Shared email sender — no provider is wired up yet (RESEND_API_KEY isn't set anywhere in this
// project), so this follows the exact same "dev-mode placeholder" convention already used by
// pay-portal-request-otp for SMS: when no key is configured, it logs what would have been sent and
// returns ok:true with `dev: true` so the calling function's flow can still be exercised end-to-end
// without real delivery. Swap in a real Resend call (or whichever provider) once RESEND_API_KEY is
// set — the call shape below is Resend's, so setting the key is close to enough on its own.

export type SendEmailResult = { ok: true; dev?: boolean };

export async function sendEmail(to: string, subject: string, text: string): Promise<SendEmailResult> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("EMAIL_FROM") || "no-reply@instay.co";

  if (!resendApiKey) {
    console.log(`[email:dev] to=${to} subject=${JSON.stringify(subject)} body=${JSON.stringify(text)}`);
    return { ok: true, dev: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress, to: [to], subject, text }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to send email: ${detail}`);
  }
  return { ok: true };
}
