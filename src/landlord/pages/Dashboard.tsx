import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import TenantPaymentDrawer from "../components/TenantPaymentDrawer";
import MoveOutModal from "../components/MoveOutModal";
import ExpenseFormDrawer from "../components/ExpenseFormDrawer";
import { type UpcomingPayout } from "../components/PayoutDetailDrawer";
import { Skeleton } from "../components/Skeleton";
import { useTenants, useCollectedRent, formatCurrency, type Tenant } from "../TenantsContext";
import { useNotifications } from "../NotificationsContext";
import { useRoomsView } from "../RoomsContext";
import { useSettings } from "../SettingsContext";
import { getLencoBalance } from "../../lib/payoutApi";
import { supabase } from "../../lib/supabaseClient";
import { calcTotalOwed } from "../invoiceUtils";
import TodaysTasks from "../components/TodaysTasks";
import ExpensesBreakdownCard from "../components/ExpensesBreakdownCard";
import {
  ArrowRight as ArrowIcon,
  CheckCircle as CheckCircleIcon,
  Money as CashIcon,
  Receipt as ReceiptIcon,
  UserPlus as UserPlusIcon,
  Plus as PlusIcon,
  DoorOpen as DoorIcon,
  Coins,
  Wallet as WalletIcon,
  DotsThreeVertical,
  CaretRightIcon,

} from "@phosphor-icons/react";
import SectionLabel from "../components/SectionLabel";
import SetupChecklist from "../components/SetupChecklist";
import Button from "../components/Button";
import ActivityRow from "../components/ActivityRow";
import DashboardTabs from "../components/DashboardTabs";
import { Bell } from "lucide-react";

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
    <div className="flex flex-wrap items-center justify-between gap-4 bg-white  px-4 pt-5 pb-6 sm:px-8">
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

type PaymentStep = "search" | "ledger" | "confirm";

