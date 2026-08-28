import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import Modal from "../components/Modal";
import LogPaymentModal from "../components/LogPaymentModal";

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.75}>
      <path
        d="M6.5 9.5a3 3 0 0 0 4.24 0l1.5-1.5a3 3 0 0 0-4.24-4.24l-.7.7M9.5 6.5a3 3 0 0 0-4.24 0l-1.5 1.5a3 3 0 0 0 4.24 4.24l.7-.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={2}>
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  );
}

type PaymentStatus = "paid" | "overdue" | "unpaid" | "partial";

type LedgerRow = { label: string; amount: string; status?: PaymentStatus };

type RoomType = "Single" | "Two sharing" | "Four sharing";

// What each room type is meant to charge — this is what a tenant's rent gets checked against.
const roomTypeRent: Record<RoomType, number> = {
  Single: 1200,
  "Two sharing": 900,
  "Four sharing": 650,
};

type TenantRent = {
  id: string;
  name: string;
  room: string;
  roomType: RoomType;
  rent: string;
  status: PaymentStatus;
  daysOverdue?: number;
  owed?: string;
  ledger: LedgerRow[];
};

const initialTenants: TenantRent[] = [
  {
    id: "t1", name: "A. Mwansa", room: "Room 12", roomType: "Single", rent: "K1,200", status: "paid",
    ledger: [
      { label: "Security deposit", amount: "K1,200" },
      { label: "August 2026 rent", amount: "K1,200", status: "paid" },
    ],
  },
  {
    id: "t2", name: "B. Phiri", room: "Room 08", roomType: "Single", rent: "K950", status: "overdue", daysOverdue: 12, owed: "K1,140",
    ledger: [
      { label: "Security deposit", amount: "K950" },
      { label: "August 2026 rent", amount: "K950", status: "overdue" },
      { label: "Penalty (12 days)", amount: "K190" },
    ],
  },
  {
    id: "t3", name: "C. Banda", room: "Room 03", roomType: "Two sharing", rent: "K900", status: "partial", owed: "K400",
    ledger: [
      { label: "Security deposit", amount: "K900" },
      { label: "August 2026 rent", amount: "K500 of K900", status: "partial" },
    ],
  },
  {
    id: "t4", name: "D. Zulu", room: "Room 05", roomType: "Two sharing", rent: "K900", status: "paid",
    ledger: [{ label: "August 2026 rent", amount: "K900", status: "paid" }],
  },
  {
    id: "t5", name: "F. Chileshe", room: "Room 19", roomType: "Two sharing", rent: "K900", status: "unpaid", owed: "K900",
    ledger: [{ label: "August 2026 rent", amount: "K900", status: "unpaid" }],
  },
  {
    id: "t6", name: "G. Mwape", room: "Room 22", roomType: "Two sharing", rent: "K900", status: "paid",
    ledger: [{ label: "August 2026 rent", amount: "K900", status: "paid" }],
  },
  {
    id: "t7", name: "H. Banda", room: "Room 14", roomType: "Single", rent: "K1,200", status: "overdue", daysOverdue: 4, owed: "K1,200",
    ledger: [{ label: "August 2026 rent", amount: "K1,200", status: "overdue" }],
  },
  {
    id: "t8", name: "J. Kunda", room: "Room 33", roomType: "Four sharing", rent: "K650", status: "paid",
    ledger: [{ label: "August 2026 rent", amount: "K650", status: "paid" }],
  },
];

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

const months = ["August 2026", "July 2026", "June 2026", "May 2026"];

function rentIsOffPlan(t: TenantRent) {
  return parseInt(t.rent.replace(/[^\d]/g, ""), 10) !== roomTypeRent[t.roomType];
}

