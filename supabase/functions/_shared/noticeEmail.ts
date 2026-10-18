// Security / operations notice emails (payout events, company alerts). Same sender as email.ts,
// kept separate so its layout can't disturb the OTP and invite templates there.
const BRAND = {
  legalName: "Instay Homes Limited",
  address: "Kabanana 20/81, off Kabanana Road, Kabanana, Lusaka, Zambia",
  contactEmail: "team@instayhomes.com",
};

const LOGO_URL =
  "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png";

export type SendEmailResult = { ok: true; dev?: boolean };

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<SendEmailResult> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("EMAIL_FROM") || "no-reply@instay.co";

  if (!resendApiKey) {
    console.log(`[email:dev] to=${to} subject=${JSON.stringify(subject)}`);
    return { ok: true, dev: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
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
    .replace(/'/g, "&#39;");
}

function renderEmailHtml(bodyHtml: string): string {
  return `<!doctype html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<title>Instay Manage</title>
</head>
<body style='margin:0; padding:0; background:#EFF1EC; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;'>
<table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#EFF1EC;'>
<tr><td align='center' style='padding:32px 16px;'>
<table role='presentation' width='480' cellpadding='0' cellspacing='0' style='background:#FFFFFF; max-width:480px; width:100%;'>
<tr><td style='padding:36px 36px 0;'>
<table role='presentation' cellpadding='0' cellspacing='0'><tr>
<td style='padding-right:8px; vertical-align:middle;'><img src='${LOGO_URL}' alt='Instay Manage' height='20' style='display:block; height:20px; width:auto; border:0;'></td>
<td style='font-size:13px; font-weight:600; color:#1B2420; vertical-align:middle;'>Instay Manage</td>
</tr></table>
<div style='height:28px; border-bottom:1px solid #E4E6E1; line-height:1px; font-size:1px;'>&nbsp;</div>
</td></tr>
<tr><td style='padding:24px 36px 0;'>
${bodyHtml}
</td></tr>
<tr><td style='padding:32px 36px 32px;'>
<div style='border-top:1px solid #E4E6E1; padding-top:18px; text-align:center;'>
<div style='font-size:10.5px; color:#8A9289; line-height:1.6;'>
${escapeHtml(BRAND.legalName)}<br>
${escapeHtml(BRAND.address)}<br>
<a href='mailto:${BRAND.contactEmail}' style='color:#8A9289;'>${BRAND.contactEmail}</a>
</div>
<div style='font-size:9.5px; color:#B9BDB2; margin-top:10px;'>You're receiving this because you have an Instay Manage account. This is an automated security message, please don't reply to it.</div>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildNoticeEmailHtml(heading: string, bodyText: string, details: { label: string; value: string }[], warning?: string): string {
  const rows = details
    .map((d) =>
      `<tr><td style='padding:5px 0; font-size:12px; color:#5B665F; width:110px; vertical-align:top;'>${escapeHtml(d.label)}</td>` +
      `<td style='padding:5px 0; font-size:13px; font-weight:600; color:#1B2420;'>${escapeHtml(d.value)}</td></tr>`)
    .join("");
  const band = rows
    ? `<div style='height:20px;'></div><table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#F2F4EF;'><tr><td style='padding:14px 18px;'><table role='presentation' cellpadding='0' cellspacing='0'>${rows}</table></td></tr></table>`
    : "";
  const warn = warning
    ? `<div style='height:20px;'></div><table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#FBF3EA;'><tr><td style='padding:14px 16px; font-size:12.5px; color:#8A5A1E; line-height:1.6;'>${escapeHtml(warning)}</td></tr></table>`
    : "";
  const body = `
<div style='font-size:18px; font-weight:600; color:#1B2420;'>${escapeHtml(heading)}</div>
<div style='height:10px;'></div>
<div style='font-size:13px; color:#5B665F; line-height:1.6;'>${escapeHtml(bodyText)}</div>${band}${warn}`;
  return renderEmailHtml(body);
}
