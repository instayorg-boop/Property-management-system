import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/PageHeader";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import TenantPaymentDrawer from "../components/TenantPaymentDrawer";
import GenerateInvoicesOverlay from "../components/GenerateInvoicesOverlay";
import TenantFormDrawer from "../components/TenantFormDrawer";
import MoveOutModal from "../components/MoveOutModal";
import { useTenants, formatCurrency, type PaymentStatus, type Tenant } from "../TenantsContext";
import { useRoomTypeRent } from "../RoomsContext";
import { useSettings } from "../SettingsContext";
import { calcTotalOwed } from "../invoiceUtils";
import { LinkSimple, MagnifyingGlass, Plus, CaretLeft, CaretRight, Receipt } from "@phosphor-icons/react";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import MetricCard from "../components/MetricCard";

function LinkIcon() {
  return <LinkSimple size={14} weight="bold" />;
}

function SearchIcon() {
  return <MagnifyingGlass size={16} weight="bold" />;
}

function PlusIcon() {
  return <Plus size={14} weight="bold" />;
}

const filters = ["All", "Paid", "Overdue", "Unpaid", "Partial"] as const;

/** The count carries the status color on its own — no badge chip behind it, so the tab reads the
 * same whether it's selected or not (a chip on a dark selected tab just goes muddy). */
const filterCountColor: Record<(typeof filters)[number], string> = {
  All: "text-muted",
  Paid: "text-emerald-600",
  Overdue: "text-red-600",
  Unpaid: "text-slate-500",
  Partial: "text-amber-600",
};

const statusStyle: Record<PaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-600",
};

const statusLabel: Record<PaymentStatus, string> = {
  paid: "Paid",
  overdue: "Overdue",
  unpaid: "Unpaid",
  partial: "Partial",
};

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** This tenant's rent is a set, contracted figure — only worth calling out against the room type's
 * rate when it's a discount. A rent above the room type rate isn't a "rate" concept (multi-month
 * payments are a different thing, handled by the Amount paid column), so it gets no comparison. */
function rentDiscountNote(t: Tenant, roomTypeRent: Record<string, number>) {
  const typeRate = roomTypeRent[t.roomType];
  const discount = typeRate - t.rentAmount;
  if (discount <= 0) return null;
  return `${formatCurrency(t.rentAmount)}/mo · ${formatCurrency(discount)} discount off ${formatCurrency(typeRate)}`;
}

/** Money actually received for this billing period — never the amount due, so Overdue/Unpaid rows
 * truthfully show K0 rather than implying a payment that didn't happen. */
function amountPaidThisMonth(t: Tenant) {
  if (t.status === "paid") return t.rentAmount;
  if (t.status === "partial") return t.ledger[0]?.paidAmount ?? 0;
  return 0;
}

/** Overdue and unpaid are equally urgent — same rank, same red bucket in the summary line. */
const urgencyRank: Record<PaymentStatus, number> = { overdue: 0, unpaid: 0, partial: 1, paid: 2 };

/** The pill's amount is the tenant's true total owed — carried-over arrears plus accrued late fees,
 * from the same calcTotalOwed used for invoicing — never just this month's shortfall. */
function statusPillText(t: Tenant, dailyPenaltyRate: number) {
  if (t.status === "paid") return "Paid";
  const totalOwed = calcTotalOwed(t, dailyPenaltyRate);
  if (t.status === "overdue") return `Overdue${t.daysOverdue ? ` · ${t.daysOverdue}d` : ""} — ${formatCurrency(totalOwed)} owed`;
  if (t.status === "unpaid") return `Unpaid — ${formatCurrency(totalOwed)} owed`;
  return `Partial · ${formatCurrency(totalOwed)} left`;
}

type PaymentStep = "search" | "ledger" | "confirm";

