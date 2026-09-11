import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "../components/PageHeader";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import TenantPaymentDrawer from "../components/TenantPaymentDrawer";
import GenerateInvoicesOverlay from "../components/GenerateInvoicesOverlay";
import MoveOutModal from "../components/MoveOutModal";
import { useTenants, formatCurrency, type PaymentStatus, type Tenant } from "../TenantsContext";
import { useRoomTypeRent } from "../RoomsContext";
import { useSettings } from "../SettingsContext";
import { calcTotalOwed } from "../invoiceUtils";
import { LinkSimple, MagnifyingGlass, Plus, Receipt, DotsThreeVertical } from "@phosphor-icons/react";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import MetricCard from "../components/MetricCard";
import Button from "../components/Button";
import MonthSwitcher from "../components/MonthSwitcher";
import { PendingSyncTag } from "../components/SyncStatus";
import { usePendingTenantIds } from "../../lib/offline/hooks";

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

/** Overdue and unpaid are equally urgent — same rank, same red bucket in the summary line. */
const urgencyRank: Record<PaymentStatus, number> = { overdue: 0, unpaid: 0, partial: 1, paid: 2 };

/** Everything the table/stats need for one tenant, resolved against the *selected* month rather
 * than always reflecting today's live state — otherwise navigating to a past month kept showing
 * this month's numbers relabelled, which is just wrong. */
type RentRow = {
  tenant: Tenant;
  status: PaymentStatus;
  amountPaid: number;
  owedAmount: number;
  /** False for a past month where nothing was ever logged — distinct from "logged and unpaid". */
  hasRecord: boolean;
};

function ledgerEntryForMonth(t: Tenant, monthDate: Date) {
  return t.ledger.find((row) => {
    if (!row.createdAt) return false;
    const d = new Date(row.createdAt);
    return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth();
  });
}

function buildRentRow(t: Tenant, monthDate: Date, isCurrentMonth: boolean): RentRow {
  if (isCurrentMonth) {
    // "Now" is the live tenant record by definition — no historical lookup needed or possible.
    const amountPaid = t.status === "paid" ? t.rentAmount : t.status === "partial" ? (t.ledger[0]?.paidAmount ?? 0) : 0;
    return { tenant: t, status: t.status, amountPaid, owedAmount: t.owedAmount, hasRecord: true };
  }
  const entry = ledgerEntryForMonth(t, monthDate);
  if (!entry) {
    // Nothing was ever recorded for this tenant in this past month — show that honestly (K0,
    // "No record") instead of falling back to their current live status.
    return { tenant: t, status: "unpaid", amountPaid: 0, owedAmount: t.rentAmount, hasRecord: false };
  }
  const status = entry.status ?? "paid";
  const amountPaid = status === "partial" ? (entry.paidAmount ?? 0) : status === "paid" ? entry.amount : 0;
  return { tenant: t, status, amountPaid, owedAmount: Math.max(0, t.rentAmount - amountPaid), hasRecord: true };
}

/** The short pill just names the state (Paid/Overdue/Unpaid/Partial) — the amount and day count
 * live in a separate, quieter caption line instead of being crammed into the pill itself, since
 * "Overdue · 12d — K1,440 owed" all in one small badge is a lot to read on every row of a table. */
function statusDetail(row: RentRow, isCurrentMonth: boolean): string | null {
  if (row.status === "paid") return null;
  if (!row.hasRecord) return "No record this month";
  if (isCurrentMonth) {
    // Live penalty accrual only makes sense against today's date, not a browsed-to past month.
    const totalOwed = calcTotalOwed(row.tenant);
    if (row.status === "overdue") return `${row.tenant.daysOverdue ? `${row.tenant.daysOverdue}d · ` : ""}${formatCurrency(totalOwed)} owed`;
    if (row.status === "unpaid") return `${formatCurrency(totalOwed)} owed`;
    return `${formatCurrency(totalOwed)} left`;
  }
  return row.status === "partial" ? `${formatCurrency(row.owedAmount)} left` : `${formatCurrency(row.owedAmount)} owed`;
}

