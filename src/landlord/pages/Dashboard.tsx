import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import TenantPaymentDrawer from "../components/TenantPaymentDrawer";
import MoveOutModal from "../components/MoveOutModal";
import ExpenseFormDrawer from "../components/ExpenseFormDrawer";
import PayoutDetailDrawer, { type UpcomingPayout } from "../components/PayoutDetailDrawer";
import Select, { type SelectOption } from "../components/Select";
import { Skeleton } from "../components/Skeleton";
import { useTenants, useCollectedRent, formatCurrency, type Tenant } from "../TenantsContext";
import { useExpenses } from "../ExpensesContext";
import { useMaintenance } from "../MaintenanceContext";
import { useRoomsView } from "../RoomsContext";
import { useSettings } from "../SettingsContext";
import { getLencoBalance } from "../../lib/payoutApi";
import { useCachedViewSyncedAt } from "../../lib/offline/hooks";
import { LastSyncedLabel } from "../components/SyncStatus";
import {
  ArrowRight as ArrowIcon,
  Wrench as WrenchIcon,
  CheckCircle as CheckCircleIcon,
  Money as CashIcon,
  Receipt as ReceiptIcon,
  UserPlus as UserPlusIcon,
  Plus as PlusIcon,
  ChartBar as ChartBarIcon,
  Wallet as WalletIcon,
  DoorOpen as DoorIcon,
  Sparkle as SparkleIcon,
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

function Greeting({ name, propertyId, onAction }: { name: string; propertyId: string | null; onAction: (action: QuickAction) => void }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const tenantsSyncedAt = useCachedViewSyncedAt("tenants", propertyId ?? undefined);

  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 bg-paper px-4 pt-5 pb-6 sm:px-8">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          Good {part}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {today} · {time}
        </p>
        {propertyId && (
          <div className="mt-1">
            <LastSyncedLabel lastSyncedAt={tenantsSyncedAt} />
          </div>
        )}
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

// A category-level nudge in "Today's briefing" — a count and a straight link to the page where
// the landlord actually resolves it, rather than an itemized list of every tenant/report.
// A suggestion in the AI briefing panel — plain-language copy generated from real dashboard
// counts (overdue tenants, unread maintenance reports), each pointing straight at the page where
// it gets resolved. Not a model call — just the numbers already on this page, phrased as advice.
type Suggestion = {
  icon: typeof CashIcon;
  headline: string;
  body: string;
  cta: string;
  to: string;
};

function SuggestionCard({ item, index }: { item: Suggestion; index: number }) {
  const Icon = item.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.15 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        to={item.to}
        className="group flex items-start  border rounded-lg  p-3.5 backdrop-blur-sm transition-all hover:border-white bg-white hover:shadow-md"
      >
        
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{item.headline}</p>
          <p className="mt-0.5 text-xs text-muted">{item.body}</p>
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
            {item.cta}
            <ArrowIcon size={12} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </motion.div>
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
};

const ledgerStatusLabel: Record<string, string> = { paid: "Paid", overdue: "Overdue", partial: "Partial", unpaid: "Unpaid" };

type PaymentStep = "search" | "ledger" | "confirm";

export default function Dashboard() {
  const { tenants, logPayments, moveOutTenant, isReady: tenantsReady } = useTenants();
  const { expenses } = useExpenses();
  const { reports } = useMaintenance();
  const rooms = useRoomsView();
  const { landlordName, lencoConnected, bankName, accountNumber, propertyId, isReady: settingsReady } = useSettings();
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

  // Every ledger entry across every tenant, newest first — replaces a hardcoded "recent payments" list.
  const payments = useMemo(() => {
    const rows: { tenantId: string; tenant: string; room: string; status: string; date: string; amount: string; createdAt: string }[] = [];
    for (const t of tenants) {
      for (const row of t.ledger) {
        if (!row.createdAt) continue;
        const collected = row.status === "partial" ? (row.paidAmount ?? 0) : row.amount;
        rows.push({
          tenantId: t.id,
          tenant: t.name,
          room: t.room,
          status: ledgerStatusLabel[row.status ?? "paid"] ?? "Paid",
          date: new Date(row.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          amount: `${row.status === "paid" || row.status === "partial" ? "+" : ""}${formatCurrency(collected)}`,
          createdAt: row.createdAt,
        });
      }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  }, [tenants]);

  // Overdue/unpaid tenants and unread maintenance reports, worst first — replaces a hardcoded
  // briefing list. (No "lease ending soon" category: there's no lease-end date in the data model.)
  const overdueRentCount = useMemo(
    () => tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid")).length,
    [tenants]
  );
  const unreadReportCount = useMemo(() => reports.filter((r) => r.unread).length, [reports]);
  const overdueRentTotal = useMemo(
    () => tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid")).reduce((sum, t) => sum + t.owedAmount, 0),
    [tenants]
  );

  // Plain-language suggestions built from the same counts shown elsewhere on this page — not a
  // model call, just the numbers phrased as advice and pointed at where they get resolved.
  const briefing = useMemo<Suggestion[]>(() => {
    const items: Suggestion[] = [];
    if (overdueRentCount > 0) {
      items.push({
        icon: CashIcon,
        headline:
          overdueRentCount === 1
            ? `1 tenant is behind on rent, totaling ${formatCurrency(overdueRentTotal)}.`
            : `${overdueRentCount} tenants are behind on rent, totaling ${formatCurrency(overdueRentTotal)}.`,
        body: "Start with whoever owes the most — they're the biggest hit to what you collect this month.",
        cta: "Review overdue rent",
        to: "/rent",
      });
    }
    if (unreadReportCount > 0) {
      items.push({
        icon: WrenchIcon,
        headline:
          unreadReportCount === 1
            ? "1 maintenance request is waiting on you."
            : `${unreadReportCount} maintenance requests are waiting on you.`,
        body: "Tenants can see these are still open — worth a quick look before they follow up.",
        cta: "Open maintenance requests",
        to: "/maintenance",
      });
    }
    return items;
  }, [overdueRentCount, overdueRentTotal, unreadReportCount]);

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
      schedule: lencoConnected ? "Automatic via Lenco" : "Not set up yet",
    };
  }, [lencoAvailable, lencoConnected, bankName, accountNumber, propertyId]);

  const [paymentStep, setPaymentStep] = useState<PaymentStep | null>(null);
  const [payingTenant, setPayingTenant] = useState<Tenant | null>(null);
  const [movingOutTenant, setMovingOutTenant] = useState<Tenant | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [collectionRange, setCollectionRange] = useState("6");
  const [activeBar, setActiveBar] = useState<number | null>(null);

  // Unread maintenance reports — hide the whole card when empty.
  const unreadMaintenance = useMemo(() => reports.filter((r) => r.unread).slice(0, 5), [reports]);

  const outstanding = useMemo(() => {
    const behind = tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid" || t.status === "partial"));
    const total = behind.reduce((sum, t) => sum + t.owedAmount, 0);
    return { total, count: behind.length };
  }, [tenants]);

  const handleAction = (action: QuickAction) => {
    if (action === "log-payment") setPaymentStep("search");
    if (action === "add-tenant") navigate("/tenants/new");
    if (action === "add-expense") setAddingExpense(true);
  };

  return (
    <>
      <Greeting name={landlordName} propertyId={propertyId} onAction={handleAction} />

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
            />
          ) : (
            <div className="rounded-lg border border-line bg-paper p-4">
              <p className="text-sm text-muted">Rooms occupied</p>
              <div className="mt-2.5 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                  <DoorIcon size={14} weight="duotone" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">No rooms yet</p>
                  <p className="text-[11px] text-muted">Add a room to get started</p>
                </div>
              </div>
            </div>
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
            />
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 px-4 sm:px-8 pb-10 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="space-y-4 lg:col-span-2">
          {dataReady && <SetupChecklist />}

          {/* Rent income vs expenses chart */}
          <div className="rounded-lg border-2 border-gray-100 bg-paper p-5">
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
              <div className="mt-6 flex h-48 flex-col items-center justify-center gap-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <ChartBarIcon size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">No income yet</p>
                  <p className="mt-0.5 text-xs text-muted">Logged payments will show up here month by month.</p>
                </div>
              </div>
            ) : (() => {
              const visibleCollections = collections.slice(-Number(collectionRange));
              const maxAmount = Math.max(...visibleCollections.map((m) => Math.max(m.amount, m.expenses)));
              const chartMax = Math.max(Math.ceil(maxAmount / 50000) * 50000, 50000);
              const ticks = [4, 3, 2, 1, 0].map((i) => Math.round((chartMax / 4) * i));
              return (
                <div className="mt-6 flex h-48 gap-3">
                  {/* Y-axis */}
                  <div className="flex h-40 flex-col justify-between pb-6 text-right text-[11px] text-muted">
                    {ticks.map((t) => (
                      <span key={t}>K{(t / 1000).toFixed(0)}k</span>
                    ))}
                  </div>

                  {/* Bars */}
                  <div className="relative flex h-40 flex-1 items-end gap-3 border-l border-line pl-3">
                    {/* Gridlines */}
                    <div className="pointer-events-none absolute inset-0 left-3 flex flex-col justify-between">
                      {ticks.map((t) => (
                        <div key={t} className="border-t border-line/60" />
                      ))}
                    </div>

                    <AnimatePresence mode="popLayout" initial={false}>
                      {visibleCollections.map((m, i) => {
                        // Expense tracking only reliably covers the current month right now — showing
                        // an "expenses" bar on past months would imply a history we don't actually have.
                        const isCurrentMonth = i === visibleCollections.length - 1;
                        const isActive = activeBar === i;
                        return (
                          <motion.div
                            key={`${collectionRange}-${m.label}`}
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            transition={{ duration: 0.25, delay: i * 0.04 }}
                            className="relative flex h-full flex-1 flex-col items-center justify-end gap-2"
                          >
                            <AnimatePresence>
                              {isActive && (
                                <motion.div
                                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 4, scale: 0.95 }}
                                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                                  style={{ bottom: `calc(${(Math.max(m.amount, m.expenses) / chartMax) * 100}% + 8px)` }}
                                  className="absolute z-10 -translate-x-0 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-center shadow-lg"
                                >
                                  <p className="text-[11px] font-semibold text-paper">K{m.amount.toLocaleString()} income</p>
                                  {isCurrentMonth && <p className="text-[11px] text-paper/70">K{m.expenses.toLocaleString()} expenses</p>}
                                  <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-ink" />
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <button
                              type="button"
                              onClick={() => setActiveBar(isActive ? null : i)}
                              className="flex h-full w-full items-end justify-center gap-1"
                            >
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${(m.amount / chartMax) * 100}%` }}
                                transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                                className={`rounded-t-full transition-opacity ${isCurrentMonth ? "w-2.5 bg-emerald-500" : `w-4 ${i % 2 === 0 ? "bg-emerald-500" : "bg-emerald-500/45"}`} ${
                                  isActive ? "opacity-100" : "opacity-90 hover:opacity-100"
                                }`}
                              />
                              {isCurrentMonth && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${(m.expenses / chartMax) * 100}%` }}
                                  transition={{ duration: 0.5, delay: i * 0.04 + 0.05, ease: [0.16, 1, 0.3, 1] }}
                                  className={`w-2.5 rounded-t-full bg-red-700 transition-opacity ${isActive ? "opacity-100" : "opacity-90 hover:opacity-100"}`}
                                />
                              )}
                            </button>
                            <span className="absolute -bottom-6 text-[11px] text-muted">{m.label}</span>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })()}
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
              <div className="mt-4 flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <ReceiptIcon size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">No payments yet</p>
                  <p className="mt-0.5 text-xs text-muted">Payments you log will show up here.</p>
                </div>
              </div>
            ) : (
            <div className="overflow-x-auto">
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="pb-2 font-medium">Tenant</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => {
                  return (
                    <tr
                      key={`${p.tenantId}-${p.createdAt}-${i}`}
                      onClick={() => navigate("/rent", { state: { openTenantId: p.tenantId } })}
                      className="cursor-pointer border-t border-line transition-colors duration-200 ease-in-out hover:bg-mist"
                    >
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-mist text-[10px] font-semibold text-muted">
                            {p.tenant.split(" ").map((s) => s[0]).join("")}
                          </div>
                          <div>
                            <Link
                              to={`/tenants/${p.tenantId}`}
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
                      <td className="py-2.5 text-muted">{p.date}</td>
                      <td
                        className={`py-2.5 text-right font-medium ${
                          p.amount.startsWith("+") ? "text-emerald-600" : "text-red-600"
                        }`}
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
          {/* AI briefing — priority, so it stays at the top of this column. Plain-language
              suggestions built from real dashboard counts, framed as an assistant talking. */}
          <div className="relative overflow-hidden rounded-lg bg-linear-to-br from-[#241a4d] via-[#2d2166] to-[#1a1440] p-5 shadow-[0_8px_30px_-8px_rgba(76,29,149,0.5)]">
            {/* Ambient glow blobs — the panel's "AI" atmosphere */}
            <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-violet-500/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />

            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90 ring-1 ring-white/15">
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.05, 0.9] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  className="flex"
                >
                  <SparkleIcon size={12} weight="fill" className="text-violet-300" />
                </motion.span>
                AI suggestions
              </span>

              {!dataReady ? (
                <div className="mt-4 space-y-2">
                  <motion.div
                    animate={{ opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                    className="h-4 w-3/4 rounded bg-white/15"
                  />
                  <motion.div
                    animate={{ opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
                    className="mt-3 h-14 w-full rounded-xl bg-white/10"
                  />
                  <motion.div
                    animate={{ opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                    className="h-14 w-full rounded-xl bg-white/10"
                  />
                </div>
              ) : briefing.length === 0 ? (
                <>
                  <p className="mt-3 font-display text-lg font-semibold tracking-tight text-white">
                    Everything looks on track.
                  </p>
                  <p className="mt-1 text-xs text-white/60">No overdue rent or unread maintenance requests right now — I'll flag it here the moment something needs you.</p>
                </>
              ) : (
                <>
                  <p className="mt-3 font-display text-lg font-semibold tracking-tight text-white">
                    Here's what I'd tackle first.
                  </p>
                  <p className="mt-1 text-xs text-white/60">Based on what's happening across your property right now.</p>
                </>
              )}

              {briefing.length > 0 && (
                <div className="mt-4 space-y-2">
                  {briefing.map((item, i) => (
                    <SuggestionCard key={item.to} item={item} index={i} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Online payments balance */}
          <div className="rounded-lg border border-line bg-paper p-5">
            <SectionLabel>Online payments balance</SectionLabel>
            {!dataReady ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="mt-2 h-8 w-full rounded-lg" />
              </div>
            ) : payout ? (
              <>
                <p className="mt-2 font-display text-base font-semibold text-ink">{payout.status}</p>
                <p className="mt-1 text-xs text-muted">{payout.amount} collected via mobile money, ready to transfer to your bank.</p>
                <p className="mt-3 text-sm font-medium text-ink">{payout.date}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPayoutOpen(true)}
                  className="mt-4 block w-full bg-mist text-center hover:bg-line/40"
                >
                  View balance
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <WalletIcon size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">Nothing to transfer yet</p>
                  <p className="mt-0.5 text-xs text-muted">Rent paid online through your payment link will show up here.</p>
                </div>
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
            onEdit={() => navigate(`/tenants/${payingTenant.id}/edit`)}
            onMoveOut={() => setMovingOutTenant(payingTenant)}
          />
        )}
        {paymentStep === "confirm" && payingTenant && (
          <LogPaymentModal
            tenantName={payingTenant.name}
            room={`${payingTenant.room} · ${payingTenant.roomType}`}
            outstanding={payingTenant.owedAmount || payingTenant.rentAmount}
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
        {payoutOpen && payout && <PayoutDetailDrawer payout={payout} onClose={() => setPayoutOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
