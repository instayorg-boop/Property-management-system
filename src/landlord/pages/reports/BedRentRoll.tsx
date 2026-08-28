import { useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import Select from "../../components/Select";
import { ReportCard, Search, currency, bedRoll, type BedStatus } from "./shared";

const bedStatusStyle: Record<BedStatus, string> = {
  paid: "bg-emerald-50 text-emerald-600",
  overdue: "bg-red-50 text-red-600",
  partial: "bg-amber-50 text-amber-600",
  vacant: "bg-slate-100 text-slate-600",
};

const bedStatusLabel: Record<BedStatus, string> = {
  paid: "Paid",
  overdue: "Overdue",
  partial: "Partial",
  vacant: "Vacant",
};

const bedFilterOptions = [
  { value: "all", label: "All beds" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "partial", label: "Partial" },
  { value: "vacant", label: "Vacant" },
];

export default function BedRentRoll() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return bedRoll.filter((b) => {
      const matchesQuery = !q || b.room.toLowerCase().includes(q) || (b.tenant ?? "").toLowerCase().includes(q);
      const matchesFilter = filter === "all" || b.status === filter;
      return matchesQuery && matchesFilter;
    });
  }, [query, filter]);

  const occupied = bedRoll.filter((b) => b.status !== "vacant").length;
  const occupancyRate = Math.round((occupied / bedRoll.length) * 100);

  return (
    <>
      <PageHeader title="Reports" />
      <div className="px-8 pb-10">
        <ReportCard title="Bed Rent Roll" audience="Property Manager">
          <p className="text-xs text-muted">Live status of every bed, rent rate, and current payment status for the active month.</p>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Occupied</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{occupied} / {bedRoll.length}</p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Vacant</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{bedRoll.length - occupied}</p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Occupancy rate</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{occupancyRate}%</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <Search />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by room or tenant"
                className="w-48 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <Select value={filter} onChange={setFilter} options={bedFilterOptions} />
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-28" />
                <col className="w-20" />
                <col />
                <col className="w-24" />
                <col className="w-24" />
              </colgroup>
              <thead className="bg-mist text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Room</th>
                  <th className="px-3 py-2 font-medium">Bed</th>
                  <th className="px-3 py-2 font-medium">Tenant</th>
                  <th className="px-3 py-2 font-medium">Rent</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{b.room}</td>
                    <td className="px-3 py-2 text-muted">{b.bed}</td>
                    <td className={`px-3 py-2 ${b.tenant ? "text-ink" : "text-muted italic"}`}>{b.tenant ?? "— Vacant —"}</td>
                    <td className="px-3 py-2 text-muted">{currency(b.rent)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bedStatusStyle[b.status]}`}>
                        {bedStatusLabel[b.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted">
                      No beds match this view.
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
