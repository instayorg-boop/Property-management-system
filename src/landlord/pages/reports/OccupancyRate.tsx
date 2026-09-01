import { useMemo } from "react";
import PageHeader from "../../components/PageHeader";
import { useRoomsView } from "../../RoomsContext";
import { ReportCard } from "./shared";

export default function OccupancyRate() {
  const rooms = useRoomsView();

  const stats = useMemo(() => {
    const totalBeds = rooms.reduce((sum, r) => sum + r.beds.length, 0);
    const occupiedBeds = rooms.reduce((sum, r) => sum + r.beds.filter((b) => b !== null).length, 0);
    const byType = new Map<string, { name: string; rooms: number; beds: number; occupiedBeds: number }>();
    for (const r of rooms) {
      const entry = byType.get(r.typeId) ?? { name: r.typeConfig.name, rooms: 0, beds: 0, occupiedBeds: 0 };
      entry.rooms += 1;
      entry.beds += r.beds.length;
      entry.occupiedBeds += r.beds.filter((b) => b !== null).length;
      byType.set(r.typeId, entry);
    }
    return {
      totalBeds,
      occupiedBeds,
      occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      byType: Array.from(byType.values()),
    };
  }, [rooms]);

  return (
    <>
      <PageHeader title="Reports" />
      <div className="px-4 sm:px-8 pb-10">
        <ReportCard title="Occupancy Rate" audience="Property Manager / Investor">
          <p className="text-xs text-muted">Current occupancy across the property, broken down by room type.</p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Occupied beds</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">
                {stats.occupiedBeds} / {stats.totalBeds}
              </p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Vacant beds</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{stats.totalBeds - stats.occupiedBeds}</p>
            </div>
            <div className="rounded-lg bg-mist px-3.5 py-2.5">
              <p className="text-[11px] text-muted">Occupancy rate</p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{stats.occupancyRate}%</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-28" />
              </colgroup>
              <thead className="bg-mist text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Room type</th>
                  <th className="px-3 py-2 font-medium">Rooms</th>
                  <th className="px-3 py-2 font-medium">Beds</th>
                  <th className="px-3 py-2 font-medium">Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {stats.byType.map((t) => (
                  <tr key={t.name} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{t.name}</td>
                    <td className="px-3 py-2 text-muted">{t.rooms}</td>
                    <td className="px-3 py-2 text-muted">
                      {t.occupiedBeds} / {t.beds}
                    </td>
                    <td className="px-3 py-2 text-muted">{t.beds > 0 ? Math.round((t.occupiedBeds / t.beds) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportCard>
      </div>
    </>
  );
}
