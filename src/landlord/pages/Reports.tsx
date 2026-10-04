import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClockCounterClockwise, DotsThreeVertical, ArrowSquareOut, DownloadSimple } from "@phosphor-icons/react";
import PageHeader from "../components/PageHeader";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";

type HubTab = "new" | "history";

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

/** Reports hub — the single landing page "Reports" now goes to, replacing the sidebar's old
 * expand-in-place dropdown (Overdue rent / Income vs expenses / Occupancy rate listed directly
 * under the nav item). Picking a report here goes to its own generate page instead of straight to
 * a dashboard, matching the "browse types, then configure one" flow common property-management
 * reporting tools use (Buildium, AppFolio) rather than a flat list of pre-built views. */
export default function Reports() {
  const [tab, setTab] = useState<HubTab>("new");
  const { propertyId } = useSettings();
  const [history, setHistory] = useState<ReportHistoryRow[] | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
          {(["new", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap ${
                tab === t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t === "new" ? "New reports" : "Report history"}
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
            <DataTable>
              <DataTableHead>
                <Th>Report title</Th>
                <Th>Format</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </DataTableHead>
              <DataTableBody>
                {history === null ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <Td colSpan={5}>
                        <div className="h-4 w-full animate-pulse rounded bg-mist/60" />
                      </Td>
                    </tr>
                  ))
                ) : history.length === 0 ? (
                  <TableEmptyState
                    colSpan={5}
                    icon={<ClockCounterClockwise size={20} />}
                    title="No reports generated yet"
                    description="Reports you generate will show up here, ready to download again without re-running them."
                  />
                ) : (
                  history.map((row) => {
                    const type = getReportType(row.report_type);
                    return (
                      <tr key={row.id}>
                        <Td className="font-medium text-ink">{type?.title ?? row.report_type}</Td>
                        <Td>
                          <StatusPill tone={row.format === "pdf" ? "danger" : "info"}>{row.format.toUpperCase()}</StatusPill>
                        </Td>
                        <Td className="text-muted">
                          {new Date(row.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </Td>
                        <Td>
                          <StatusPill tone="success">Complete</StatusPill>
                        </Td>
                        <Td align="right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label="Report actions"
                                disabled={downloadingId === row.id}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink disabled:opacity-50"
                              >
                                <DotsThreeVertical size={16} weight="bold" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 border-gray-300">
                              {row.format === "pdf" && (
                                <DropdownMenuItem onClick={() => void handleView(row)} className="gap-2 text-ink focus:text-ink">
                                  <ArrowSquareOut size={14} className="text-muted" />
                                  View report
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => void handleDownload(row)} className="gap-2 text-ink focus:text-ink">
                                <DownloadSimple size={14} className="text-muted" />
                                Download {row.format.toUpperCase()}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </DataTableBody>
            </DataTable>
          </TableCard>
        )}
      </div>
    </>
  );
}