type PaymentStep = "search" | "ledger" | "confirm";

export default function Rent() {
  const { tenants, logPayments, moveOutTenant, isReady: tenantsReady } = useTenants();
  const { invoicesOn, collectionTargetPct } = useSettings();
  const roomTypeRent = useRoomTypeRent();
  const pendingTenantIds = usePendingTenantIds();
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const [paymentStep, setPaymentStep] = useState<PaymentStep | null>(null);
  const [payingTenant, setPayingTenant] = useState<Tenant | null>(null);
  const [movingOutTenant, setMovingOutTenant] = useState<Tenant | null>(null);


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

  const isCurrentMonth = monthOffset === 0;

  // Who to show for the *selected* month — the currently-active roster for "now", or whoever was
  // actually resident during a browsed-to past month (so someone who's since moved out, or hasn't
  // moved in yet, doesn't wrongly appear in a month they weren't there for).
  const periodTenants = useMemo(() => {
    if (isCurrentMonth) return tenants.filter((t) => t.active);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    return tenants.filter((t) => {
      const moveIn = new Date(t.moveInDate);
      if (Number.isNaN(moveIn.getTime()) || moveIn > monthEnd) return false;
      if (t.moveOutDate) {
        const moveOut = new Date(t.moveOutDate);
        if (!Number.isNaN(moveOut.getTime()) && moveOut < monthStart) return false;
      }
      return true;
    });
  }, [tenants, isCurrentMonth, monthDate]);

  const rentRows = useMemo(
    () => periodTenants.map((t) => buildRentRow(t, monthDate, isCurrentMonth)),
    [periodTenants, monthDate, isCurrentMonth]
  );

  const filteredRows = useMemo(() => {
    return rentRows
      .filter((r) => filter === "All" || statusLabel[r.status] === filter)
      .filter(
        (r) => r.tenant.name.toLowerCase().includes(query.toLowerCase()) || r.tenant.room.toLowerCase().includes(query.toLowerCase())
      )
      .sort((a, b) => urgencyRank[a.status] - urgencyRank[b.status]);
  }, [rentRows, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Per-filter counts, independent of the search box — shown as a badge on each filter tab.
  const filterCounts = useMemo(() => {
    return {
      All: rentRows.length,
      Paid: rentRows.filter((r) => r.status === "paid").length,
      Overdue: rentRows.filter((r) => r.status === "overdue").length,
      Unpaid: rentRows.filter((r) => r.status === "unpaid").length,
      Partial: rentRows.filter((r) => r.status === "partial").length,
    } as Record<(typeof filters)[number], number>;
  }, [rentRows]);

  const stats = useMemo(() => {
    const totalExpected = rentRows.reduce((sum, r) => sum + r.tenant.rentAmount, 0);
    const collectedTotal = rentRows.reduce((sum, r) => sum + r.amountPaid, 0);
    const outstanding = rentRows.reduce((sum, r) => sum + r.owedAmount, 0);
    const delinquentCount = rentRows.filter((r) => r.status === "overdue" || r.status === "unpaid").length;
    const collectedPct = totalExpected > 0 ? Math.round((collectedTotal / totalExpected) * 100) : 0;

    // Real prior-month comparison from ledger timestamps — no fabricated benchmark. Only shown for
    // the current month: "vs last month" only means something when "this month" is actually now.
    let trend: number | null = null;
    if (isCurrentMonth) {
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      let lastMonthCollected = 0;
      let hasLastMonthData = false;
      for (const r of rentRows) {
        for (const row of r.tenant.ledger) {
          if (!row.createdAt) continue;
          const created = new Date(row.createdAt);
          if (created >= lastMonthStart && created < thisMonthStart && (row.status === "paid" || row.status === "partial")) {
            hasLastMonthData = true;
            lastMonthCollected += row.status === "partial" ? (row.paidAmount ?? 0) : row.amount;
          }
        }
      }
      trend = hasLastMonthData && lastMonthCollected > 0 ? Math.round(((collectedTotal - lastMonthCollected) / lastMonthCollected) * 1000) / 10 : null;
    }

    const outstandingSeverity: "none" | "moderate" | "high" =
      outstanding === 0 ? "none" : delinquentCount >= 3 ? "high" : "moderate";

    return { totalExpected, collectedTotal, outstanding, delinquentCount, collectedPct, trend, outstandingSeverity };
  }, [rentRows, isCurrentMonth]);

  const copyLink = () => {
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1500);
  };

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [moreMenuOpen]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2000);
  };

  return (
    <>
      <PageHeader title="Rent" description="Log payments and monitor who's paid, overdue, or behind." />

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
        {/* Header row — one clear primary action (Log payment); Generate invoices and Share
            payment link are occasional, not daily, so they sit in a quiet overflow menu instead
            of competing with the primary button for attention. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthSwitcher
            month={month}
            monthOffset={monthOffset}
            onPrev={() => setMonthOffset((o) => o - 1)}
            onNext={() => setMonthOffset((o) => Math.min(0, o + 1))}
            onJumpToNow={() => setMonthOffset(0)}
          />

          <div className="flex items-center gap-2">
            <div ref={moreMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={moreMenuOpen}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
              >
                <DotsThreeVertical size={16} weight="bold" />
              </button>
              {moreMenuOpen && (
                <div className="absolute top-full right-0 z-10 mt-1 w-52 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-card">
                  {invoicesOn && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setInvoiceMode(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
                    >
                      <Receipt size={15} weight="bold" />
                      Generate invoices
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={copyLink}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-mist"
                  >
                    <LinkIcon />
                    {linkCopied ? "Link copied" : "Share payment link"}
                  </button>
                </div>
              )}
            </div>
            <Button variant="primary" onClick={() => setPaymentStep("search")} className="hover:scale-[1.02]">
              <PlusIcon />
              Log payment
            </Button>
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
                insight={stats.outstandingSeverity === "none" ? "All paid up" : ""}
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

        {/* Tenant table — search + filter tabs share the same bordered card as the table below,
            not a separate floating row, matching the Tenants page's toolbar-attached-to-table look. */}
        <div className="rounded-xl border border-line bg-paper">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-line p-6 sm:flex-row sm:items-center sm:justify-between">
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
                      {/* Only the active tab's count is coloured — five permanently-coloured counts
                          sitting in a row read as noise, not information, when nothing's selected. */}
                      <span className={`relative text-xs font-semibold tabular-nums ${active ? filterCountColor[f] : "text-muted"}`}>
                        {filterCounts[f]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Mobile: cards — an HTML table doesn't have room to breathe on a phone screen */}
          <div className="divide-y divide-line md:hidden">
            {!tenantsReady &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 p-4">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            {tenantsReady && pageRows.map((row) => {
              const t = row.tenant;
              const needsAction = row.status !== "paid";
              const discountNote = rentDiscountNote(t, roomTypeRent);
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setPayingTenant(t);
                    setPaymentStep("ledger");
                  }}
                  className={`p-4 transition-colors active:bg-mist ${needsAction ? "bg-mist/50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/tenants/${t.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate text-sm font-medium text-ink hover:underline"
                      >
                        {t.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">{t.room}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[row.status]}`}>{statusLabel[row.status]}</span>
                      {statusDetail(row, isCurrentMonth) && (
                        <p className="mt-1 text-[11px] text-muted">{statusDetail(row, isCurrentMonth)}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                    <div>
                      <p className="text-xs text-ink">{t.roomType}</p>
                      {discountNote ? (
                        <p className="text-xs text-amber-600">{discountNote}</p>
                      ) : (
                        <p className="text-xs text-muted">{formatCurrency(t.rentAmount)}/mo</p>
                      )}
                      <p className={`font-display mt-0.5 text-sm ${row.amountPaid === 0 ? "font-normal text-muted" : "font-medium text-ink"}`}>
                        {formatCurrency(row.amountPaid)} paid
                      </p>
                    </div>
                    {needsAction && isCurrentMonth ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPayingTenant(t);
                          setPaymentStep("confirm");
                        }}
                        className="font-semibold text-brand underline-offset-2 hover:underline"
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
                        className="font-semibold text-ink underline-offset-2 hover:underline"
                      >
                        Details
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
                    {rentRows.length === 0 ? "No tenants this month" : "No tenants match this filter"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {rentRows.length === 0
                      ? isCurrentMonth
                        ? "Add a tenant to start tracking rent payments."
                        : "No one was resident during this month."
                      : "Try a different search or status filter."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Desktop / tablet: table — bounded height with its own scroll, so the sticky header
              has an actual scroll container to stick within (relying on the page/shell's own
              scroll container doesn't work reliably here: overflow-x-auto below implicitly
              resolves overflow-y to auto too, per the CSS spec, silently making this div its own
              non-scrolling-looking-but-still-a-container context). Same pattern as Tenants.tsx. */}
          <div className="hidden max-h-[70vh] overflow-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-line bg-paper text-[11px] text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium tracking-wide">Tenant</th>
                <th className="px-4 py-3 font-medium tracking-wide">Room type</th>
                <th className="px-4 py-3 font-medium tracking-wide whitespace-nowrap">Amount paid</th>
                <th className="px-4 py-3 font-medium tracking-wide whitespace-nowrap">Outstanding balance</th>
                <th className="px-4 py-3 font-medium tracking-wide">Status</th>
                <th className="px-4 py-3 font-medium tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!tenantsReady && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
              {tenantsReady && pageRows.map((row) => {
                const t = row.tenant;
                const needsAction = row.status !== "paid";
                return (
                  <tr
                    key={t.id}
                    className={`group cursor-pointer transition-colors duration-200 ease-in-out hover:bg-mist ${needsAction ? "bg-mist/50" : ""}`}
                    onClick={() => {
                      setPayingTenant(t);
                      setPaymentStep("ledger");
                    }}
                  >
                    <td className="px-4 py-3">
                      <Link to={`/tenants/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:underline">
                        {t.name}
                      </Link>
                      <p className="text-xs text-muted">{t.room}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/rooms" onClick={(e) => e.stopPropagation()} className="text-ink hover:underline">
                        {t.roomType}
                      </Link>
                    </td>
                    <td className={`font-display px-4 py-3 whitespace-nowrap ${row.amountPaid === 0 ? "font-normal text-muted" : "font-medium text-ink"}`}>
                      {formatCurrency(row.amountPaid)}
                    </td>
                    <td className="font-display px-4 py-3 whitespace-nowrap">
                      {(() => {
                        const outstanding = isCurrentMonth ? calcTotalOwed(row.tenant) : row.owedAmount;
                        return outstanding > 0 ? (
                          <span className="font-medium text-red-600">{formatCurrency(outstanding)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyle[row.status]}`}>{statusLabel[row.status]}</span>
                        {pendingTenantIds.has(t.id) && <PendingSyncTag />}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {needsAction && isCurrentMonth ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPayingTenant(t);
                            setPaymentStep("confirm");
                          }}
                          className="font-semibold text-brand underline-offset-2 hover:underline"
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
                          className="font-semibold text-ink underline-offset-2 group-hover:underline"
                        >
                          Details
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {tenantsReady && pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                        <Receipt size={22} weight="duotone" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-ink">
                          {rentRows.length === 0 ? "No tenants this month" : "No tenants match this filter"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {rentRows.length === 0
                            ? isCurrentMonth
                              ? "Add a tenant to start tracking rent payments."
                              : "No one was resident during this month."
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
          {filteredRows.length > 0 && (
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              pageSize={rowsPerPage}
              totalItems={filteredRows.length}
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
