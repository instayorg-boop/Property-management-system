import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import TenantPaymentDrawer from "../components/TenantPaymentDrawer";
import MoveOutModal from "../components/MoveOutModal";
import ExpenseFormDrawer from "../components/ExpenseFormDrawer";
import { type UpcomingPayout } from "../components/PayoutDetailDrawer";
import Select, { type SelectOption } from "../components/Select";
import { Skeleton } from "../components/Skeleton";
import { useTenants, useCollectedRent, formatCurrency, type Tenant } from "../TenantsContext";
import { useExpenses } from "../ExpensesContext";
import { useMaintenance } from "../MaintenanceContext";
import { useRoomsView } from "../RoomsContext";
import { useSettings } from "../SettingsContext";
import { getLencoBalance } from "../../lib/payoutApi";
import { supabase } from "../../lib/supabaseClient";
import { calcTotalOwed } from "../invoiceUtils";
import {
  ArrowRight as ArrowIcon,
  Wrench as WrenchIcon,
  CheckCircle as CheckCircleIcon,
  Money as CashIcon,
  Receipt as ReceiptIcon,
  UserPlus as UserPlusIcon,
  Plus as PlusIcon,
  DoorOpen as DoorIcon,
  Coins,
} from "@phosphor-icons/react";
import MetricCard from "../components/MetricCard";
import SectionLabel from "../components/SectionLabel";
import SetupChecklist from "../components/SetupChecklist";
import Button from "../components/Button";

type QuickAction = "log-payment" | "add-expense" | "add-tenant";

const quickActions: { label: string; action: QuickAction; Icon: typeof CashIcon }[] = [
  { label: "Log payment", action: "log-payment", Icon: CashIcon },
  { label: "Add expense", action: "add-expense", Icon: ReceiptIcon },
  { label: "Add tenant", action: "add-tenant", Icon: UserPlusIcon },
];

