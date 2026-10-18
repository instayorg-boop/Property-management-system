// Shared Lenco helpers: payout fee table, the single wallet account, and its live balance.

export const FEE_TIERS: { upTo: number; fee: number }[] = [
  { upTo: 150, fee: 8.5 },
  { upTo: 300, fee: 10 },
  { upTo: 500, fee: 11 },
  { upTo: 1_000, fee: 12 },
  { upTo: 3_000, fee: 15 },
  { upTo: 5_000, fee: 18 },
  { upTo: 10_000, fee: 20 },
  { upTo: 50_000, fee: 25 },
  { upTo: 100_000_000, fee: 35 },
];

export function lencoTransferFee(amount: number): number {
  const tier = FEE_TIERS.find((t) => amount <= t.upTo);
  return tier ? tier.fee : FEE_TIERS[FEE_TIERS.length - 1].fee;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Lenco takes about 1 percent of a mobile money collection. Used only until the webhook tells us the real fee.
export function estimateCollectionFee(amount: number): number {
  return round2(amount * 0.01);
}

export type Wallet = { ok: boolean; accountId?: string; available: number | null; detail?: unknown };

// The same account every transfer is sent from (the first one), plus what is spendable in it right now.
export async function getWallet(lencoSecretKey: string): Promise<Wallet> {
  try {
    const res = await fetch('https://api.lenco.co/access/v2/accounts', {
      headers: { Authorization: `Bearer ${lencoSecretKey}`, accept: 'application/json' },
    });
    const body = await res.json();
    const acc = body?.data?.[0];
    if (!res.ok || !acc?.id) return { ok: false, available: null, detail: body };
    const n = Number(acc.availableBalance);
    return { ok: true, accountId: acc.id as string, available: Number.isFinite(n) ? n : null };
  } catch (err) {
    return { ok: false, available: null, detail: String(err) };
  }
}
