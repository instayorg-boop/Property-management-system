/** The mobile-money brand marks, in one place — used by the landlord's payout settings and by the
 * tenant portal's checkout (src/pages/portal/PortalCheckout.tsx), so the two can't drift into two
 * copies of the same CDN URLs. Keyed lowercase to match payout_recipients.provider. */
export const MOBILE_MONEY_LOGO: Record<"mtn" | "airtel" | "zamtel", string> = {
  mtn: "https://cdn.brandfetch.io/idtdXB-ogi/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B",
  airtel: "https://cdn.brandfetch.io/idvMDbAci6/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B",
  zamtel: "https://cdn.brandfetch.io/id8xS_vcc_/w/150/h/150/theme/dark/logo.png?c=1dxbfHSJFAPEGdCLU4o5B",
};