function Greeting({ onAction }: { propertyId: string | null; onAction: (action: QuickAction) => void }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 bg-mist px-4 pt-5 pb-6 sm:px-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tighter text-ink">
          Good {part} 👋🏼
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {today} · {time}
        </p>
       
      </div>

      {/* Desktop: full quick-action row */}
      <div className="hidden gap-2 sm:flex">
        {quickActions.map(({ label, action, Icon }, i) => (
          <Button
            key={label}
            variant={i === 0 ? "primary" : "secondary"}
            size="sm"
            onClick={() => onAction(action)}
          >
            {i === 0 ? <PlusIcon size={14} weight="bold" /> : <Icon size={14} weight="bold" />}
            {label}
          </Button>
        ))}
      </div>

      {/* Mobile: single + button opening an action sheet */}
      <div className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          aria-label="Quick actions"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-paper transition-transform hover:scale-[1.05]"
        >
          <PlusIcon size={18} weight="bold" />
        </button>

        {sheetOpen && (
          <>
            <button
              type="button"
              aria-label="Close quick actions"
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div className="absolute top-full right-0 z-20 mt-2 w-48 overflow-hidden rounded-lg border border-line bg-paper shadow-card">
              {quickActions.map(({ label, action, Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    onAction(action);
                    setSheetOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-mist"
                >
                  <Icon size={14} weight="bold" />
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const collectionRangeOptions: SelectOption[] = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
];

const statusStyle: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-600",
  Overdue: "bg-red-50 text-red-600",
  Partial: "bg-amber-50 text-amber-600",
  Unpaid: "bg-slate-100 text-slate-600",
  // A credit/waiver reduces what's owed rather than being money the tenant paid in — its own
  // color so it never reads as either a completed payment (green) or a problem (red).
  Credit: "bg-brand-soft text-brand",
};

const ledgerStatusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", partial: "Partial", unpaid: "Unpaid" };

const methodLabel: Record<string, string> = {
  cash: "Cash",
  "mobile-money": "Mobile money",
  "bank-transfer": "Bank transfer",
  other: "Other",
};

type PaymentStep = "search" | "ledger" | "confirm";

export default function Dashboard() {
  const { tenants, logPayments, moveOutTenant, isReady: tenantsReady } = useTenants();
  const { expenses } = useExpenses();
  const { reports } = useMaintenance();
  const rooms = useRoomsView();
  const { lencoConnected, bankName, accountNumber, propertyId, isReady: settingsReady } = useSettings();
  const totalCollected = useCollectedRent();
  const navigate = useNavigate();
  const dataReady = tenantsReady && settingsReady;

  const roomsOccupied = useMemo(
    () => ({ occupied: rooms.filter((r) => r.status === "occupied").length, total: rooms.length }),
    [rooms]
  );

  const activeTenantCount = useMemo(() => tenants.filter((t) => t.active).length, [tenants]);

  // Last 12 real calendar months, built from ledger entry timestamps across every tenant plus
  // logged expenses — one series each, same month buckets, so the chart can show both without
  // a second fetch or a second set of month math.
  const collections = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-US", { month: "short" }), amount: 0, expenses: 0 };
    });
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const t of tenants) {
      for (const row of t.ledger) {
        if (!row.createdAt || (row.status !== "paid" && row.status !== "partial")) continue;
        const created = new Date(row.createdAt);
        const bucket = byKey.get(`${created.getFullYear()}-${created.getMonth()}`);
        if (bucket) bucket.amount += row.status === "partial" ? (row.paidAmount ?? 0) : row.amount;
      }
    }
    for (const e of expenses) {
      if (!e.date) continue;
      const created = new Date(e.date);
      const bucket = byKey.get(`${created.getFullYear()}-${created.getMonth()}`);
      if (bucket) bucket.expenses += e.amount;
    }
    return months.map(({ label, amount, expenses }) => ({ label, amount, expenses }));
  }, [tenants, expenses]);

  // Every actual money-movement ledger entry across every tenant, newest first — replaces a
  // hardcoded "recent payments" list. Deliberately narrower than "every ledger row": a charge
  // that's still unpaid/overdue never involved money changing hands, so it's excluded rather than
  // showing up as a red, sign-less amount under a widget titled "Recent payments". Likewise a
  // penalty or a positive ad-hoc adjustment only changes what's *owed* — it isn't a payment either,
  // so it's left out here (it still shows on the tenant's own ledger).
  const payments = useMemo(() => {
    const rows: {
      key: string;
      tenantId: string;
      portalToken?: string;
      tenant: string;
      room: string;
      status: string;
      method: string;
      date: string;
      amount: string;
      isCredit: boolean;
      createdAt: string;
    }[] = [];
    for (const t of tenants) {
      for (const row of t.ledger) {
        // A voided entry is a record correction — it never happened financially (see
        // voidLedgerEntry), so it must never read as recent activity here.
        if (!row.createdAt || row.voidedAt) continue;

        let value = 0;
        let label: string;
        // A credit/waiver forgives part of what's owed rather than being cash the tenant handed
        // over — shown with its own label/color, never folded into "Paid".
        let isCredit = false;

        if (row.eventType === "payment") {
          value = Math.abs(row.amount);
          label = "Paid";
        } else if (row.eventType === "credit") {
          value = Math.abs(row.amount);
          label = "Credit";
          isCredit = true;
        } else if (row.eventType === "penalty" || row.eventType === "adjustment") {
          continue;
        } else {
          // Legacy row or a projected charge — one row per billing period; status carries whether
          // (and how much of) it was actually collected.
          if (row.status !== "paid" && row.status !== "partial") continue;
          value = row.status === "partial" ? (row.paidAmount ?? 0) : row.amount;
          if (value <= 0) continue;
          label = ledgerStatusLabel[row.status] ?? "Paid";
        }

        rows.push({
          key: row.id,
          tenantId: t.id,
          portalToken: t.portalToken,
          tenant: t.name,
          room: t.room,
          status: label,
          method: row.method ? (methodLabel[row.method] ?? row.method) : "Manual",
          date: new Date(row.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          amount: `${isCredit ? "" : "+"}${formatCurrency(value)}`,
          isCredit,
          createdAt: row.createdAt,
        });
      }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  }, [tenants]);

  // What's actually sitting in Lenco, ready to withdraw — real mobile-money collections minus
  // whatever's already been paid out. Deliberately NOT gross-collected-minus-fee-minus-expenses
  // (that's the Owner Payout Statement's separate accounting view): a cash payment a landlord logs
  // manually never touches Lenco, so it has nothing to contribute here, and there's no fee or
  // expense deduction — this figure is just "how much money can I actually pull out right now."
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

  // Live updates — a mobile-money collection landing (lenco-webhook) or a payout going out changes
  // this figure, and the card should reflect that without the landlord having to reload the whole
  // dashboard. Debounced the same way TenantsContext's own ledger subscription is: a collection and
  // its downstream writes can fire a short burst of change events for one real event, and each one
  // triggering its own immediate refetch would flicker the balance between intermediate states.
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
      .channel(`lenco-balance:${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "collections", filter: `property_id=eq.${propertyId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "payouts", filter: `property_id=eq.${propertyId}` }, refetch)
      .subscribe();
    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
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

  const [paymentStep, setPaymentStep] = useState<PaymentStep | null>(null);
  const [payingTenant, setPayingTenant] = useState<Tenant | null>(null);
  const [movingOutTenant, setMovingOutTenant] = useState<Tenant | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [collectionRange, setCollectionRange] = useState("6");

  // Unread maintenance reports — hide the whole card when empty.
  const unreadMaintenance = useMemo(() => reports.filter((r) => r.unread).slice(0, 5), [reports]);

  const outstanding = useMemo(() => {
    const behind = tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid" || t.status === "partial"));
    const total = behind.reduce((sum, t) => sum + calcTotalOwed(t), 0);
    return { total, count: behind.length };
  }, [tenants]);

  const handleAction = (action: QuickAction) => {
    if (action === "log-payment") setPaymentStep("search");
    if (action === "add-tenant") navigate("/tenants/new");
    if (action === "add-expense") setAddingExpense(true);
  };

  return (
    <>
      <Greeting propertyId={propertyId} onAction={handleAction} />

      {/* Stat cards — their own full-width row, not sharing space with any other panel. Card
          chrome renders immediately; only the figures inside shimmer while loading. */}
      <div className="px-4 sm:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!dataReady ? (
            <div className="rounded-lg border border-line bg-paper p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2.5 h-6 w-28" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ) : (
            <MetricCard
              tone="success"
              label="Total collected"
              value={`K${totalCollected.toLocaleString()}`}
              caption={totalCollected > 0 ? "Collected from active tenants" : "Logged payments will show up here"}
              to="/rent"
            />
          )}
          {!dataReady ? (
            <div className="rounded-lg border border-line bg-paper p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-2.5 h-6 w-28" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ) : (
            <MetricCard
              label="Outstanding balance"
              value={`K${outstanding.total.toLocaleString()}`}
              tone={outstanding.total > 0 ? "danger" : "success"}
              caption={
                outstanding.total > 0
                  ? `${outstanding.count} tenant${outstanding.count === 1 ? "" : "s"} behind on rent`
                  : "Every active tenant is paid up"
              }
              to="/rent"
            />
          )}
          {!dataReady ? (
            <div className="rounded-lg border border-line bg-paper p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2.5 h-6 w-20" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ) : roomsOccupied.total > 0 ? (
            <MetricCard
              label="Rooms occupied"
              value={`${roomsOccupied.occupied} / ${roomsOccupied.total}`}
              tone={roomsOccupied.occupied === roomsOccupied.total ? "success" : "default"}
              caption={`${roomsOccupied.total - roomsOccupied.occupied} room${roomsOccupied.total - roomsOccupied.occupied === 1 ? "" : "s"} empty`}
              to="/rooms"
            />
          ) : (
            <button
              type="button"
              onClick={() => navigate("/rooms")}
              className="group rounded-lg border border-line bg-paper p-4 text-left transition-colors hover:border-ink/20 hover:bg-mist/40"
            >
              <p className="text-sm text-muted">Rooms occupied</p>
              <div className="mt-2.5 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                  <DoorIcon size={14} weight="duotone" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">No rooms yet</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted">
                    Add a room to get started
                    <ArrowIcon size={10} weight="bold" className="opacity-0 transition-opacity group-hover:opacity-100" />
                  </p>
                </div>
              </div>
            </button>
          )}
          {!dataReady ? (
            <div className="rounded-lg border border-line bg-paper p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2.5 h-6 w-28" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          ) : (
            <MetricCard
              label="Total tenants"
              value={`${activeTenantCount}`}
              caption={activeTenantCount > 0 ? "Across all your rooms" : "Add a tenant to get started"}
              to="/tenants"
            />
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 px-4 sm:px-8 pb-10 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="space-y-4 lg:col-span-2">
          {dataReady && <SetupChecklist />}

          {/* Rent income vs expenses chart */}
          <div className="rounded-lg border border-gray-200 bg-paper p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Rent income vs expenses</p>
                <span className="mt-1.5 flex items-center gap-3 text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Income
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-700" />
                    Expenses
                  </span>
                </span>
              </div>
              <Select
                value={collectionRange}
                onChange={setCollectionRange}
                options={collectionRangeOptions}
                className="py-1.5 text-xs"
              />
            </div>

            {!dataReady ? (
              <div className="mt-6 flex h-48 items-end gap-3 border-l border-line pl-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="w-full" style={{ height: `${30 + ((i * 17) % 60)}%` }} />
                ))}
              </div>
            ) : collections.length === 0 ? (
              <div className="mt-6 flex h-48 flex-col items-center justify-center gap-1 text-center">
                <p className="text-sm font-semibold text-ink">No income yet</p>
                <p className="text-xs text-muted">Logged payments will show up here month by month.</p>
              </div>
            ) : (
              <div className="mt-6 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={collections.slice(-Number(collectionRange))} barGap={4} margin={{ left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-line)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                      dy={6}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                      tickFormatter={(v: number) => `K${v / 1000}k`}
                      width={48}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-mist)" }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const income = payload.find((p) => p.dataKey === "amount")?.value as number | undefined;
                        const expenses = payload.find((p) => p.dataKey === "expenses")?.value as number | undefined;
                        return (
                          <div className="rounded-md bg-ink px-2.5 py-1.5 text-center shadow-lg">
                            <p className="text-[11px] font-semibold text-paper">{label}</p>
                            <p className="text-[11px] text-paper/90">K{(income ?? 0).toLocaleString()} income</p>
                            {!!expenses && <p className="text-[11px] text-paper/70">K{expenses.toLocaleString()} expenses</p>}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount" name="Income" fill="var(--color-success)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="expenses" name="Expenses" fill="var(--color-danger)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Recent payments table */}
          <div className="rounded-lg border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Recent payments</p>
              <Link to="/rent" className="text-xs font-medium text-brand hover:text-ink">
                View all
              </Link>
            </div>

            {!dataReady ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-2.5 w-1/5" />
                    </div>
                    <Skeleton className="h-3 w-14" />
                  </div>
                ))}
              </div>
            ) : payments.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center gap-1 py-10 text-center">
                <p className="text-sm font-semibold text-ink">No payments yet</p>
                <p className="text-xs text-muted">Payments you log will show up here.</p>
              </div>
            ) : (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pb-2 font-medium">Tenant</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Method</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  return (
                    <tr
                      key={p.key}
                      onClick={() => navigate("/rent", { state: { openTenantId: p.tenantId } })}
                      className="cursor-pointer border-t border-line transition-colors duration-200 ease-in-out hover:bg-mist"
                    >
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5">

                          <div>
                            <Link
                              to={`/tenants/${p.portalToken ?? p.tenantId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-ink hover:underline"
                            >
                              {p.tenant}
                            </Link>
                            <p className="text-[11px] text-muted">{p.room}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[p.status]}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted">{p.method}</td>
                      <td className="py-2.5 text-muted">{p.date}</td>
                      <td
                        className={`py-2.5 text-right font-medium ${p.isCredit ? "text-brand" : "text-emerald-600"}`}
                      >
                        {p.amount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          

          {/* Online payments balance — its own brand-tinted surface (every other card on this page
              is plain bg-paper) so the one number that's actually sitting in a payment gateway,
              waiting to be moved, reads as different in kind from a stat card, not just another
              tile in the column. */}
          <div className="rounded-lg border border-brand/15 bg-brand-soft p-5">
            {!dataReady ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-7 w-1/2" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="mt-2 h-9 w-full rounded-lg" />
              </div>
            ) : payout ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-brand">
                    <Coins size={16} weight="duotone" />
                  </span>
                  <SectionLabel>Online payments balance</SectionLabel>
                </div>
                <p className="font-display mt-3 text-[32px] leading-none font-bold tracking-tight text-brand">{payout.amount}</p>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                  <CheckCircleIcon size={11} weight="fill" />
                  {payout.status}
                </span>
                <p className="mt-2 text-xs text-ink/70">Collected via mobile money · {payout.date}</p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate("/online-payments")}
                  className="mt-4 block w-full text-center"
                >
                  Transfer to bank
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
                <p className="text-sm font-semibold text-ink">Nothing to transfer yet</p>
                <p className="text-xs text-ink/70">Rent paid online through your payment link will show up here.</p>
              </div>
            )}
          </div>

          {/* Maintenance inbox preview */}
          <div className="rounded-lg border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Maintenance requests</p>
              {unreadMaintenance.length > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                  {unreadMaintenance.length} new
                </span>
              )}
            </div>

            {unreadMaintenance.length > 0 ? (
              <>
                <div className="mt-3 space-y-3">
                  {unreadMaintenance.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigate("/maintenance", { state: { openReportId: r.id } })}
                      className="flex w-full items-start gap-2.5 rounded-lg text-left transition-colors hover:bg-mist"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                        <WrenchIcon size={14} weight="duotone" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-ink">{r.location}</p>
                          <span className="text-[11px] text-muted">· {timeAgo(r.submittedAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted">{r.description}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <Link
                  to="/maintenance"
                  className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-mist py-2 text-xs font-medium text-ink transition-colors hover:bg-line/40"
                >
                  View all
                  <ArrowIcon size={14} weight="bold" />
                </Link>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <CheckCircleIcon size={24} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">All caught up</p>
                  <p className="mt-0.5 text-xs text-muted">No open maintenance requests right now.</p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      <AnimatePresence>
        {paymentStep === "search" && (
          <TenantSearchDrawer
            onClose={() => setPaymentStep(null)}
            onPick={(t) => {
              setPayingTenant(t);
              setPaymentStep("ledger");
            }}
          />
        )}
        {paymentStep === "ledger" && payingTenant && (
          <TenantPaymentDrawer
            tenant={payingTenant}
            onClose={() => {
              setPaymentStep(null);
              setPayingTenant(null);
            }}
            onLogPayment={() => setPaymentStep("confirm")}
            onEdit={() => navigate(`/tenants/${payingTenant.portalToken}/edit`)}
            onMoveOut={() => setMovingOutTenant(payingTenant)}
          />
        )}
        {paymentStep === "confirm" && payingTenant && (
          <LogPaymentModal
            tenantName={payingTenant.name}
            room={`${payingTenant.room} · ${payingTenant.roomType}`}
            outstanding={calcTotalOwed(payingTenant) || payingTenant.rentAmount}
            rentAmount={payingTenant.rentAmount}
            ledger={payingTenant.ledger}
            onClose={() => setPaymentStep("ledger")}
            onConfirm={(payments) => {
              logPayments(
                payingTenant.id,
                payments.map((payment) => ({
                  amount: payment.amount,
                  label: payment.label,
                  method: payment.method === "mobile" ? "mobile-money" : "cash",
                  paidAt: payment.date,
                })),
              );
              setPaymentStep(null);
              setPayingTenant(null);
            }}
          />
        )}
        {movingOutTenant && (
          <MoveOutModal
            tenant={movingOutTenant}
            onClose={() => setMovingOutTenant(null)}
            onConfirm={(details) => {
              moveOutTenant(movingOutTenant.id, details);
              setMovingOutTenant(null);
              setPaymentStep(null);
              setPayingTenant(null);
            }}
          />
        )}

        {addingExpense && <ExpenseFormDrawer editing={null} onClose={() => setAddingExpense(false)} />}
      </AnimatePresence>
    </>
  );
}
