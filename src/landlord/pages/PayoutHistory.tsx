import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, DownloadSimple, Wallet } from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Select from "../components/Select";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { SkeletonRow } from "../components/Skeleton";
import Button from "../components/Button";
import { useSettings } from "../SettingsContext";
import { formatCurrency } from "../TenantsContext";
import { useIsOwner } from "../useIsOwner";
import { listPayouts, type PayoutRecord, type PayoutStatus } from "../../lib/payoutApi";

const statusFilters: { value: "all" | PayoutStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "successful", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

const statusLabel: Record<PayoutStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  successful: "Completed",
  failed: "Failed",
};
const statusStyle: Record<PayoutStatus, string> = {
  pending: "bg-amber-50 text-amber-600",
  processing: "bg-amber-50 text-amber-600",
  successful: "bg-emerald-50 text-emerald-600",
  failed: "bg-red-50 text-red-600",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function downloadCsv(filename: string, rows: PayoutRecord[]) {
  const header = ["Date", "Amount", "Status", "Failure reason"];
  const lines = rows.map((r) =>
    [formatDate(r.createdAt), r.amount, statusLabel[r.status], r.failureReason ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Full payout ledger — reachable only via the "View all" link in PayoutDetailDrawer's "Recent
 * payouts" section, not from the sidebar (see Sidebar.tsx — deliberately not added there). Gated
 * the same way as the Accounting balance pill; see useIsOwner's comment for what that actually
 * checks today. */
export default function PayoutHistory() {
  const { propertyId } = useSettings();
  const isOwner = useIsOwner();

  const [rows, setRows] = useState<PayoutRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | PayoutStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (!propertyId || !isOwner) return;
    let cancelled = false;
    setLoading(true);
    listPayouts(propertyId, {
      status: statusFilter === "all" ? undefined : [statusFilter],
      from: fromDate ? new Date(fromDate).toISOString() : undefined,
      // End-of-day for the "to" bound so the selected day itself is included.
      to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
    })
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => console.error("Failed to load payout history", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, isOwner, statusFilter, fromDate, toDate]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil((rows?.length ?? 0) / pageSize));
  const pageRows = useMemo(() => (rows ?? []).slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);

  if (!isOwner) {
    return (
      <div className="px-4 py-10 text-center sm:px-8">
        <p className="text-sm text-muted">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Payout history" description="Every transfer attempt to your bank account." />

      <div className="space-y-5 px-4 sm:px-8 pb-10">
        <Link to="/accounting" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft size={14} weight="bold" />
          Back to Accounting
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as "all" | PayoutStatus)}
              options={statusFilters}
              className="w-40"
            />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
          </div>
          <Button
            variant="secondary"
            className="gap-1.5"
            disabled={!rows || rows.length === 0}
            onClick={() => rows && downloadCsv("payout-history.csv", rows)}
          >
            <DownloadSimple size={14} weight="bold" />
            Export
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-paper text-[11px] text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium tracking-wide">Date</th>
                <th className="px-4 py-3 font-medium tracking-wide">Amount</th>
                <th className="px-4 py-3 font-medium tracking-wide">Status</th>
                <th className="px-4 py-3 font-medium tracking-wide">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={4} />)}
              {!loading &&
                pageRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap text-ink">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusStyle[r.status]}`}>
                        {statusLabel[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.failureReason ?? "—"}</td>
                  </tr>
                ))}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10">
                    <div className="flex flex-col items-center justify-center gap-3 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                        <Wallet size={22} weight="duotone" />
                      </span>
                      <p className="text-xs font-semibold text-ink">No payouts match these filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {!loading && (rows?.length ?? 0) > 0 && (
            <Pagination
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              totalItems={rows?.length ?? 0}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
