import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import SlideOver from "../components/SlideOver";
import Select from "../components/Select";

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.5}>
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

type Status = "open" | "in-progress" | "resolved";

type Report = {
  id: string;
  tenant: string;
  room: string;
  description: string;
  submittedAt: string; // ISO
  status: Status;
  unread: boolean;
  hasPhoto: boolean;
};

const initialReports: Report[] = [
  {
    id: "m1", tenant: "B. Phiri", room: "Room 08",
    description: "Tap in the bathroom won't stop dripping, has been going for two days.",
    submittedAt: "2026-08-27T08:12:00", status: "open", unread: true, hasPhoto: true,
  },
  {
    id: "m2", tenant: "F. Chileshe", room: "Room 19",
    description: "Window latch is broken, doesn't lock properly at night.",
    submittedAt: "2026-08-26T19:40:00", status: "open", unread: true, hasPhoto: false,
  },
  {
    id: "m3", tenant: "A. Mwansa", room: "Room 12",
    description: "Ceiling light in the room has stopped working.",
    submittedAt: "2026-08-25T14:05:00", status: "in-progress", unread: false, hasPhoto: true,
  },
  {
    id: "m4", tenant: "G. Mwape", room: "Room 22",
    description: "Door handle came loose, still usable but needs tightening.",
    submittedAt: "2026-08-22T09:30:00", status: "in-progress", unread: false, hasPhoto: false,
  },
  {
    id: "m5", tenant: "H. Banda", room: "Room 14",
    description: "Gate to the compound was squeaking, plumber fixed it after oiling.",
    submittedAt: "2026-08-18T11:15:00", status: "resolved", unread: false, hasPhoto: false,
  },
  {
    id: "m6", tenant: "D. Zulu", room: "Room 05",
    description: "Requested extra key cut for a guardian visiting for the weekend.",
    submittedAt: "2026-08-15T16:50:00", status: "resolved", unread: false, hasPhoto: false,
  },
];

const statusLabel: Record<Status, string> = { open: "Open", "in-progress": "In progress", resolved: "Resolved" };

const statusStyle: Record<Status, string> = {
  open: "bg-red-50 text-red-600",
  "in-progress": "bg-amber-50 text-amber-600",
  resolved: "bg-emerald-50 text-emerald-600",
};

const filterOptions = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ReportDrawer({
  report,
  onClose,
  onSetStatus,
}: {
  report: Report;
  onClose: () => void;
  onSetStatus: (status: Status) => void;
}) {
  return (
    <SlideOver
      onClose={onClose}
      title={report.room}
      description={`Reported by ${report.tenant} · ${formatDate(report.submittedAt)}`}
      footer={
        <>
          <div className="grid grid-cols-3 gap-2">
            {(["open", "in-progress", "resolved"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSetStatus(s)}
                className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  report.status === s ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>

          <Link
            to="/expenses"
            className="mt-2 block w-full rounded-lg border border-line py-2.5 text-center text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            Log a repair cost for this →
          </Link>
        </>
      }
    >
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[report.status]}`}>
        {statusLabel[report.status]}
      </span>
      <p className="mt-3 rounded-lg bg-mist p-4 text-sm text-ink">{report.description}</p>

      <p className="mt-6 text-sm font-medium text-ink">Photo</p>
      {report.hasPhoto ? (
        <div className="mt-2 flex h-48 items-center justify-center rounded-lg border border-dashed border-line bg-mist text-sm text-muted">
          Photo attached by tenant
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">No photo attached to this report.</p>
      )}
    </SlideOver>
  );
}

export default function Maintenance() {
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Report | null>(null);

  const filtered = useMemo(() => {
    const rows = filter === "all" ? reports : reports.filter((r) => r.status === filter);
    return [...rows].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  }, [reports, filter]);

  const counts = useMemo(
    () => ({
      open: reports.filter((r) => r.status === "open").length,
      inProgress: reports.filter((r) => r.status === "in-progress").length,
      unread: reports.filter((r) => r.unread).length,
    }),
    [reports]
  );

  const openReport = (r: Report) => {
    setSelected(r);
    if (r.unread) {
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, unread: false } : x)));
    }
  };

  return (
    <>
      <PageHeader title="Maintenance" />

      <div className="space-y-5 px-8 pb-10">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="text-xs text-muted">Open</p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{counts.open}</p>
          </div>
          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="text-xs text-muted">In progress</p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{counts.inProgress}</p>
          </div>
          <div className="rounded-xl border border-line bg-paper p-5">
            <p className="text-xs text-muted">Unread</p>
            <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{counts.unread}</p>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Filter by status</span>
          <Select value={filter} onChange={setFilter} options={filterOptions} />
        </div>

        {/* Report table */}
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-24" />
              <col className="w-32" />
              <col />
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-20" />
            </colgroup>
            <thead className="bg-mist text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Room</th>
                <th className="px-3 py-2.5 font-medium">Reported by</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-line transition-colors hover:bg-mist">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {r.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                      <span className="truncate font-medium text-ink">{r.room}</span>
                    </div>
                  </td>
                  <td className="truncate px-3 py-2.5 text-ink">{r.tenant}</td>
                  <td className="truncate px-3 py-2.5 text-muted">{r.description}</td>
                  <td className="px-3 py-2.5 text-muted">
                    <span className="whitespace-nowrap">{formatDate(r.submittedAt)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyle[r.status]}`}>
                      {statusLabel[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => openReport(r)}
                      aria-label={`View report for ${r.room}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-paper hover:text-ink"
                    >
                      <EyeIcon />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    No reports match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <ReportDrawer
            report={selected}
            onClose={() => setSelected(null)}
            onSetStatus={(status) => {
              setReports((prev) => prev.map((r) => (r.id === selected.id ? { ...r, status } : r)));
              setSelected((prev) => (prev ? { ...prev, status } : prev));
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
