/** Same brand icons the tenant payment portal uses (src/pages/pay/TenantBalance.tsx's
 * PROVIDER_ICON) — kept as a shared constant so both places draw from one source instead of two
 * copies of the same CDN URLs drifting apart. Keyed lowercase to match payout_recipients.provider,
 * unlike the portal's own uppercase "MTN"/"Airtel"/"Zamtel" keys. */
export const MOBILE_MONEY_LOGO: Record<"mtn" | "airtel" | "zamtel", string> = {
  mtn: "https://cdn.brandfetch.io/idtdXB-ogi/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B",
  airtel: "https://cdn.brandfetch.io/idvMDbAci6/w/400/h/400/theme/dark/icon.jpeg?c=1dxbfHSJFAPEGdCLU4o5B",
  zamtel: "https://cdn.brandfetch.io/id8xS_vcc_/w/150/h/150/theme/dark/logo.png?c=1dxbfHSJFAPEGdCLU4o5B",
};
