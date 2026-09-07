import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import TenantPaymentDrawer from "../components/TenantPaymentDrawer";
import TenantFormDrawer from "../components/TenantFormDrawer";
import MoveOutModal from "../components/MoveOutModal";
import ExpenseFormDrawer from "../components/ExpenseFormDrawer";
import PayoutDetailDrawer, { type UpcomingPayout } from "../components/PayoutDetailDrawer";
import Select, { type SelectOption } from "../components/Select";
import SlideOver from "../components/SlideOver";
import { Skeleton } from "../components/Skeleton";
import { useTenants, useCollectedRent, formatCurrency, type Tenant } from "../TenantsContext";
import { useMaintenance } from "../MaintenanceContext";
import { useRoomsView } from "../RoomsContext";
import { useSettings } from "../SettingsContext";
import { useExpenses } from "../ExpensesContext";
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
} from "@phosphor-icons/react";
import MetricCard from "../components/MetricCard";
import SectionLabel from "../components/SectionLabel";

type QuickAction = "log-payment" | "add-expense" | "add-tenant";

const quickActions: { label: string; action: QuickAction; Icon: typeof CashIcon }[] = [
  { label: "Log payment", action: "log-payment", Icon: CashIcon },
  { label: "Add expense", action: "add-expense", Icon: ReceiptIcon },
  { label: "Add tenant", action: "add-tenant", Icon: UserPlusIcon },
];

