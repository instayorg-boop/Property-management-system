import { useEffect, useMemo, useState } from "react";
import { useSettings } from "./SettingsContext";
import { formatCurrency } from "./TenantsContext";
import { getLencoBalance, listPayouts, type PayoutRecord } from "../lib/payoutApi";
import type { UpcomingPayout } from "./components/PayoutDetailDrawer";

/** Same balance figure Dashboard.tsx computes locally (see its own note there) — what's actually
 * sitting in Lenco, ready to withdraw. Pulled into a shared hook so the Accounting header pill and
 * the Settings "Available to withdraw" block don't each duplicate this fetch/shape logic; Dashboard
 * keeps its own separate copy for now rather than risk touching it in this pass. */
export function usePayoutSummary() {
  const { propertyId, lencoConnected, bankName, accountNumber } = useSettings();

  const [lencoAvailable, setLencoAvailable] = useState<number | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    getLencoBalance(propertyId)
      .then(({ available }) => {
        if (!cancelled) setLencoAvailable(available);
      })
      .catch((e) => console.error("Failed to load Lenco balance", e));
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  // The most recent payout attempt — drives the pill's failed-transfer status dot and the
  // "last payout" date shown in Settings. Not the full history (see listPayouts elsewhere for that).
  const [lastPayout, setLastPayout] = useState<PayoutRecord | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    listPayouts(propertyId, { limit: 1 })
      .then((rows) => {
        if (!cancelled) setLastPayout(rows[0] ?? null);
      })
      .catch((e) => console.error("Failed to load last payout", e));
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const payout = useMemo<UpcomingPayout | null>(() => {
    if (!lencoAvailable || lencoAvailable <= 0) return null;
    const now = new Date();
    return {
      amount: formatCurrency(lencoAvailable),
      rawAmount: lencoAvailable,
      propertyId,
      date: `As of ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
      status: lencoConnected ? "Ready to transfer" : "Connect a bank account to receive this",
      bankAccount: lencoConnected && bankName ? `${bankName}${accountNumber ? ` · •••• ${accountNumber.slice(-4)}` : ""}` : "Not connected",
      schedule: lencoConnected ? "Automatic online collection" : "Not set up yet",
    };
  }, [lencoAvailable, lencoConnected, bankName, accountNumber, propertyId]);

  return {
    payout,
    lencoAvailable,
    hasFailedPayout: lastPayout?.status === "failed",
    lastPayout,
  };
}
