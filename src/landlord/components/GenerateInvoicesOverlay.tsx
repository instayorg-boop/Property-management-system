import { useEffect, useMemo, useRef, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import JSZip from "jszip";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft as BackIcon,
  PencilSimple as EditIcon,
  DownloadSimple as DownloadIcon,
  CaretDown as CaretDownIcon,
  PaperPlaneTilt as SendIcon,
  Buildings as InstitutionIcon,
  Receipt as ReceiptIcon,
} from "@phosphor-icons/react";
import { useTenants, formatCurrency, type Tenant } from "../TenantsContext";
import { useSettings } from "../SettingsContext";
import { useInvoices, type InvoiceStatus } from "../InvoicesContext";
import InvoicePDF, { type InvoiceDocData } from "./InvoicePDF";
import Pagination, { DEFAULT_PAGE_SIZE } from "./Pagination";
import {
  slugify,
  calcTenantInvoice,
  computeInvoiceDates,
  isDueSoonOrPast,
  sendInvoiceViaWhatsApp,
  type TenantInvoiceCalc,
} from "../invoiceUtils";

type Row =
  | { kind: "individual"; calc: TenantInvoiceCalc }
  | { kind: "institution"; institution: string; calcs: TenantInvoiceCalc[]; total: number };

function fileSafe(name: string) {
  return name.replace(/\s+/g, "");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Inline review panel shown in place of the Rent page's normal content — this app deals with
 * a table's worth of tenants at a time, so a dense table reads better here than an overlay of cards. */
export default function GenerateInvoicesOverlay({
  periodDate,
  periodLabel,
  onCancel,
  onSent,
}: {
  periodDate: Date;
  periodLabel: string;
  onCancel: () => void;
  onSent: (count: number) => void;
}) {
  const { tenants } = useTenants();
  const { propertyName, propertyAddress, landlordName, landlordPhone, dueDay, dailyPenaltyRate, paymentMethods } = useSettings();
  const { recordInvoice, hasSentInvoiceForPeriod } = useInvoices();

  const [groupByInstitution, setGroupByInstitution] = useState(false);
  const [rentOverrides, setRentOverrides] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [busy, setBusy] = useState<"send" | "download-pdf" | "download-zip" | null>(null);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!downloadMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setDownloadMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [downloadMenuOpen]);

  const activeTenants = useMemo(() => tenants.filter((t) => t.active), [tenants]);

  const calcs = useMemo(
    () => activeTenants.map((t) => calcTenantInvoice(t, periodDate, dailyPenaltyRate, rentOverrides[t.id])),
    [activeTenants, periodDate, dailyPenaltyRate, rentOverrides]
  );

  const rows: Row[] = useMemo(() => {
    if (!groupByInstitution) return calcs.map((calc) => ({ kind: "individual" as const, calc }));

    const groups = new Map<string, TenantInvoiceCalc[]>();
    const individuals: TenantInvoiceCalc[] = [];
    for (const c of calcs) {
      if (c.tenant.institution) {
        const list = groups.get(c.tenant.institution) ?? [];
        list.push(c);
        groups.set(c.tenant.institution, list);
      } else {
        individuals.push(c);
      }
    }
    const groupRows: Row[] = Array.from(groups.entries()).map(([institution, list]) => ({
      kind: "institution" as const,
      institution,
      calcs: list,
      total: list.reduce((sum, c) => sum + c.total, 0),
    }));
    return [...groupRows, ...individuals.map((calc) => ({ kind: "individual" as const, calc }))];
  }, [calcs, groupByInstitution]);

  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const paymentLink = `pay.instay.co/${slugify(propertyName)}`;

  const buildDocForRow = (row: Row, invoiceNumber: string): InvoiceDocData => {
    const { issueDate, dueDate } = computeInvoiceDates(periodDate, dueDay);
    const shared = {
      invoiceNumber,
      issueDateLabel: issueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      dueDateLabel: dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      dueDateIsUrgent: isDueSoonOrPast(dueDate),
      propertyName,
      landlordName,
      propertyAddress,
      landlordPhone,
      periodLabel,
      paymentLink,
      dailyPenaltyRate,
      paymentMethods,
    };

    if (row.kind === "individual") {
      return {
        ...shared,
        billToName: row.calc.tenant.name,
        billToSubline: `${row.calc.tenant.room} · ${propertyName}`,
        billToPhone: row.calc.tenant.phone,
        lineItems: row.calc.lineItems,
        total: row.calc.total,
      };
    }
    return {
      ...shared,
      billToName: row.institution,
      billToSubline: `${row.calcs.length} tenant${row.calcs.length === 1 ? "" : "s"} · ${propertyName}`,
      lineItems: row.calcs.map((c) => ({ label: `${c.tenant.room} — ${c.tenant.name}`, amount: c.total })),
      total: row.total,
    };
  };

  /** Records the invoice (assigning it a real sequential number) and builds the matching PDF data. */
  const recordRow = (row: Row, status: InvoiceStatus) => {
    const { issueDate, dueDate } = computeInvoiceDates(periodDate, dueDay);
    const tenantIds = row.kind === "individual" ? [row.calc.tenant.id] : row.calcs.map((c) => c.tenant.id);
    const invoice = recordInvoice({
      tenantId: tenantIds[0],
      tenantIds: row.kind === "institution" ? tenantIds : undefined,
      institutionName: row.kind === "institution" ? row.institution : undefined,
      amount: row.kind === "individual" ? row.calc.total : row.total,
      period: periodLabel,
      issuedAt: issueDate.toISOString(),
      dueAt: dueDate.toISOString(),
      status,
    });
    return { invoice, doc: buildDocForRow(row, invoice.invoiceNumber), tenantIds };
  };

  const rowFileLabel = (row: Row) => (row.kind === "individual" ? row.calc.tenant.name : row.institution);
  const monthYearLabel = periodDate.toLocaleDateString("en-US", { month: "long" }) + "-" + periodDate.getFullYear();

  const downloadOne = async (row: Row) => {
    const { doc } = recordRow(row, "downloaded");
    const blob = await pdf(<InvoicePDF invoices={[doc]} />).toBlob();
    downloadBlob(blob, `Invoice-${fileSafe(rowFileLabel(row))}-${monthYearLabel}.pdf`);
  };

  const downloadAllSinglePdf = async () => {
    setBusy("download-pdf");
    try {
      const docs = rows.map((row) => recordRow(row, "downloaded").doc);
      const blob = await pdf(<InvoicePDF invoices={docs} />).toBlob();
      downloadBlob(blob, `Invoices-${monthYearLabel}.pdf`);
    } finally {
      setBusy(null);
      setDownloadMenuOpen(false);
    }
  };

  const downloadAllZip = async () => {
    setBusy("download-zip");
    try {
      const zip = new JSZip();
      for (const row of rows) {
        const { doc } = recordRow(row, "downloaded");
        const blob = await pdf(<InvoicePDF invoices={[doc]} />).toBlob();
        zip.file(`Invoice-${fileSafe(rowFileLabel(row))}-${monthYearLabel}.pdf`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `Invoices-${monthYearLabel}.zip`);
    } finally {
      setBusy(null);
      setDownloadMenuOpen(false);
    }
  };

  const sendAll = async () => {
    setBusy("send");
    try {
      let tenantsCovered = 0;
      for (const row of rows) {
        const { invoice, tenantIds } = recordRow(row, "sent");
        const primaryTenant: Tenant = row.kind === "individual" ? row.calc.tenant : row.calcs[0].tenant;
        await sendInvoiceViaWhatsApp(primaryTenant, invoice);
        tenantsCovered += tenantIds.length;
      }
      onSent(tenantsCovered);
    } finally {
      setBusy(null);
    }
  };

  const startEditingRent = (tenantId: string, currentRent: number) => {
    setRentOverrides((prev) => (tenantId in prev ? prev : { ...prev, [tenantId]: currentRent }));
    setEditingId(tenantId);
  };

  return (
    <div className="space-y-4">
      {/* Back link — its own line, not crowding the title */}
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <BackIcon size={13} weight="bold" />
        Back to Rent
      </button>

      {/* Title + institution toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            Generate invoices for {periodLabel}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {rows.length} invoice{rows.length === 1 ? "" : "s"} · {activeTenants.length} tenant
            {activeTenants.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3.5 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={groupByInstitution}
            onClick={() => {
              setGroupByInstitution((v) => !v);
              setPage(1);
            }}
            className={`relative h-5.5 w-10 shrink-0 rounded-full transition-colors ${groupByInstitution ? "bg-brand" : "bg-line"}`}
          >
            <span
              className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-paper shadow transition-transform ${
                groupByInstitution ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <InstitutionIcon size={15} weight="duotone" className="text-muted" />
          <span className="text-sm font-medium text-ink">Group by institution</span>
        </div>
      </div>

      {/* Actions — up top, next to the data they act on, not buried below a long table */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={sendAll}
          disabled={busy !== null || rows.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-6 py-2.5 text-sm font-medium text-paper transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
        >
          <SendIcon size={14} weight="bold" />
          {busy === "send" ? "Sending…" : "Send all"}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setDownloadMenuOpen((v) => !v)}
            disabled={busy !== null || rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist disabled:opacity-50"
          >
            <DownloadIcon size={14} weight="bold" />
            {busy === "download-pdf" || busy === "download-zip" ? "Preparing…" : "Download all"}
            <CaretDownIcon size={12} weight="bold" />
          </button>
          <AnimatePresence>
            {downloadMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 z-10 mt-2 w-64 overflow-hidden rounded-lg border border-line bg-paper shadow-card"
              >
                <button
                  type="button"
                  onClick={downloadAllSinglePdf}
                  className="block w-full px-3.5 py-2.5 text-left text-sm text-ink hover:bg-mist"
                >
                  Download as single PDF
                  <span className="block text-xs text-muted">All invoices combined, one per page</span>
                </button>
                <button
                  type="button"
                  onClick={downloadAllZip}
                  className="block w-full border-t border-line px-3.5 py-2.5 text-left text-sm text-ink hover:bg-mist"
                >
                  Download as ZIP
                  <span className="block text-xs text-muted">Individual PDF files, one per tenant</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-mist"
        >
          Cancel
        </button>
      </div>

      {/* Invoice table */}
      <div className="rounded-lg border border-line">
        {/* Mobile: cards — an HTML table doesn't have room to breathe on a phone screen */}
        <div className="divide-y divide-line md:hidden">
          {pageRows.map((row) => {
            if (row.kind === "institution") {
              return (
                <div key={row.institution} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <InstitutionIcon size={14} weight="duotone" className="shrink-0 text-muted" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{row.institution}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">{row.calcs.map((c) => c.tenant.room).join(", ")}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadOne(row)}
                      aria-label={`Download invoice for ${row.institution}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
                    >
                      <DownloadIcon size={15} weight="bold" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                    <span className="text-xs text-muted">
                      {row.calcs.length} tenant{row.calcs.length === 1 ? "" : "s"} combined
                    </span>
                    <span className="text-sm font-semibold text-ink">{formatCurrency(row.total)}</span>
                  </div>
                </div>
              );
            }

            const { calc } = row;
            const t = calc.tenant;
            const isEditing = editingId === t.id;
            const alreadySent = hasSentInvoiceForPeriod(t.id, periodLabel);

            return (
              <div key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{t.room}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {calc.isProrata && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Pro-rata</span>
                    )}
                    {alreadySent && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                        Invoice sent
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  {isEditing ? (
                    <input
                      autoFocus
                      type="number"
                      min={0}
                      value={rentOverrides[t.id] ?? calc.rentAmount}
                      onChange={(e) => setRentOverrides((prev) => ({ ...prev, [t.id]: Number(e.target.value) || 0 }))}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                      className="w-24 rounded-lg border border-line px-2 py-1 text-right text-sm outline-none focus:border-brand"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-ink">{formatCurrency(calc.total)}</span>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => (isEditing ? setEditingId(null) : startEditingRent(t.id, calc.rentAmount))}
                      aria-label={`Edit rent amount for ${t.name}`}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-mist ${
                        isEditing ? "text-brand" : "text-muted hover:text-ink"
                      }`}
                    >
                      <EditIcon size={14} weight="duotone" />
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadOne(row)}
                      aria-label={`Download invoice for ${t.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
                    >
                      <DownloadIcon size={15} weight="bold" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {pageRows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                <ReceiptIcon size={22} weight="duotone" />
              </span>
              <p className="text-xs font-semibold text-ink">No active tenants to invoice</p>
            </div>
          )}
        </div>

        {/* Desktop / tablet: table */}
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-mist text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{groupByInstitution ? "Institution / Tenant" : "Tenant"}</th>
              <th className="px-4 py-3 font-medium">Room</th>
              <th className="px-4 py-3 font-medium">Notes</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              if (row.kind === "institution") {
                return (
                  <tr key={row.institution} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <InstitutionIcon size={14} weight="duotone" className="text-muted" />
                        {row.institution}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{row.calcs.map((c) => c.tenant.room).join(", ")}</td>
                    <td className="px-4 py-3 text-muted">
                      {row.calcs.length} tenant{row.calcs.length === 1 ? "" : "s"} combined
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{formatCurrency(row.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => downloadOne(row)}
                        aria-label={`Download invoice for ${row.institution}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
                      >
                        <DownloadIcon size={15} weight="bold" />
                      </button>
                    </td>
                  </tr>
                );
              }

              const { calc } = row;
              const t = calc.tenant;
              const isEditing = editingId === t.id;
              const alreadySent = hasSentInvoiceForPeriod(t.id, periodLabel);

              return (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                  <td className="px-4 py-3 text-muted">{t.room}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {calc.isProrata && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Pro-rata</span>
                      )}
                      {alreadySent && (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                          Invoice sent
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        value={rentOverrides[t.id] ?? calc.rentAmount}
                        onChange={(e) => setRentOverrides((prev) => ({ ...prev, [t.id]: Number(e.target.value) || 0 }))}
                        onBlur={() => setEditingId(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingId(null)}
                        className="w-24 rounded-lg border border-line px-2 py-1 text-right text-sm outline-none focus:border-brand"
                      />
                    ) : (
                      <span className="font-semibold text-ink">{formatCurrency(calc.total)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingId(null) : startEditingRent(t.id, calc.rentAmount))}
                        aria-label={`Edit rent amount for ${t.name}`}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-mist ${
                          isEditing ? "text-brand" : "text-muted hover:text-ink"
                        }`}
                      >
                        <EditIcon size={14} weight="duotone" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadOne(row)}
                        aria-label={`Download invoice for ${t.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
                      >
                        <DownloadIcon size={15} weight="bold" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                      <ReceiptIcon size={22} weight="duotone" />
                    </span>
                    <p className="text-xs font-semibold text-ink">No active tenants to invoice</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        {rows.length > 0 && (
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            pageSize={rowsPerPage}
            totalItems={rows.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setRowsPerPage(size);
              setPage(1);
            }}
          />
        )}
      </div>
    </div>
  );
}
