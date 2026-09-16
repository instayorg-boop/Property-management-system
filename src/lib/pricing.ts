// Commercial model constants — subscription tiers, the online payment fee schedule, and the
// one-time setup fee. Single source of truth for the frontend (Settings' plan picker, the payment
// portal's fee preview, the marketing Pricing page). The payment edge function
// (supabase/functions/pay-portal-collect-payment) runs in Deno and can't import this file, so its
// copy of ONLINE_FEE_BANDS is kept in sync by hand — same pattern already used for the late-penalty
// formula, which is duplicated across invoiceUtils.ts, payPortal.ts, and that edge function.

export type SubscriptionTier = {
  id: string;
  /** Upper bound of the bed range this tier covers, inclusive. */
  maxBeds: number;
  label: string;
  monthlyPriceK: number;
  setupFeeK: number;
};

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  { id: "up_to_50", maxBeds: 50, label: "Up to 50 beds", monthlyPriceK: 399, setupFeeK: 499 },
  { id: "51_to_120", maxBeds: 120, label: "51 to 120 beds", monthlyPriceK: 799, setupFeeK: 999 },
  { id: "121_to_300", maxBeds: 300, label: "121 to 300 beds", monthlyPriceK: 1499, setupFeeK: 1999 },
  { id: "301_to_500", maxBeds: 500, label: "301 to 500 beds", monthlyPriceK: 2499, setupFeeK: 2999 },
];

/** The tenant-facing online payment fee, as a percentage of the amount being paid — declines as
 * the tenant's contracted monthly rent rises, so higher rent isn't disproportionately penalized by
 * a flat rate. The band is chosen by the tenant's monthly rent (not the amount paid in any one
 * transaction), so splitting a payment into installments can't be used to reach a lower band. */
export const ONLINE_FEE_BANDS: { upToRent: number; rate: number }[] = [
  { upToRent: 2000, rate: 0.02 },
  { upToRent: 2500, rate: 0.019 },
  { upToRent: 3000, rate: 0.018 },
  { upToRent: 3500, rate: 0.017 },
  { upToRent: 4000, rate: 0.016 },
  { upToRent: 4500, rate: 0.015 },
  { upToRent: 5000, rate: 0.014 },
  { upToRent: 5500, rate: 0.013 },
  { upToRent: 6000, rate: 0.0125 },
];

/** Rent above the top band (K6,000) isn't specified in the pricing doc — holds at the lowest
 * defined rate rather than erroring, continuing the declining-rate trend. */
const RATE_ABOVE_TOP_BAND = 0.0125;

export function onlineFeeRateForRent(monthlyRent: number): number {
  for (const band of ONLINE_FEE_BANDS) {
    if (monthlyRent <= band.upToRent) return band.rate;
  }
  return RATE_ABOVE_TOP_BAND;
}
