import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ClockCounterClockwise, ArrowSquareOut, DownloadSimple } from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import { REPORT_TYPES, getReportType } from "../reportTypes";
import { useSettings } from "../SettingsContext";
import { supabase } from "../../lib/supabaseClient";
import {
  TableCard,
  DataTable,
  DataTableHead,
  DataTableBody,
  Th,
  Td,
  StatusPill,
  TableEmptyState,
} from "../components/DataTable";

type HubTab = "new" | "history" | "auto";

type AutoReportRow = {
  id: string;
  kind: string;
  period_label: string;
  date_from: string;
  date_to: string;
  rent_collected: number;
  created_at: string;
  public_token: string;
};

type AutoFilter = "all" | "weekly" | "monthly";

type ReportHistoryRow = {
  id: string;
  report_type: string;
  format: string;
  date_from: string;
  date_to: string;
  file_path: string;
  file_name: string;
  created_at: string;
};

const EMPTY_TITLE = "No reports generated yet";
const EMPTY_DESCRIPTION = "Reports you generate will show up here, ready to download again without re-running them.";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The period a report covers — two runs of the same report on the same day are otherwise
 * indistinguishable in the list. */
function formatPeriod(row: ReportHistoryRow): string {
  return `${formatDay(row.date_from)} – ${formatDay(row.date_to)}`;
}

function reportTitle(row: ReportHistoryRow): string {
  return getReportType(row.report_type)?.title ?? row.report_type;
}

/** View + Download as visible buttons rather than a menu — they're the only two things anyone
 * does with a past report, so hiding them behind a ⋮ just adds a tap. */