export default function Rent() {
  const { tenants, logPayment, moveOutTenant, isReady: tenantsReady } = useTenants();
  const { invoicesOn, collectionTargetPct, dailyPenaltyRate } = useSettings();
  const roomTypeRent = useRoomTypeRent();
  const location = useLocation();
  const navigate = useNavigate();

  const [monthOffset, setMonthOffset] = useState(0);
  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const month = monthLabel(monthDate);

  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [linkCopied, setLinkCopied] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [paymentStep, setPaymentStep] = useState<PaymentStep | null>(null);
  const [payingTenant, setPayingTenant] = useState<Tenant | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [movingOutTenant, setMovingOutTenant] = useState<Tenant | null>(null);

  const activeTenants = useMemo(() => tenants.filter((t) => t.active), [tenants]);

  // Arriving from the Dashboard (recent payments / briefing) or the Rooms page — open that
  // tenant's ledger directly, then drop the nav state so back/refresh doesn't reopen it.
  useEffect(() => {
    const openId = (location.state as { openTenantId?: string } | null)?.openTenantId;
    if (openId) {
      const tenant = tenants.find((t) => t.id === openId);
      if (tenant) {
        setPayingTenant(tenant);
        setPaymentStep("ledger");
      }
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const filtered = useMemo(() => {
    return activeTenants
      .filter((t) => filter === "All" || statusLabel[t.status] === filter)
      .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => urgencyRank[a.status] - urgencyRank[b.status]);
  }, [activeTenants, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Per-filter counts, independent of the search box — shown as a badge on each filter tab.
  const filterCounts = useMemo(() => {
    return {
      All: activeTenants.length,
      Paid: activeTenants.filter((t) => t.status === "paid").length,
      Overdue: activeTenants.filter((t) => t.status === "overdue").length,
      Unpaid: activeTenants.filter((t) => t.status === "unpaid").length,
      Partial: activeTenants.filter((t) => t.status === "partial").length,
    } as Record<(typeof filters)[number], number>;
  }, [activeTenants]);

  const stats = useMemo(() => {
    const totalExpected = activeTenants.reduce((sum, t) => sum + t.rentAmount, 0);

    const collectedTotal = activeTenants.reduce((sum, t) => {
      if (t.status === "paid") return sum + t.rentAmount;
      if (t.status === "partial") {
        const paidPortion = t.ledger[0]?.paidAmount ?? 0;
        return sum + paidPortion;
      }
      return sum;
    }, 0);

    const outstanding = activeTenants.reduce((sum, t) => sum + t.owedAmount, 0);
    const delinquentCount = activeTenants.filter((t) => t.status === "overdue" || t.status === "unpaid").length;

    const collectedPct = totalExpected > 0 ? Math.round((collectedTotal / totalExpected) * 100) : 0;

    // Real prior-month comparison from ledger timestamps — no fabricated benchmark. `null` when
    // there's nothing recorded last month to compare against, so the UI can just omit the line.
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let lastMonthCollected = 0;
    let hasLastMonthData = false;
    for (const t of activeTenants) {
      for (const row of t.ledger) {
        if (!row.createdAt) continue;
        const created = new Date(row.createdAt);
        if (created >= lastMonthStart && created < thisMonthStart && (row.status === "paid" || row.status === "partial")) {
          hasLastMonthData = true;
          lastMonthCollected += row.status === "partial" ? (row.paidAmount ?? 0) : row.amount;
        }
      }
    }
    const trend =
      hasLastMonthData && lastMonthCollected > 0 ? Math.round(((collectedTotal - lastMonthCollected) / lastMonthCollected) * 1000) / 10 : null;

    const outstandingSeverity: "none" | "moderate" | "high" =
      outstanding === 0 ? "none" : delinquentCount >= 3 ? "high" : "moderate";

    return { totalExpected, collectedTotal, outstanding, delinquentCount, collectedPct, trend, outstandingSeverity };
  }, [activeTenants]);

  const copyLink = () => {
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1500);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2000);
  };

  return (
    <>
      <PageHeader title="Rent" />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
        {invoiceMode ? (
          <motion.div
            key="invoice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          >
            <GenerateInvoicesOverlay
              periodDate={monthDate}
              periodLabel={month}
              onCancel={() => setInvoiceMode(false)}
              onSent={(count) => {
                showToast(`Invoices sent to ${count} tenant${count === 1 ? "" : "s"}`);
                setInvoiceMode(false);
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="rent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            className="space-y-5"
          >
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-paper px-1.5 py-1">
            <button
              type="button"
              onClick={() => setMonthOffset((o) => o - 1)}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
            >
              <CaretLeft size={14} weight="bold" />
            </button>
            <span className="w-36 text-center text-sm font-medium text-ink">{month}</span>
            <button
              type="button"
              onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
              disabled={monthOffset === 0}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <CaretRight size={14} weight="bold" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {invoicesOn && (
              <button
                type="button"
                onClick={() => setInvoiceMode(true)}
                className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
              >
                <Receipt size={14} weight="bold" />
                Generate invoices
              </button>
            )}
            <button
              type="button"
              onClick={copyLink}
              className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
            >
              <LinkIcon />
              {linkCopied ? "Link copied" : "Share payment link"}
            </button>
            <button
              type="button"
              onClick={() => setPaymentStep("search")}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
            >
              <PlusIcon />
              Log payment
            </button>
          </div>
        </div>

        {/* Stat cards — card chrome renders immediately; only the figures inside shimmer while loading. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!tenantsReady ? (
            <>
              <div className="rounded-lg border border-line bg-paper p-4">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-2 h-7 w-24" />
              </div>
              <div className="rounded-lg border border-line bg-paper p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-7 w-24" />
              </div>
              <div className="rounded-lg border border-line bg-paper p-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-2 h-7 w-24" />
              </div>
              <div className="rounded-lg border border-line bg-paper p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-7 w-16" />
              </div>
            </>
          ) : (
            <>
              <MetricCard
                label="Total expected rent"
                value={formatCurrency(stats.totalExpected)}
                caption={`Target for ${month}`}
              />

              <MetricCard
                label="Rent collected"
                value={formatCurrency(stats.collectedTotal)}
                tone="success"
                insight={
                  <span className="flex w-full items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-100">
                      <span
                        className="block h-full rounded-full bg-emerald-500 transition-[width]"
                        style={{ width: `${Math.min(100, stats.collectedPct)}%` }}
                      />
                    </span>
                  </span>
                }
                caption={`${stats.collectedPct}% of target collected`}
              />

              <MetricCard
                label="Still owed"
                value={formatCurrency(stats.outstanding)}
                tone={stats.outstandingSeverity === "none" ? "success" : stats.outstandingSeverity === "moderate" ? "warning" : "danger"}
                insight={stats.outstandingSeverity === "none" ? "All paid up" : "Needs follow-up"}
                caption={
                  stats.outstandingSeverity === "none"
                    ? "Every active tenant is paid up"
                    : `${stats.delinquentCount} tenant${stats.delinquentCount === 1 ? "" : "s"} behind on rent`
                }
              />

              <MetricCard
                label="Collection rate"
                value={`${stats.collectedPct}%`}
                trend={stats.trend !== null ? { direction: stats.trend >= 0 ? "up" : "down", value: `${stats.trend >= 0 ? "+" : ""}${stats.trend}%` } : undefined}
                insight={stats.trend === null ? undefined : stats.trend >= 0 ? "Ahead of last month" : "Behind last month"}
                caption={`Goal is ${collectionTargetPct}%`}
              />
            </>
          )}
        </div>

        {/* Search + filter tabs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Borderless until focused — the field only asserts itself once you're typing in it */}
          <div className="flex items-center gap-2.5 rounded-md bg-mist px-3.5 py-2.5 transition-colors focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand/25 sm:w-64">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search tenant or room"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>

          {/* Segmented control — the selected pill slides between tabs rather than blinking on/off */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="inline-flex gap-0.5 rounded-md bg-mist p-1">
              {filters.map((f) => {
                const active = filter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFilter(f);
                      setPage(1);
                    }}
                    className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      active ? "text-ink" : "text-muted hover:text-ink"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="rent-filter-pill"
                        transition={{ type: "spring", stiffness: 480, damping: 38 }}
                        className="absolute inset-0 rounded-md bg-paper shadow-sm"
                      />
                    )}
                    <span className="relative">{f}</span>
                    {/* Always colored — the mix reads at a glance without selecting anything */}
                    <span className={`relative text-xs font-semibold tabular-nums ${filterCountColor[f]}`}>{filterCounts[f]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tenant table */}
        <div className="rounded-lg border border-line">
          {/* Mobile: cards — an HTML table doesn't have room to breathe on a phone screen */}
          <div className="divide-y divide-line md:hidden">
            {!tenantsReady &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            {tenantsReady && pageRows.map((t) => {
              const needsAction = t.status !== "paid";
              const discountNote = rentDiscountNote(t, roomTypeRent);
              const paidThisMonth = amountPaidThisMonth(t);
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setPayingTenant(t);
                    setPaymentStep("ledger");
                  }}
                  className={`p-4 transition-colors active:bg-mist ${needsAction ? "bg-slate-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{t.room}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                      {statusPillText(t, dailyPenaltyRate)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                    <div>
                      <p className="text-xs text-ink">{t.roomType}</p>
                      {discountNote ? (
                        <p className="text-xs text-amber-600">{discountNote}</p>
                      ) : (
                        <p className="text-xs text-muted">{formatCurrency(t.rentAmount)}/mo</p>
                      )}
                      <p className={`mt-0.5 text-sm ${paidThisMonth === 0 ? "font-normal text-muted" : "font-medium text-ink"}`}>
                        {formatCurrency(paidThisMonth)} paid
                      </p>
                    </div>
                    {needsAction ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPayingTenant(t);
                          setPaymentStep("confirm");
                        }}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-paper"
                      >
                        Log payment
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPayingTenant(t);
                          setPaymentStep("ledger");
                        }}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {tenantsReady && pageRows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <Receipt size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {activeTenants.length === 0 ? "No tenants yet" : "No tenants match this filter"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {activeTenants.length === 0
                      ? "Add a tenant to start tracking rent payments."
                      : "Try a different search or status filter."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Desktop / tablet: table */}
          <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Tenant</th>
                <th className="px-4 py-3 font-medium">Room type</th>
                <th className="px-4 py-3 font-medium">Amount paid</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {!tenantsReady && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
              {tenantsReady && pageRows.map((t) => {
                const needsAction = t.status !== "paid";
                const discountNote = rentDiscountNote(t, roomTypeRent);
                const paidThisMonth = amountPaidThisMonth(t);
                return (
                  <tr
                    key={t.id}
                    className={`cursor-pointer border-t border-line transition-colors hover:bg-mist ${needsAction ? "bg-slate-50" : ""}`}
                    onClick={() => {
                      setPayingTenant(t);
                      setPaymentStep("ledger");
                    }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{t.name}</p>
                      <p className="text-xs text-muted">{t.room}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{t.roomType}</p>
                      {discountNote ? (
                        <p className="text-xs text-amber-600">{discountNote}</p>
                      ) : (
                        <p className="text-xs text-muted">{formatCurrency(t.rentAmount)}/mo</p>
                      )}
                    </td>
                    <td className={`px-4 py-3 ${paidThisMonth === 0 ? "font-normal text-muted" : "font-medium text-ink"}`}>
                      {formatCurrency(paidThisMonth)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                        {statusPillText(t, dailyPenaltyRate)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {needsAction ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPayingTenant(t);
                            setPaymentStep("confirm");
                          }}
                          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-paper"
                        >
                          Log payment
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPayingTenant(t);
                            setPaymentStep("ledger");
                          }}
                          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {tenantsReady && pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                        <Receipt size={22} weight="duotone" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-ink">
                          {activeTenants.length === 0 ? "No tenants yet" : "No tenants match this filter"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {activeTenants.length === 0
                            ? "Add a tenant to start tracking rent payments."
                            : "Try a different search or status filter."}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          {filtered.length > 0 && (
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              pageSize={rowsPerPage}
              totalItems={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setRowsPerPage(size);
                setPage(1);
              }}
            />
          )}
        </div>

          </motion.div>
        )}
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
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper shadow-card"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