function Greeting({ name, onAction }: { name: string; onAction: (action: QuickAction) => void }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

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
      </div>

      {/* Desktop: full quick-action row */}
      <div className="hidden gap-2 sm:flex">
        {quickActions.map(({ label, action, Icon }, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onAction(action)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-transform hover:scale-[1.02] ${
              i === 0 ? "bg-brand text-paper" : "border border-line text-ink hover:bg-mist"
            }`}
          >
            <Icon size={14} weight="bold" />
            {label}
          </button>
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

const toneDot = { red: "bg-red-400", amber: "bg-amber-400" };

// How many briefing items show inline before the rest move behind "View all" — keeps the card
// from growing to fit an unbounded list.
const BRIEFING_VISIBLE_LIMIT = 3;

type BriefingItem = { label: string; detail: string; tone: "red" | "amber"; to: string; tenantId?: string; reportId?: string };

function BriefingRow({ item }: { item: BriefingItem }) {
  const state = item.reportId ? { openReportId: item.reportId } : item.tenantId ? { openTenantId: item.tenantId } : undefined;
  return (
    <Link
      to={item.to}
      state={state}
      className="flex items-center justify-between gap-2 rounded-lg border border-line/70 bg-paper px-3 py-2.5 transition-all hover:border-brand/30 hover:shadow-md"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[item.tone]}`} />
        <span className="truncate text-xs font-medium text-ink">{item.label}</span>
      </div>
      <span className="shrink-0 text-[11px] font-medium text-muted">{item.detail}</span>
    </Link>
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
  const { tenants, logPayment, moveOutTenant, isReady: tenantsReady } = useTenants();
  const { reports } = useMaintenance();
  const rooms = useRoomsView();
  const { landlordName, managementFeeRate, lencoConnected, bankName, accountNumber, isReady: settingsReady } = useSettings();
  const { expenses } = useExpenses();
  const totalCollected = useCollectedRent();
  const navigate = useNavigate();
  const dataReady = tenantsReady && settingsReady;

  const roomsOccupied = useMemo(
    () => ({ occupied: rooms.filter((r) => r.status === "occupied").length, total: rooms.length }),
    [rooms]
  );

  // Last 12 real calendar months, built from ledger entry timestamps across every tenant —
  // replaces what used to be a hardcoded 12-month series.
  const collections = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-US", { month: "short" }), amount: 0 };
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
    return months.map(({ label, amount }) => ({ label, amount }));
  }, [tenants]);

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
  const briefing = useMemo<BriefingItem[]>(() => {
    const items: BriefingItem[] = tenants
      .filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid"))
      .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0))
      .map((t) => ({
        label: `${t.name} - ${t.room}`,
        detail: t.daysOverdue ? `${t.daysOverdue} days overdue` : "Unpaid",
        tone: "red",
        to: "/rent",
        tenantId: t.id,
      }));
    for (const r of reports.filter((r) => r.unread)) {
      items.push({ label: `Maintenance - ${r.location}`, detail: "Unread", tone: "amber", to: "/maintenance", reportId: r.id });
    }
    return items;
  }, [tenants, reports]);

  // Same net-to-owner math as the Owner Payout Statement report: gross rent collected this month,
  // minus the management fee, minus this month's logged expenses.
  const payout = useMemo<UpcomingPayout | null>(() => {
    if (totalCollected <= 0) return null;
    const now = new Date();
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const expensesTotal = expenses.filter((e) => e.date.startsWith(periodKey)).reduce((sum, e) => sum + e.amount, 0);
    const netToOwner = totalCollected - totalCollected * managementFeeRate - expensesTotal;
    return {
      amount: formatCurrency(netToOwner),
      date: `As of ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
      status: lencoConnected ? "Ready to withdraw" : "Connect a bank account to receive this",
      bankAccount: lencoConnected && bankName ? `${bankName}${accountNumber ? ` · •••• ${accountNumber.slice(-4)}` : ""}` : "Not connected",
      schedule: lencoConnected ? "Automatic via Lenco" : "Not set up yet",
    };
  }, [totalCollected, expenses, managementFeeRate, lencoConnected, bankName, accountNumber]);

  const [paymentStep, setPaymentStep] = useState<PaymentStep | null>(null);
  const [payingTenant, setPayingTenant] = useState<Tenant | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [movingOutTenant, setMovingOutTenant] = useState<Tenant | null>(null);
  const [addingTenant, setAddingTenant] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [collectionRange, setCollectionRange] = useState("6");
  const [briefingDrawerOpen, setBriefingDrawerOpen] = useState(false);

  // Unread maintenance reports — hide the whole card when empty.
  const unreadMaintenance = useMemo(() => reports.filter((r) => r.unread).slice(0, 5), [reports]);

  const outstanding = useMemo(() => {
    const behind = tenants.filter((t) => t.active && (t.status === "overdue" || t.status === "unpaid" || t.status === "partial"));
    const total = behind.reduce((sum, t) => sum + t.owedAmount, 0);
    return { total, count: behind.length };
  }, [tenants]);

  const handleAction = (action: QuickAction) => {
    if (action === "log-payment") setPaymentStep("search");
    if (action === "add-tenant") setAddingTenant(true);
    if (action === "add-expense") setAddingExpense(true);
  };

  return (
    <>
      <Greeting name={landlordName} onAction={handleAction} />

      <div className="grid grid-cols-1 gap-4 px-4 sm:px-8 pb-10 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Stat cards — card chrome renders immediately; only the figures inside shimmer while loading. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {!dataReady ? (
              <div className="rounded-lg border border-line bg-paper p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-28" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ) : (
              <MetricCard
                label="Total collected"
                value={`K${totalCollected.toLocaleString()}`}
                insight={totalCollected > 0 ? "Trending up this month" : "No payments yet"}
                caption={totalCollected > 0 ? "Compared to last month" : "Logged payments will show up here"}
              />
            )}
            {!dataReady ? (
              <div className="rounded-lg border border-line bg-paper p-5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-3 h-7 w-28" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
            ) : (
              <MetricCard
                label="Outstanding balance"
                value={`K${outstanding.total.toLocaleString()}`}
                tone={outstanding.total > 0 ? "danger" : "success"}
                insight={outstanding.total > 0 ? "Needs your attention" : "Nothing outstanding"}
                caption={
                  outstanding.total > 0
                    ? `${outstanding.count} tenant${outstanding.count === 1 ? "" : "s"} behind on rent`
                    : "Every active tenant is paid up"
                }
              />
            )}
            {!dataReady ? (
              <div className="rounded-lg border border-line bg-paper p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-20" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            ) : roomsOccupied.total > 0 ? (
              <MetricCard
                label="Rooms occupied"
                value={`${roomsOccupied.occupied} / ${roomsOccupied.total}`}
                tone={roomsOccupied.occupied === roomsOccupied.total ? "success" : "default"}
                insight={roomsOccupied.occupied === roomsOccupied.total ? "Fully occupied" : "Room to grow"}
                caption={`${roomsOccupied.total - roomsOccupied.occupied} room${roomsOccupied.total - roomsOccupied.occupied === 1 ? "" : "s"} empty`}
              />
            ) : (
              <div className="rounded-lg border border-line bg-paper p-5">
                <p className="text-[13px] font-semibold text-ink/70">Rooms occupied</p>
                <div className="mt-3 flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                    <DoorIcon size={16} weight="duotone" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">No rooms yet</p>
                    <p className="text-[11px] text-muted">Add a room to get started</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Collections chart */}
          <div className="rounded-lg border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Collections</p>
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
                  <p className="text-xs font-semibold text-ink">No collections yet</p>
                  <p className="mt-0.5 text-xs text-muted">Logged payments will show up here month by month.</p>
                </div>
              </div>
            ) : (() => {
              const visibleCollections = collections.slice(-Number(collectionRange));
              const maxAmount = Math.max(...visibleCollections.map((m) => m.amount));
              const chartMax = Math.ceil(maxAmount / 50000) * 50000;
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
                      {visibleCollections.map((m, i) => (
                        <motion.div
                          key={`${collectionRange}-${m.label}`}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 12 }}
                          transition={{ duration: 0.25, delay: i * 0.04 }}
                          className="relative flex h-full flex-1 flex-col items-center justify-end gap-2"
                        >
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.04 + 0.35, duration: 0.2 }}
                            className="text-[11px] font-medium text-ink"
                          >
                            K{(m.amount / 1000).toFixed(0)}k
                          </motion.span>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${(m.amount / chartMax) * 100}%` }}
                            transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                            className={`w-full rounded-md ${i === visibleCollections.length - 1 ? "bg-brand" : "bg-ink/15"}`}
                          />
                          <span className="absolute -bottom-6 text-[11px] text-muted">{m.label}</span>
                        </motion.div>
                      ))}
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
                      className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                    >
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-mist text-[10px] font-semibold text-muted">
                            {p.tenant.split(" ").map((s) => s[0]).join("")}
                          </div>
                          <div>
                            <p className="font-medium text-ink">{p.tenant}</p>
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
          {/* Today's briefing */}
          <div className="relative overflow-hidden rounded-lg border border-brand/20 bg-linear-to-br from-brand-soft via-brand-soft/70 to-paper p-5 ">

            <div className="relative">
              <span className="inline-flex items-center rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-paper">
                Today&apos;s briefing
              </span>
              {!dataReady ? (
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ) : briefing.length === 0 ? (
                <>
                  <p className="mt-3 font-display text-lg font-semibold tracking-tight text-ink">
                    Nothing needs your attention
                  </p>
                  <p className="mt-1 text-xs text-muted">Overdue rent, unread maintenance requests, and leases ending soon will show up here.</p>
                </>
              ) : (
                <>
                  <p className="mt-3 font-display text-lg font-semibold tracking-tight text-ink">
                    {briefing.length} thing{briefing.length === 1 ? "" : "s"} need{briefing.length === 1 ? "s" : ""} your attention
                  </p>
                  <p className="mt-1 text-xs text-muted">Overdue rent, an unread maintenance request, and a lease ending soon.</p>
                </>
              )}

              <div className="mt-4 space-y-2">
                {briefing.slice(0, BRIEFING_VISIBLE_LIMIT).map((item) => (
                  <BriefingRow key={item.label} item={item} />
                ))}
              </div>

              {briefing.length > BRIEFING_VISIBLE_LIMIT && (
                <button
                  type="button"
                  onClick={() => setBriefingDrawerOpen(true)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-brand hover:bg-paper/60"
                >
                  View all {briefing.length}
                  <ArrowIcon size={14} weight="bold" />
                </button>
              )}
            </div>
          </div>

          {/* Upcoming payout */}
          <div className="rounded-lg border border-line bg-paper p-5">
            <SectionLabel>Your next payout</SectionLabel>
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
                <p className="mt-1 text-xs text-muted">{payout.amount} will be paid into your bank account.</p>
                <p className="mt-3 text-sm font-medium text-ink">{payout.date}</p>
                <button
                  type="button"
                  onClick={() => setPayoutOpen(true)}
                  className="mt-4 block w-full rounded-lg bg-mist py-2 text-center text-xs font-medium text-ink transition-colors hover:bg-line/40"
                >
                  See payout details
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <WalletIcon size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">No payout scheduled</p>
                  <p className="mt-0.5 text-xs text-muted">Once you start collecting rent, your next payout will appear here.</p>
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
            onEdit={() => setEditingTenant(payingTenant)}
            onMoveOut={() => setMovingOutTenant(payingTenant)}
          />
        )}
        {paymentStep === "confirm" && payingTenant && (
          <LogPaymentModal
            tenantName={payingTenant.name}
            room={`${payingTenant.room} · ${payingTenant.roomType}`}
            outstanding={payingTenant.owedAmount || payingTenant.rentAmount}
            onClose={() => setPaymentStep("ledger")}
            onConfirm={() => {
              logPayment(payingTenant.id, payingTenant.owedAmount || payingTenant.rentAmount);
              setPaymentStep(null);
              setPayingTenant(null);
            }}
          />
        )}
        {editingTenant && <TenantFormDrawer editing={editingTenant} onClose={() => setEditingTenant(null)} />}
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

        {addingTenant && <TenantFormDrawer editing={null} onClose={() => setAddingTenant(false)} />}
        {addingExpense && <ExpenseFormDrawer editing={null} onClose={() => setAddingExpense(false)} />}
        {payoutOpen && payout && <PayoutDetailDrawer payout={payout} onClose={() => setPayoutOpen(false)} />}
        {briefingDrawerOpen && (
          <SlideOver
            onClose={() => setBriefingDrawerOpen(false)}
            title="Today's briefing"
            description={`${briefing.length} thing${briefing.length === 1 ? "" : "s"} need${briefing.length === 1 ? "s" : ""} your attention`}
          >
            <div className="space-y-2">
              {briefing.map((item) => (
                <BriefingRow key={item.label} item={item} />
              ))}
            </div>
          </SlideOver>
        )}
      </AnimatePresence>
    </>
  );
}
