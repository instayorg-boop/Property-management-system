// Shared email sender and the Instay Manage transactional email template, one visual shell
// (logo + wordmark header, a thin rule, the caller's content, a compliance footer naming the
// legal entity, address and contact, plus why the recipient got this) wraps both of this app's
// email shapes: a one-time code (buildOtpEmailHtml) and a security notice (buildAlertEmailHtml).
// Colors match the rent-receipt PDF (pay-portal-generate-receipt): same ink, same muted/band
// tones, green for a confirmed action, amber for something to double check.
//
// No provider is wired up until RESEND_API_KEY is set: before that this logs what would have
// been sent and returns ok:true with dev:true, the same "dev-mode placeholder" convention
// pay-portal-request-otp already uses for SMS, so a calling function's flow can be exercised
// end-to-end without real delivery. Once the key is set, this sends both html and text (Resend
// accepts both in one call) so every mail client has a plain-text fallback.

const BRAND = {
  legalName: "Instay Homes Limited",
  address: "Kabanana 20/81, off Kabanana Road, Kabanana, Lusaka, Zambia",
  contactEmail: "team@instayhomes.com",
  settingsUrl: "https://portal.instayhomes.com/settings",
};

const LOGO_URL =
  "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png";

export type SendEmailResult = { ok: true; dev?: boolean };

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<SendEmailResult> {
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
    body: JSON.stringify({ from: fromAddress, to: [to], subject, text, ...(html ? { html } : {}) }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to send email: ${detail}`);
  }
  return { ok: true };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The shared shell: table-based layout (not flex/grid) so it holds up in Outlook's rendering
// engine, inline styles throughout since most mail clients strip a <style> block, and the real
// logo image rather than an inline <svg>, which Outlook desktop won't render at all.
function renderEmailHtml(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instay Manage</title>
</head>
<body style="margin:0; padding:0; background:#EFF1EC; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF1EC;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF; max-width:480px; width:100%;">
<tr><td style="padding:36px 36px 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:8px; vertical-align:middle;"><img src="${LOGO_URL}" alt="Instay Manage" height="20" style="display:block; height:20px; width:auto; border:0;"></td>
<td style="font-size:13px; font-weight:600; color:#1B2420; vertical-align:middle;">Instay Manage</td>
</tr></table>
<div style="height:28px; border-bottom:1px solid #E4E6E1; line-height:1px; font-size:1px;">&nbsp;</div>
</td></tr>
<tr><td style="padding:24px 36px 0;">
${bodyHtml}
</td></tr>
<tr><td style="padding:32px 36px 32px;">
<div style="border-top:1px solid #E4E6E1; padding-top:18px; text-align:center;">
<div style="font-size:10.5px; color:#8A9289; line-height:1.6;">
${escapeHtml(BRAND.legalName)}<br>
${escapeHtml(BRAND.address)}<br>
<a href="mailto:${BRAND.contactEmail}" style="color:#8A9289;">${BRAND.contactEmail}</a>
</div>
<div style="font-size:9.5px; color:#B9BDB2; margin-top:10px;">You're receiving this because you have an Instay Manage account. This is an automated security message, please don't reply to it.</div>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// A one-time code email (both withdrawal and add-recipient OTP purposes share this shape): the
// code set apart in a tinted band, same device the receipt PDF uses for its totals, so the one
// thing that matters is unmissable.
export function buildOtpEmailHtml(heading: string, introText: string, code: string, expiresMinutes: number): string {
  const spacedCode = `${code.slice(0, 3)} ${code.slice(3)}`;
  const body = `
<div style="font-size:18px; font-weight:600; color:#1B2420;">${escapeHtml(heading)}</div>
<div style="height:10px;"></div>
<div style="font-size:13px; color:#5B665F; line-height:1.6;">${escapeHtml(introText)}</div>
<div style="height:28px;"></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4EF;">
<tr><td align="center" style="padding:22px 0;">
<div style="font-family:'Courier New',Courier,monospace; font-size:34px; font-weight:700; color:#1B2420; letter-spacing:6px;">${escapeHtml(spacedCode)}</div>
<div style="font-size:11.5px; color:#5B665F; margin-top:8px;">Expires in ${expiresMinutes} minutes</div>
</td></tr>
</table>
<div style="height:24px;"></div>
<div style="font-size:12px; color:#8A9289; line-height:1.6;">If you didn't request this, ignore this email. Nothing happens without this code.</div>`;
  return renderEmailHtml(body);
}

// A security notice email (both "payout method added" cases, bank and mobile money, share this
// shape): amber rather than the receipt's green, since this confirms something changed rather
// than a payment that went through, with a direct link back into the app to undo it.
export function buildAlertEmailHtml(heading: string, bodyText: string): string {
  const body = `
<div style="font-size:18px; font-weight:600; color:#1B2420;">${escapeHtml(heading)}</div>
<div style="height:10px;"></div>
<div style="font-size:13px; color:#5B665F; line-height:1.6;">${escapeHtml(bodyText)}</div>
<div style="height:24px;"></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF3EA;">
<tr><td style="padding:14px 16px; font-size:12.5px; color:#8A5A1E; line-height:1.6;">
<strong>Wasn't you?</strong> Remove it straight away in <a href="${BRAND.settingsUrl}" style="color:#8A5A1E; text-decoration:underline;">Settings &gt; Bank &amp; payouts</a>.
</td></tr>
</table>`;
  return renderEmailHtml(body);
}
