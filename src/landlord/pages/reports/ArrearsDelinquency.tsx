import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import Select from "../../components/Select";
import { ReportCard, Search, PhoneIcon, ChatIcon, currency, useArrears } from "./shared";

const arrearsSortOptions = [
  { value: "days", label: "Sort by days overdue" },
  { value: "amount", label: "Sort by amount owed" },
];

function daysBadgeStyle(days: number) {
  return days >= 15 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600";
}

/** Zambian mobile numbers stored as "0977 123 456" -> wa.me needs "260977123456". */
function whatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "");
  return `https://wa.me/260${digits}`;
}

export default function ArrearsDelinquency() {
  const navigate = useNavigate();
  const arrears = useArrears();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("days");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = arrears.filter((a) => a.tenant.toLowerCase().includes(q) || a.room.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => (sort === "days" ? b.daysOverdue - a.daysOverdue : b.owed - a.owed));
  }, [arrears, query, sort]);

  const totalOwed = arrears.reduce((sum, a) => sum + a.owed, 0);

  return (
    <>
      <PageHeader title="Reports" />
      <div className="px-4 sm:px-8 pb-10">
        <ReportCard title="Overdue Rent" audience="Property Manager / Operations">
          <p className="text-xs text-muted">Tenants behind on rent, how many days late, what they still owe, and parent/guardian contact info.</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Tenants behind on rent</p>
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

          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
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
                  <th className="px-3 py-2 font-medium">Parent/guardian</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-medium">
                      <button
                        type="button"
                        onClick={() => navigate("/tenants", { state: { openTenantId: a.tenantId } })}
                        className="text-ink hover:text-brand hover:underline"
                      >
                        {a.tenant}
                      </button>
                    </td>
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
                          href={whatsAppLink(a.guardianPhone)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-mist"
                        >
                          <ChatIcon /> WhatsApp
                        </a>
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
