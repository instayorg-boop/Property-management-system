import { sendEmail, buildNoticeEmailHtml } from "./noticeEmail.ts";

// Emails the company inbox (secret COMPANY_ALERT_EMAIL). Never throws, so an email problem can never stop money logic.
export async function alertCompany(
  subject: string,
  heading: string,
  text: string,
  details: { label: string; value: string }[] = [],
  warning?: string,
): Promise<void> {
  const to = Deno.env.get("COMPANY_ALERT_EMAIL");
  if (!to) {
    console.log(`[company-alert] COMPANY_ALERT_EMAIL not set. ${subject}: ${text}`);
    return;
  }
  try {
    await sendEmail(to, subject, text, buildNoticeEmailHtml(heading, text, details, warning));
  } catch (err) {
    console.error("[company-alert] email failed", String(err));
  }
}
