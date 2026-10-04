import { useEffect, useId, useMemo, useState } from "react";
import { useSettings } from "./SettingsContext";
import { formatCurrency } from "./TenantsContext";
import { supabase } from "../lib/supabaseClient";
import { getLencoBalance, listPayouts, type PayoutRecord } from "../lib/payoutApi";
import type { UpcomingPayout } from "./components/PayoutDetailDrawer";

/** Same balance figure Dashboard.tsx computes locally (see its own note there) — what's actually
 * sitting in Lenco, ready to withdraw. Pulled into a shared hook so the Accounting header pill and
 * the Settings "Available to withdraw" block don't each duplicate this fetch/shape logic; Dashboard
 * keeps its own separate copy for now rather than risk touching it in this pass. */
export function usePayoutSummary() {
  const { propertyId, lencoConnected, bankName, accountNumber } = useSettings();
  // Multiple call sites use this hook at once (the Payouts page itself, and the Transfer funds
  // modal via useWithdrawFlow, both mounted together) — each needs its own Realtime channel name.
  // Supabase-js keys channels by topic, so two hook instances subscribing under the same
  // `payout-summary-balance:${propertyId}` name throws "cannot add postgres_changes callbacks ...
  // after subscribe()" the moment the second one mounts, which crashed the modal outright.
  const instanceId = useId();

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

  // Live updates — same debounced postgres_changes refetch Dashboard.tsx uses for its own copy of
  // this figure, so the Accounting header pill / Settings "Available to withdraw" block don't sit on
  // a stale balance until the component remounts.
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        getLencoBalance(propertyId)
          .then(({ available }) => {
            if (!cancelled) setLencoAvailable(available);
          })
          .catch((e) => console.error("Failed to refresh Lenco balance after a live update", e));
      }, 250);
    };
    const channel = supabase
      .channel(`payout-summary-balance:${propertyId}:${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "collections", filter: `property_id=eq.${propertyId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "payouts", filter: `property_id=eq.${propertyId}` }, refetch)
      .subscribe();
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [propertyId, instanceId]);

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