export default function Dashboard() {
  const { tenants, logPayments, moveOutTenant, isReady: tenantsReady } = useTenants();
  const rooms = useRoomsView();
  const { lencoConnected, bankName, accountNumber, propertyId, isReady: settingsReady } = useSettings();
  const totalCollected = useCollectedRent();
  const navigate = useNavigate();
  const dataReady = tenantsReady && settingsReady;

  const roomsOccupied = useMemo(
    () => ({ occupied: rooms.filter((r) => r.status === "occupied").length, total: rooms.length }),
    [rooms]
  );

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

  const { notifications, isReady: notificationsReady, markRead: markNotificationRead } = useNotifications();
  const recentActivity = useMemo(() => notifications.slice(0, 7), [notifications]);


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
      <DashboardTabs />
      <Greeting propertyId={propertyId} onAction={handleAction} />

      {/* Left and right columns are two independent stacks within one grid row, so each side's
          own content determines its own height — no column is ever stretched or gapped to match
          the other's height. */}
      <div className="grid grid-cols-1 items-start gap-4 px-4 sm:px-8 pb-10 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Overview snapshot — first three stats as plain tiles */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {!dataReady ? (
              <div className="rounded-lg border border-line bg-paper p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2.5 h-6 w-28" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/rent")}
                className="rounded-lg border border-line bg-paper p-4 text-left transition-colors hover:border-ink/20 hover:bg-mist/40"
              >
                <p className="text-sm text-muted">Total collected</p>
                <p className="font-display mt-1.5 text-2xl font-semibold tracking-tight text-emerald-600">
                  K{totalCollected.toLocaleString()}
                </p>
              </button>
            )}
            {!dataReady ? (
              <div className="rounded-lg border border-line bg-paper p-4">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-2.5 h-6 w-28" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/rent")}
                className="rounded-lg border border-line bg-paper p-4 text-left transition-colors hover:border-ink/20 hover:bg-mist/40"
              >
                <p className="text-sm text-muted">Outstanding balance</p>
                <p className={`font-display mt-1.5 text-2xl font-semibold tracking-tight ${outstanding.total > 0 ? "text-red-700" : "text-emerald-600"}`}>
                  K{outstanding.total.toLocaleString()}
                </p>
              </button>
            )}
            {!dataReady ? (
              <div className="rounded-lg border border-line bg-paper p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2.5 h-6 w-20" />
              </div>
            ) : roomsOccupied.total > 0 ? (
              <button
                type="button"
                onClick={() => navigate("/rooms")}
                className="rounded-lg border border-line bg-paper p-4 text-left transition-colors hover:border-ink/20 hover:bg-mist/40"
              >
                <p className="text-sm text-muted">Rooms occupied</p>
                <p className="font-display mt-1.5 text-2xl font-semibold tracking-tight text-ink">
                  {roomsOccupied.occupied} / {roomsOccupied.total}
                </p>
              </button>
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
          </div>

          {dataReady && <SetupChecklist />}

          {/* Today's tasks. The list is decided by the database (detect_* + sync_tasks); Gemini
              only rewords titles, so nothing here is a model's opinion about what matters. This
              replaces the old dashboard-tasks card, which asked an LLM to invent the whole list
              fresh on every dashboard load. */}
          <TodaysTasks propertyId={propertyId} />

          {/* Recent activity */}
          <div className="border border-gray-200 p-4 rounded-lg">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <p className="text-xl font-semibold font-display tracking-tight text-ink">
                  Recent activity
                </p>

                {recentActivity.length > 0 && (
                  <span className="rounded-md bg-mist px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {recentActivity.length}
                  </span>
                )}
              </div>

              <Link
                to="/notifications"
                className="
        flex
        items-center
        gap-1
        text-sm
        font-medium
        text-muted
        transition-colors
        hover:text-ink
      "
              >
                View all activity
                <CaretRightIcon size={12} />
              </Link>
            </div>

            {/* Activity feed */}
            <div className="mt-3">
              {!notificationsReady ? (
                <div className="divide-y divide-line/70">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 py-4"
                    >
                      <Skeleton className="h-2.5 w-10 shrink-0" />

                      <div className="min-w-0 flex-1">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="mt-2 h-2.5 w-1/3" />
                      </div>

                      <Skeleton className="h-6 w-6 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <div
                  className="
          flex
          flex-col
          items-center
          justify-center
          border-y
          border-line/70
          py-12
          text-center
        "
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-mist">
                    <Bell size={17} className="text-muted" />
                  </div>

                  <p className="text-[13px] font-medium text-ink">
                    No recent activity
                  </p>

                  <p className="mt-1 text-[11px] text-muted">
                    Updates from your property will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line/70">
                  {recentActivity.map((n) => (
                    <ActivityRow key={n.id} notification={n} tenants={tenants} onMarkRead={markNotificationRead} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Online payments balance — a wallet-card treatment (icon + title header, a distinct
              shaded balance panel, one full-width primary action) rather than a plain stat tile,
              since this is the one number on the page that's actually sitting in a payment
              gateway, ready to be moved, not just a reporting figure. */}
          <div className="rounded-lg border border-line bg-paper p-4">
          

                <p className="text-xl text-center text-blue-800 font-semibold font-display tracking-tight ">Online payments</p>
            

            {!dataReady ? (
              <div className="mt-4 space-y-2 rounded-xl bg-mist p-5">
                <Skeleton className="mx-auto h-3 w-24" />
                <Skeleton className="mx-auto h-8 w-32" />
                <Skeleton className="mx-auto h-3 w-28" />
                <Skeleton className="mt-3 h-10 w-full rounded-full" />
              </div>
            ) : payout ? (
              <div className="mt-4 rounded-xl bg-mist p-5 text-center">
                <p className="text-xs font-medium text-muted">Your balance</p>

                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-paper">
                    <Coins size={12} weight="fill" />
                  </span>
                  <p className="font-display text-[28px] leading-none font-bold tracking-tight text-ink">
                    {payout.amount}
                  </p>
                </div>

                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircleIcon size={11} weight="fill" />
                  {payout.status}
                </p>

                <Button
                  variant="primary"
                  onClick={() => navigate("/online-payments")}
                  className="mt-5 flex w-full items-center justify-center gap-1.5"
                >
                  Transfer to bank
                  <ArrowIcon size={14} weight="bold" />
                </Button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl bg-mist p-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper text-muted">
                  <Coins size={22} weight="duotone" />
                </span>
                <p className="text-sm font-semibold text-ink">Nothing to transfer yet</p>
                <p className="max-w-[220px] text-xs text-muted">
                  Rent collected automatically will show up here.
                </p>
              </div>
            )}
          </div>

          {/* Expenses this month — a donut broken down by category, replacing the old
              maintenance-inbox preview (maintenance requests already have their own dashboard
              entry point via Recent activity / the sidebar). */}
          <ExpensesBreakdownCard />
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