function ReportActions({
  row,
  downloading,
  onView,
  onDownload,
}: {
  row: ReportHistoryRow;
  downloading: boolean;
  onView: (row: ReportHistoryRow) => void;
  onDownload: (row: ReportHistoryRow) => void;
}) {
  return (
    <>
      {row.format === "pdf" && (
        <Button variant="outline" size="sm" onClick={() => onView(row)}>
          <ArrowSquareOut size={14} />
          View
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => onDownload(row)} disabled={downloading}>
        <DownloadSimple size={14} />
        {downloading ? "Downloading…" : "Download"}
      </Button>
    </>
  );
}

/** Reports hub — the single landing page "Reports" now goes to, replacing the sidebar's old
 * expand-in-place dropdown (Overdue rent / Income vs expenses / Occupancy rate listed directly
 * under the nav item). Picking a report here goes to its own generate page instead of straight to
 * a dashboard, matching the "browse types, then configure one" flow common property-management
 * reporting tools use (Buildium, AppFolio) rather than a flat list of pre-built views. */
export default function Reports() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<HubTab>("new");
  const { propertyId } = useSettings();
  const [history, setHistory] = useState<ReportHistoryRow[] | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [autoReports, setAutoReports] = useState<AutoReportRow[] | null>(null);
  const [autoFilter, setAutoFilter] = useState<AutoFilter>("all");

  useEffect(() => {
    if (tab !== "auto" || !propertyId) return;
    let cancelled = false;
    // `report_links` isn't in the generated Supabase types yet, cast through `any` like
    // role_permissions elsewhere in this app. RLS already scopes this to the caller's property
    // and, for members, to `reports.view`.
    (supabase as any)
      .from("report_links")
      .select("id, kind, period_label, date_from, date_to, rent_collected, created_at, public_token")
      .eq("property_id", propertyId)
      .in("kind", ["weekly", "monthly"])
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }: { data: AutoReportRow[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load weekly/monthly reports", error);
          setAutoReports([]);
        } else {
          setAutoReports(data ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, propertyId]);

  const visibleAutoReports = (autoReports ?? []).filter((r) => autoFilter === "all" || r.kind === autoFilter);

  useEffect(() => {
    if (tab !== "history" || !propertyId) return;
    let cancelled = false;
    supabase
      .from("report_history")
      .select("id, report_type, format, date_from, date_to, file_path, file_name, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load report history", error);
          setHistory([]);
        } else {
          setHistory(data ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, propertyId]);

  // Signed URLs are short-lived (the one generate-report handed back is long expired by the time
  // someone revisits history), so a fresh one is created here — the storage RLS policy that scopes
  // "reports" to the caller's own properties is what makes this safe to do straight from the
  // client rather than needing another edge-function round trip.
  //
  // `download` forces Content-Disposition: attachment — without it a cross-origin signed URL opens
  // in another preview tab instead of saving, since <a download> alone is ignored for cross-origin
  // requests by most browsers. "View Report" deliberately omits it, for the opposite reason: that
  // one is supposed to open in a tab (the browser's native PDF viewer), not save.
  const handleDownload = async (row: ReportHistoryRow) => {
    setDownloadingId(row.id);
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(row.file_path, 300, { download: row.file_name });
      if (error || !data) throw error ?? new Error("No URL returned");
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = row.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error("Failed to download report", e);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleView = async (row: ReportHistoryRow) => {
    try {
      const { data, error } = await supabase.storage.from("reports").createSignedUrl(row.file_path, 300);
      if (error || !data) throw error ?? new Error("No URL returned");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Failed to open report", e);
    }
  };

  return (
    <>
      <PageHeader title="Reports" description="Generate a report, or find one you've already run." />

      <div className="overflow-x-auto border-b border-line px-4 sm:px-8">
        <div className="flex items-center gap-1">
          {(["new", "history", "auto"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap ${
                tab === t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t === "new" ? "New reports" : t === "history" ? "Report history" : "Weekly & monthly"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-6 sm:px-8">
        {tab === "new" ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {REPORT_TYPES.map((r) => {
                const Icon = r.icon;
                return (
                  <Link
                    key={r.slug}
                    to={`/reports/${r.slug}/generate`}
                    className="group flex h-full flex-col rounded-lg border border-line bg-paper p-5 transition-colors hover:border-ink/20 hover:bg-mist/30"
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${r.tint}`}>
                      <Icon size={20} weight="duotone" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-ink">{r.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{r.description}</p>
                    {/* mt-auto pins this to the card's bottom edge regardless of how long the
                        description above happens to be, so every card in a row lines up. */}
                    <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-medium text-brand underline opacity-0 transition-opacity group-hover:opacity-100">
                      View report
                      <ArrowRight size={12} weight="bold" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        ) : (
          <TableCard>
            {/* Desktop table */}
            <div className="hidden md:block">
              <DataTable>
                <DataTableHead>
                  <Th>Report title</Th>
                  <Th>Format</Th>
                  <Th>Generated</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </DataTableHead>
                <DataTableBody>
                  {history === null ? (
                    Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                  ) : history.length === 0 ? (
                    <TableEmptyState
                      colSpan={5}
                      icon={<ClockCounterClockwise size={20} />}
                      title={EMPTY_TITLE}
                      description={EMPTY_DESCRIPTION}
                    />
                  ) : (
                    history.map((row) => (
                      <tr key={row.id}>
                        <Td>
                          <p className="font-medium text-ink">{reportTitle(row)}</p>
                          <p className="mt-0.5 text-xs text-muted">{formatPeriod(row)}</p>
                        </Td>
                        <Td>
                          <StatusPill tone={row.format === "pdf" ? "danger" : "info"}>{row.format.toUpperCase()}</StatusPill>
                        </Td>
                        <Td className="text-muted">{formatDay(row.created_at)}</Td>
                        <Td>
                          <StatusPill tone="success">Complete</StatusPill>
                        </Td>
                        <Td align="right">
                          <div className="flex justify-end gap-2">
                            <ReportActions row={row} downloading={downloadingId === row.id} onView={handleView} onDownload={handleDownload} />
                          </div>
                        </Td>
                      </tr>
                    ))
                  )}
                </DataTableBody>
              </DataTable>
            </div>

            {/* Mobile cards — a table this wide pushes the actions off-screen on a phone, so each
                report is its own card with its actions as full-width buttons along the bottom. */}
            <div className="space-y-3 p-3 md:hidden">
              {history === null ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-line p-4">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="mt-3 h-9 w-full" />
                  </div>
                ))
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mist text-muted">
                    <ClockCounterClockwise size={20} />
                  </span>
                  <div>
                    <p className="text-[13px] font-bold text-ink">{EMPTY_TITLE}</p>
                    <p className="mt-1 text-[13px] text-muted">{EMPTY_DESCRIPTION}</p>
                  </div>
                </div>
              ) : (
                history.map((row) => (
                  <div key={row.id} className="rounded-xl border border-line bg-paper p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium text-ink">{reportTitle(row)}</p>
                        <p className="mt-0.5 text-xs text-muted">{formatPeriod(row)}</p>
                      </div>
                      <StatusPill tone={row.format === "pdf" ? "danger" : "info"}>{row.format.toUpperCase()}</StatusPill>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted">
                      <span>Generated {formatDay(row.created_at)}</span>
                      <StatusPill tone="success">Complete</StatusPill>
                    </div>
                    <div className="mt-4 flex gap-2 *:flex-1">
                      <ReportActions row={row} downloading={downloadingId === row.id} onView={handleView} onDownload={handleDownload} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </TableCard>
        )}

        {tab === "auto" && (
          <>
            <div className="mb-4 flex gap-2">
              {(["all", "weekly", "monthly"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setAutoFilter(f)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    autoFilter === f ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                  }`}
                >
                  {f === "all" ? "All" : f === "weekly" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
            <TableCard>
              <div className="hidden md:block">
                <DataTable>
                  <DataTableHead>
                    <Th>Kind</Th>
                    <Th>Period</Th>
                    <Th>Rent collected</Th>
                    <Th>Generated</Th>
                    <Th align="right">Actions</Th>
                  </DataTableHead>
                  <DataTableBody>
                    {autoReports === null ? (
                      Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                    ) : visibleAutoReports.length === 0 ? (
                      <TableEmptyState
                        colSpan={5}
                        icon={<ClockCounterClockwise size={20} />}
                        title="No reports yet"
                        description="Your first report arrives on the next Monday after you turn weekly reports on in Settings > Notifications."
                      />
                    ) : (
                      visibleAutoReports.map((row) => (
                        <tr key={row.id}>
                          <Td>
                            <StatusPill tone={row.kind === "weekly" ? "info" : "success"}>
                              {row.kind === "weekly" ? "Weekly" : "Monthly"}
                            </StatusPill>
                          </Td>
                          <Td className="text-ink">{row.period_label}</Td>
                          <Td className="text-muted">K{(row.rent_collected ?? 0).toLocaleString()}</Td>
                          <Td className="text-muted">{formatDay(row.created_at)}</Td>
                          <Td align="right">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/reports/view/${row.id}`)}>
                              <ArrowSquareOut size={14} />
                              Open
                            </Button>
                          </Td>
                        </tr>
                      ))
                    )}
                  </DataTableBody>
                </DataTable>
              </div>

              <div className="space-y-3 p-3 md:hidden">
                {autoReports === null ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2 rounded-xl border border-line p-4">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  ))
                ) : visibleAutoReports.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mist text-muted">
                      <ClockCounterClockwise size={20} />
                    </span>
                    <p className="text-[13px] text-muted">
                      Your first report arrives on the next Monday after you turn weekly reports on in Settings &gt; Notifications.
                    </p>
                  </div>
                ) : (
                  visibleAutoReports.map((row) => (
                    <div key={row.id} className="rounded-xl border border-line bg-paper p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-medium text-ink">{row.period_label}</p>
                          <p className="mt-0.5 text-xs text-muted">K{(row.rent_collected ?? 0).toLocaleString()} collected</p>
                        </div>
                        <StatusPill tone={row.kind === "weekly" ? "info" : "success"}>
                          {row.kind === "weekly" ? "Weekly" : "Monthly"}
                        </StatusPill>
                      </div>
                      <div className="mt-4">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/reports/view/${row.id}`)}>
                          <ArrowSquareOut size={14} />
                          Open
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TableCard>
          </>
        )}
      </div>
    </>
  );
}
