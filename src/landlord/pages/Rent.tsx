import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import LogPaymentModal from "../components/LogPaymentModal";
import TenantSearchDrawer from "../components/TenantSearchDrawer";
import TenantPaymentDrawer from "../components/TenantPaymentDrawer";
import { useTenants, formatCurrency, type PaymentStatus, type Tenant } from "../TenantsContext";
import { useRoomTypeRent } from "../RoomsContext";
import { useSettings } from "../SettingsContext";
import { LinkSimple, MagnifyingGlass, Plus, CaretLeft, CaretRight, Receipt } from "@phosphor-icons/react";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";

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

/** Difference between a tenant's agreed rent and the standard rate for their room type, e.g. "K200 above standard". */
function rateDiffLabel(t: Tenant, roomTypeRent: Record<string, number>) {
  const diff = t.rentAmount - roomTypeRent[t.roomType];
  if (diff === 0) return null;
  return diff > 0 ? `${formatCurrency(diff)} above standard` : `${formatCurrency(Math.abs(diff))} below standard`;
}

type PaymentStep = "search" | "ledger" | "confirm";

export default function Rent() {
  const { tenants, logPayment } = useTenants();
  const { invoicesOn, collectionTargetPct } = useSettings();
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
  const [invoicesQueued, setInvoicesQueued] = useState(false);

  const [paymentStep, setPaymentStep] = useState<PaymentStep | null>(null);
  const [payingTenant, setPayingTenant] = useState<Tenant | null>(null);

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
      .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase()));
  }, [activeTenants, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // TODO(Jackson): mock prior-period benchmark — wire up to real historical collection data once the backend is connected.
  const LAST_MONTH_RATE = 82;

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
    const trend = Math.round((collectedPct - LAST_MONTH_RATE) * 10) / 10;

    const outstandingSeverity: "none" | "moderate" | "high" =
      outstanding === 0 ? "none" : delinquentCount >= 3 ? "high" : "moderate";

    return { totalExpected, collectedTotal, outstanding, delinquentCount, collectedPct, trend, outstandingSeverity };
  }, [activeTenants]);

  // Arrears aging: how much of the outstanding balance has been owed for how long.
  const aging = useMemo(() => {
    const buckets = { d0to30: 0, d31to60: 0, d61plus: 0 };
    for (const t of activeTenants) {
      if (t.owedAmount <= 0) continue;
      const days = t.daysOverdue ?? 0;
      if (days > 60) buckets.d61plus += t.owedAmount;
      else if (days > 30) buckets.d31to60 += t.owedAmount;
      else buckets.d0to30 += t.owedAmount;
    }
    return buckets;
  }, [activeTenants]);

  const copyLink = () => {
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1500);
  };

  const generateInvoices = () => {
    setInvoicesQueued(true);
    window.setTimeout(() => setInvoicesQueued(false), 1500);
  };

  return (
    <>
      <PageHeader title="Rent" />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
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
                onClick={generateInvoices}
                className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
              >
                <Receipt size={14} weight="bold" />
                {invoicesQueued ? "Invoices queued" : "Generate invoices"}
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

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-line bg-paper p-4">
            <p className="text-xs text-muted">Total expected rent</p>
            <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink">{formatCurrency(stats.totalExpected)}</p>
            <p className="mt-1 text-[11px] text-muted">Target for {month}</p>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <p className="text-xs text-muted">Rent collected</p>
            <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink">{formatCurrency(stats.collectedTotal)}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${Math.min(100, stats.collectedPct)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">{stats.collectedPct}% of target collected</p>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <p className="text-xs text-muted">Still owed</p>
            <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink">{formatCurrency(stats.outstanding)}</p>
            <span
              className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                stats.outstandingSeverity === "none"
                  ? "bg-emerald-50 text-emerald-600"
                  : stats.outstandingSeverity === "moderate"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-red-50 text-red-600"
              }`}
            >
              {stats.outstandingSeverity === "none" ? "All paid up" : `${stats.delinquentCount} tenant${stats.delinquentCount === 1 ? "" : "s"} behind on rent`}
            </span>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <p className="text-xs text-muted">Collection rate</p>
            <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink">{stats.collectedPct}%</p>
            <span
              className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                stats.trend >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {stats.trend >= 0 ? "▲" : "▼"} {stats.trend >= 0 ? "+" : ""}
              {stats.trend}% compared to last month
            </span>
          </div>
        </div>

        {/* Search + filter tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by tenant or room"
              className="w-52 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  filter === f ? "bg-ink text-paper" : "border border-line text-muted hover:bg-mist"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Tenant table */}
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Tenant</th>
                <th className="px-4 py-3 font-medium">Room</th>
                <th className="px-4 py-3 font-medium">Room type</th>
                <th className="px-4 py-3 font-medium">Rent</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((t) => {
                const diffLabel = rateDiffLabel(t, roomTypeRent);
                return (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-mist"
                    onClick={() => {
                      setPayingTenant(t);
                      setPaymentStep("ledger");
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                    <td className="px-4 py-3 text-muted">{t.room}</td>
                    <td className="px-4 py-3 text-muted">{t.roomType}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink">{formatCurrency(t.rentAmount)}</span>
                      {diffLabel && <span className="ml-1.5 text-[10px] text-amber-600">{diffLabel}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                        {statusLabel[t.status]}
                        {t.status === "overdue" && t.daysOverdue ? ` · ${t.daysOverdue}d` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(t.status === "overdue" || t.status === "unpaid") && (
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
                      )}
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
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
      </AnimatePresence>
    </>
  );
}