function PaymentDrawer({
  tenant,
  onClose,
  onLogPayment,
}: {
  tenant: TenantRent;
  onClose: () => void;
  onLogPayment: () => void;
}) {
  return (
    <SlideOver
      onClose={onClose}
      title={tenant.name}
      description={`${tenant.room} · ${tenant.roomType}`}
      footer={
        <button
          type="button"
          onClick={onLogPayment}
          className="w-full rounded-lg bg-brand py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          Log payment
        </button>
      }
    >
      <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
        <div>
          <p className="text-xs text-muted">Agreed rent</p>
          <p className="text-sm font-medium text-ink">{tenant.rent}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">{tenant.roomType} standard rate</p>
          <p className="text-sm font-medium text-ink">K{roomTypeRent[tenant.roomType].toLocaleString()}</p>
        </div>
      </div>
      {rentIsOffPlan(tenant) && (
        <p className="mt-1.5 text-[11px] text-amber-600">This tenant's agreed rent differs from the standard rate for this room type.</p>
      )}

      <p className="mt-6 text-sm font-medium text-ink">Ledger</p>
      <div className="mt-2 divide-y divide-line rounded-xl border border-line">
        {tenant.ledger.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-sm text-ink">{row.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">{row.amount}</span>
              {row.status && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusStyle[row.status]}`}>
                  {statusLabel[row.status]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {tenant.owed && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-mist px-4 py-3">
          <span className="text-sm font-medium text-ink">Outstanding total</span>
          <span className="font-display text-lg font-semibold text-ink">{tenant.owed}</span>
        </div>
      )}
    </SlideOver>
  );
}

/** Opened from the top-level "Log payment" button — search for any tenant, not just one already on screen. */
function TenantPickerModal({
  tenants,
  onClose,
  onPick,
}: {
  tenants: TenantRent[];
  onClose: () => void;
  onPick: (t: TenantRent) => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(
    () =>
      tenants.filter(
        (t) => t.name.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase())
      ),
    [tenants, query]
  );

  return (
    <Modal onClose={onClose} title="Log a payment" description="Search for the tenant you're recording a payment for.">
      <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5">
        <SearchIcon />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or room"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      <div className="mt-3 space-y-1">
        {results.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-mist"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mist text-[10px] font-semibold text-muted">
                {t.name.split(" ").map((s) => s[0]).join("")}
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{t.name}</p>
                <p className="text-xs text-muted">
                  {t.room} · {t.roomType}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                {statusLabel[t.status]}
              </span>
              <p className="mt-1 text-xs text-muted">{t.owed ?? t.rent}</p>
            </div>
          </button>
        ))}
        {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No tenants match.</p>}
      </div>
    </Modal>
  );
}

export default function Rent() {
  const [tenants, setTenants] = useState<TenantRent[]>(initialTenants);
  const [month, setMonth] = useState(months[0]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TenantRent | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showLogPayment, setShowLogPayment] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const filtered = useMemo(() => {
    return tenants
      .filter((t) => filter === "All" || statusLabel[t.status] === filter)
      .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase()));
  }, [tenants, filter, query]);

  const LAST_MONTH_RATE = 82; // mock prior-period benchmark for the trend indicator
  const TARGET_BENCHMARK = 90;

  const stats = useMemo(() => {
    const totalExpected = tenants.reduce((sum, t) => sum + parseInt(t.rent.replace(/[^\d]/g, ""), 10), 0);

    const collectedTotal = tenants.reduce((sum, t) => {
      if (t.status === "paid") return sum + parseInt(t.rent.replace(/[^\d]/g, ""), 10);
      if (t.status === "partial") {
        const paidPortion = t.ledger[0]?.amount.split(" of ")[0] ?? "K0";
        return sum + (parseInt(paidPortion.replace(/[^\d]/g, ""), 10) || 0);
      }
      return sum;
    }, 0);

    const outstanding = tenants.reduce((sum, t) => (t.owed ? sum + parseInt(t.owed.replace(/[^\d]/g, ""), 10) : sum), 0);
    const delinquentCount = tenants.filter((t) => t.status === "overdue" || t.status === "unpaid").length;

    const collectedPct = totalExpected > 0 ? Math.round((collectedTotal / totalExpected) * 100) : 0;
    const trend = Math.round((collectedPct - LAST_MONTH_RATE) * 10) / 10;

    const outstandingSeverity: "none" | "moderate" | "high" =
      outstanding === 0 ? "none" : delinquentCount >= 3 ? "high" : "moderate";

    return { totalExpected, collectedTotal, outstanding, delinquentCount, collectedPct, trend, outstandingSeverity };
  }, [tenants]);

  const copyLink = () => {
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1500);
  };

  return (
    <>
      <PageHeader title="Rent" />

      <div className="space-y-5 px-8 pb-10">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="appearance-none rounded-lg border border-line bg-paper px-3.5 py-2 pr-8 text-sm font-medium text-ink outline-none"
          >
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
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
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
            >
              <PlusIcon />
              Log payment
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="text-xs text-muted">Total expected rent</p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">K{stats.totalExpected.toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-muted">Target for {month}</p>
          </div>

          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="text-xs text-muted">Collected revenue</p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">K{stats.collectedTotal.toLocaleString()}</p>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{ width: `${Math.min(100, stats.collectedPct)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">{stats.collectedPct}% of target reconciled</p>
          </div>

          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="text-xs text-muted">Outstanding balance</p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">K{stats.outstanding.toLocaleString()}</p>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                stats.outstandingSeverity === "none"
                  ? "bg-emerald-50 text-emerald-600"
                  : stats.outstandingSeverity === "moderate"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-red-50 text-red-600"
              }`}
            >
              {stats.outstandingSeverity === "none" ? "All settled" : `${stats.delinquentCount} delinquent unit${stats.delinquentCount === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="text-xs text-muted">Collection velocity</p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{stats.collectedPct}%</p>
            <p className="mt-1 text-[11px] text-muted">vs {TARGET_BENCHMARK}% target benchmark</p>
            <span
              className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${
                stats.trend >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {stats.trend >= 0 ? "▲" : "▼"} {stats.trend >= 0 ? "+" : ""}
              {stats.trend}% vs last month
            </span>
          </div>
        </div>

        {/* Search + filter tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by tenant or room"
              className="w-52 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
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
        <div className="overflow-hidden rounded-xl border border-line">
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
              {filtered.map((t) => (
                <tr key={t.id} className="cursor-pointer border-t border-line transition-colors hover:bg-mist" onClick={() => setSelected(t)}>
                  <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                  <td className="px-4 py-3 text-muted">{t.room}</td>
                  <td className="px-4 py-3 text-muted">{t.roomType}</td>
                  <td className="px-4 py-3">
                    <span className="text-ink">{t.rent}</span>
                    {rentIsOffPlan(t) && <span className="ml-1.5 text-[10px] text-amber-600">off-plan</span>}
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
                          setSelected(t);
                          setShowLogPayment(true);
                        }}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-paper"
                      >
                        Log payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No tenants found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

       
      </div>

      <AnimatePresence>
        {showPicker && (
          <TenantPickerModal
            tenants={tenants}
            onClose={() => setShowPicker(false)}
            onPick={(t) => {
              setSelected(t);
              setShowPicker(false);
              setShowLogPayment(true);
            }}
          />
        )}
        {selected && !showLogPayment && !showPicker && (
          <PaymentDrawer tenant={selected} onClose={() => setSelected(null)} onLogPayment={() => setShowLogPayment(true)} />
        )}
        {showLogPayment && selected && (
          <LogPaymentModal
            tenantName={selected.name}
            room={`${selected.room} · ${selected.roomType}`}
            outstanding={selected.owed ?? selected.rent}
            onClose={() => setShowLogPayment(false)}
            onConfirm={() => {
              setTenants((prev) => prev.map((t) => (t.id === selected.id ? { ...t, status: "paid", owed: undefined } : t)));
              setShowLogPayment(false);
              setSelected(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
