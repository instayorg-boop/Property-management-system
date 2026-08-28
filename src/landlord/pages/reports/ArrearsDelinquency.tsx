import { useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import Select from "../../components/Select";
import { ReportCard, Search, PhoneIcon, ChatIcon, currency } from "./shared";

type ArrearsRow = {
  id: string;
  tenant: string;
  room: string;
  daysOverdue: number;
  owed: number;
  guardianName: string;
  guardianPhone: string;
};

const arrears: ArrearsRow[] = [
  { id: "a1", tenant: "B. Phiri", room: "Room 08", daysOverdue: 12, owed: 1140, guardianName: "R. Phiri", guardianPhone: "0977456789" },
  { id: "a2", tenant: "H. Banda", room: "Room 14", daysOverdue: 4, owed: 1200, guardianName: "X. Banda", guardianPhone: "0977012345" },
  { id: "a3", tenant: "C. Banda", room: "Room 03", daysOverdue: 6, owed: 450, guardianName: "S. Banda", guardianPhone: "0955567890" },
  { id: "a4", tenant: "L. Zulu", room: "Room 33", daysOverdue: 21, owed: 325, guardianName: "T. Zulu", guardianPhone: "0966678901" },
];

const arrearsSortOptions = [
  { value: "days", label: "Sort by days overdue" },
  { value: "amount", label: "Sort by amount owed" },
];

function daysBadgeStyle(days: number) {
  return days >= 15 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600";
}

export default function ArrearsDelinquency() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("days");
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = arrears.filter((a) => a.tenant.toLowerCase().includes(q) || a.room.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => (sort === "days" ? b.daysOverdue - a.daysOverdue : b.owed - a.owed));
  }, [query, sort]);

  const totalOwed = arrears.reduce((sum, a) => sum + a.owed, 0);

  return (
    <>
      <PageHeader title="Reports" />
      <div className="px-8 pb-10">
        <ReportCard title="Arrears & Delinquency" audience="Property Manager / Operations">
          <p className="text-xs text-muted">Overdue tenants, days past due, remaining balance, and guardian contact info.</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Tenants in arrears</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{arrears.length}</p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Total owed</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-red-600">{currency(totalOwed)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <Search />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by tenant or room"
                className="w-48 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <Select value={sort} onChange={setSort} options={arrearsSortOptions} />
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-32" />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-52" />
              </colgroup>
              <thead className="bg-mist text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Tenant</th>
                  <th className="px-3 py-2 font-medium">Room</th>
                  <th className="px-3 py-2 font-medium">Days overdue</th>
                  <th className="px-3 py-2 font-medium">Owed</th>
                  <th className="px-3 py-2 font-medium">Guardian</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-medium text-ink">{a.tenant}</td>
                    <td className="px-3 py-2 text-muted">{a.room}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${daysBadgeStyle(a.daysOverdue)}`}>
                        {a.daysOverdue}d
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">{currency(a.owed)}</td>
                    <td className="px-3 py-2">
                      <p className="text-ink">{a.guardianName}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <a
                          href={`tel:${a.guardianPhone}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-mist"
                        >
                          <PhoneIcon /> Call
                        </a>
                        <a
                          href={`https://wa.me/26${a.guardianPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-mist"
                        >
                          <ChatIcon /> WhatsApp
                        </a>
                        <button
                          type="button"
                          onClick={() => setSent((prev) => ({ ...prev, [a.id]: true }))}
                          disabled={sent[a.id]}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-brand transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:text-muted"
                        >
                          {sent[a.id] ? "Reminder sent" : "Send reminder"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted">
                      No tenants match this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ReportCard>
      </div>
    </>
  );
}
