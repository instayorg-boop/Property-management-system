// Single source of truth for IPM's own support contact details shown to landlords on the
// dashboard (see Header.tsx's account menu). Update here if the number ever changes.

const RAW_PHONE = "+260779722215";

export const SUPPORT_PHONE_DISPLAY = "+260 77 972 2215";
export const SUPPORT_PHONE_TEL = `tel:${RAW_PHONE}`;
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${RAW_PHONE.replace("+", "")}`;

// Same WhatsApp number, with a prefilled message. Use this wherever the link should open
// straight into a specific conversation (e.g. "book a demo") instead of a blank chat.
export const supportWhatsappUrl = (message: string) =>
  `${SUPPORT_WHATSAPP_URL}?text=${encodeURIComponent(message)}`;

// Placeholder until Marcus gives us the real inbox to use, swap this one value and every
// Help & Support page picks it up.
export const SUPPORT_EMAIL = "support@instayhomes.com";
