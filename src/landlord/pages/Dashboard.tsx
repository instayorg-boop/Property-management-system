import { Link } from "react-router-dom";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M3.5 8h9M8.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.75}>
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <path
        d="M11.5 2.5a3 3 0 0 0-3.9 3.9L2 12l2 2 5.6-5.6a3 3 0 0 0 3.9-3.9l-2.1 2.1-1.5-.5-.5-1.5 2.1-2.1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M3 8h18M3 8v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8M3 8l2-4h14l2 4M12 12v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M8 3h8l2 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7l2-4ZM8 11h8M8 15h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.75}>
      <path
        d="M17 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 8v6M22 11h-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const quickActions = [
  { label: "Log payment", to: "/rent", Icon: CashIcon },
  { label: "Add expense", to: "/expenses", Icon: ReceiptIcon },
  { label: "Add tenant", to: "/tenants", Icon: UserPlusIcon },
];

function Greeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const name = "Bernard";

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-5">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          Good {part}, {name}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {today} · {time}
        </p>
      </div>

      <div className="flex gap-2">
        {quickActions.map(({ label, to, Icon }, i) => (
          <Link
            key={label}
            to={to}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-transform hover:scale-[1.02] ${
              i === 0 ? "bg-brand text-paper" : "border border-line text-ink hover:bg-mist"
            }`}
          >
            <Icon />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

const briefingItems = [
  { label: "B. Phiri — Room 08", detail: "12 days overdue", tone: "red" as const, to: "/rent" },
  { label: "Maintenance — Room 21", detail: "Unread", tone: "amber" as const, to: "/maintenance" },
  { label: "A. Mwansa — Room 12", detail: "Lease ends in 9 days", tone: "amber" as const, to: "/tenants" },
];

const toneDot = { red: "bg-red-400", amber: "bg-amber-400" };

const monthlyCollections = [
  { label: "Mar", value: 62 },
  { label: "Apr", value: 78 },
  { label: "May", value: 55 },
  { label: "Jun", value: 90 },
  { label: "Jul", value: 71 },
  { label: "Aug", value: 88 },
];

const recentPayments = [
  { tenant: "A. Mwansa", room: "Room 12", status: "Paid", date: "26 Aug 2026", amount: "+K1,200" },
  { tenant: "D. Zulu", room: "Room 05", status: "Paid", date: "26 Aug 2026", amount: "+K1,000" },
  { tenant: "B. Phiri", room: "Room 08", status: "Overdue", date: "14 Aug 2026", amount: "K950" },
  { tenant: "F. Chileshe", room: "Room 19", status: "Paid", date: "23 Aug 2026", amount: "+K950" },
  { tenant: "C. Banda", room: "Room 03", status: "Partial", date: "20 Aug 2026", amount: "+K700" },
];

const statusStyle: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-600",
  Overdue: "bg-red-50 text-red-600",
  Partial: "bg-amber-50 text-amber-600",
};

// Unread maintenance reports — hide the whole card when empty.
const unreadMaintenance = [
  { room: "Room 08", description: "Tap in the bathroom won't stop dripping, has been going for two days.", timeAgo: "18m ago" },
  { room: "Room 19", description: "Window latch is broken, doesn't lock properly at night.", timeAgo: "2h ago" },
];

export default function Dashboard() {
  return (
    <>
      <Greeting />

      <div className="grid grid-cols-1 gap-4 px-8 pb-10 lg:grid-cols-3">
        {/* Left / main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl bg-brand p-5 text-paper">
              <p className="text-xs text-paper/70">Collection rate</p>
              <p className="mt-3 font-display text-2xl font-semibold">88%</p>
              <p className="mt-1 text-[11px] text-paper/70">This month</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper p-5">
              <p className="text-xs text-muted">Collected</p>
              <p className="mt-3 font-display text-2xl font-semibold text-ink">K184,200</p>
              <p className="mt-1 text-[11px] text-emerald-600">+6% vs last month</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper p-5">
              <p className="text-xs text-muted">Occupied</p>
              <p className="mt-3 font-display text-2xl font-semibold text-ink">70 / 76</p>
              <p className="mt-1 text-[11px] text-muted">6 rooms vacant</p>
            </div>
          </div>

          {/* Collections chart */}
          <div className="rounded-2xl border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Collections</p>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-mist"
              >
                Last 6 months
                <ChevronDownIcon />
              </button>
            </div>

            <div className="mt-6 flex h-40 items-end gap-3">
              {monthlyCollections.map((m) => (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end overflow-hidden rounded-md bg-mist">
                    <div
                      className={`w-full rounded-md ${m.label === "Aug" ? "bg-brand" : "bg-ink/15"}`}
                      style={{ height: `${m.value}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent payments table */}
          <div className="rounded-2xl border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Recent payments</p>
              <Link to="/rent" className="text-xs font-medium text-brand hover:text-ink">
                View all
              </Link>
            </div>

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
                {recentPayments.map((p) => (
                  <tr key={p.tenant} className="border-t border-line">
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Today's briefing */}
          <div className="rounded-2xl border border-line bg-paper p-5">
            <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand">
              Today's briefing
            </span>
            <p className="mt-3 font-display text-lg font-semibold tracking-tight text-ink">
              3 things need your attention
            </p>
            <p className="mt-1 text-xs text-muted">Overdue rent, an unread report, and a lease ending soon.</p>

            <div className="mt-4 space-y-2">
              {briefingItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2 transition-colors hover:bg-line/40"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[item.tone]}`} />
                    <span className="truncate text-xs font-medium text-ink">{item.label}</span>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">{item.detail}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Upcoming payout */}
          <div className="rounded-2xl border border-line bg-paper p-5">
            <p className="text-[11px] font-medium text-muted uppercase">Payout</p>
            <p className="mt-2 font-display text-base font-semibold text-ink">Lenco payout scheduled</p>
            <p className="mt-1 text-xs text-muted">K42,300 net, arriving to your linked account.</p>
            <p className="mt-3 text-sm font-medium text-ink">Friday · 29 Aug 2026</p>
            <Link
              to="/settings"
              className="mt-4 block rounded-lg bg-mist py-2 text-center text-xs font-medium text-ink transition-colors hover:bg-line/40"
            >
              View payout details
            </Link>
          </div>

          {/* Maintenance inbox preview — hidden entirely when nothing is open */}
          {unreadMaintenance.length > 0 && (
            <div className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Maintenance inbox</p>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                  {unreadMaintenance.length} unread
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {unreadMaintenance.slice(0, 3).map((r) => (
                  <div key={r.room} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
                      <WrenchIcon />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-ink">{r.room}</p>
                        <span className="text-[11px] text-muted">· {r.timeAgo}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">{r.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                to="/maintenance"
                className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-mist py-2 text-xs font-medium text-ink transition-colors hover:bg-line/40"
              >
                View all
                <ArrowIcon />
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
