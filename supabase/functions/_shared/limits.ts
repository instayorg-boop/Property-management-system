// Money limits live in one database row (platform_money_limits) so they can be changed with SQL, no redeploy.

export type Limits = { maxMobileMoney: number; maxBank: number; minSweep: number; walletBuffer: number };

const DEFAULTS: Limits = { maxMobileMoney: 50000, maxBank: 100000, minSweep: 500, walletBuffer: 100 };

// deno-lint-ignore no-explicit-any
export async function getLimits(db: any): Promise<Limits> {
  try {
    const { data } = await db.from('platform_money_limits').select('max_mobile_money,max_bank,min_sweep,wallet_buffer').eq('id', true).maybeSingle();
    if (!data) return DEFAULTS;
    return {
      maxMobileMoney: Number(data.max_mobile_money) || DEFAULTS.maxMobileMoney,
      maxBank: Number(data.max_bank) || DEFAULTS.maxBank,
      minSweep: Number(data.min_sweep) || DEFAULTS.minSweep,
      walletBuffer: Number.isFinite(Number(data.wallet_buffer)) ? Number(data.wallet_buffer) : DEFAULTS.walletBuffer,
    };
  } catch {
    return DEFAULTS;
  }
}

export function maxForRecipient(l: Limits, recipientType: string | null | undefined): number {
  return recipientType === 'mobile-money' ? l.maxMobileMoney : l.maxBank;
}
