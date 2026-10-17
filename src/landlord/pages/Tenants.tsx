import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import ConfirmDeleteTenantModal from "../components/ConfirmDeleteTenantModal";
import { useTenants, formatCurrency } from "../TenantsContext";
import {
  DotsThreeVertical,
  Trash,
  UsersThree,
  UploadSimple,
  Plus,
} from "@phosphor-icons/react";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import Button from "../components/Button";
import ImportTenantsModal from "../components/ImportTenantsModal";
import {
  TableCard,
  TableCardHeader,
  DataTable,
  DataTableHead,
  DataTableBody,
  Th,
  StatusPill,
} from "../components/DataTable";

/** "Moving in 1 Nov" when the tenant's move-in date is still in the future, else null. */
function movingInLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  if (new Date(d.getFullYear(), d.getMonth(), d.getDate()) <= new Date(now.getFullYear(), now.getMonth(), now.getDate())) return null;
  return `Moving in ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Tenants() {
  const { tenants, isReady, deleteTenant } = useTenants();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(() => new URLSearchParams(window.location.search).get("import") === "1");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "moved-out">("active");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  const deleting = tenants.find((t) => t.id === deletingId) ?? null;

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const q = query.trim().toLowerCase();
      const normalizedQuery = q.replace(/\s+/g, "");

      const matchesQuery =
        q.length === 0 ||
        t.name.toLowerCase().includes(q) ||
        t.room.toLowerCase().includes(q) ||
        t.phones.some((p) =>
          p.replace(/\s+/g, "").includes(normalizedQuery),
        );

      const matchesStatus = statusFilter === "active" ? t.active : !t.active;

      return matchesQuery && matchesStatus;
    });
  }, [tenants, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  return (
    <>
      {importOpen && <ImportTenantsModal onClose={() => setImportOpen(false)} />}
      <div className="min-h-full">
        {/* Page header */}
        <PageHeader
          title="Tenants"
          description="Everyone renting from you: see their rent status, contact details and unit, and open a profile to manage payments."
          actions={
            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => setImportOpen(true)}>
                <span className="inline-flex items-center gap-2"><UploadSimple size={16} weight="bold" />Import</span>
              </Button>
              <Button type="button" variant="primary" className="flex-1 sm:flex-none" onClick={() => navigate("/tenants/new")}>
                <span className="inline-flex items-center gap-2"><Plus size={16} weight="bold" />Add tenant</span>
              </Button>
            </div>
          }
        />
   

        <main className="px-4 pb-10 sm:px-8">
          <TableCard>
            <TableCardHeader>
              <div className="inline-flex gap-0.5 rounded-md bg-mist p-1">
                {(["active", "moved-out"] as const).map((tab) => {
                  const active = statusFilter === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setStatusFilter(tab);
                        setPage(1);
                        setOpenActionId(null);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active ? "border border-line bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
                      }`}
                    >
                      {tab === "active" ? "Active" : "Moved out"}
                    </button>
                  );
                })}
              </div>

              <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search tenants" className="w-full sm:w-[280px]" />
            </TableCardHeader>


          {/* Desktop table */}
          <div className="hidden overflow-visible md:block">
            <DataTable>
              <DataTableHead>
                <Th>Name</Th>
                <Th>Room</Th>
                <Th>Move-in date</Th>
                <Th>Rent</Th>
                <Th>Status</Th>
                <Th align="right" className="w-20">
                  Actions
                </Th>
              </DataTableHead>

              <DataTableBody>
                {!isReady &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} cols={6} />
                  ))}

                {isReady &&
                  pageRows.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tenants/${t.portalToken}`)}
                      className="group cursor-pointer"
                    >
                      <td className="px-4 py-3 align-middle">
                        <p className="text-sm font-medium text-brand underline decoration-1 underline-offset-2">
                          {t.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {t.phones[0] ?? "—"}
                        </p>
                      </td>

                      <td className="px-4 py-3 align-middle">
                        <p className="text-sm text-ink">{t.roomType}</p>
                        <p className="mt-0.5 text-xs text-muted">{t.room || "No unit"}</p>
                      </td>

                      <td className="px-4 py-3 align-middle text-sm text-muted">
                        {formatDisplayDate(t.moveInDate)}
                      </td>

                      <td className="font-display px-4 py-3 align-middle text-sm font-medium text-ink">
                        {formatCurrency(t.rentAmount)}
                      </td>

                      <td className="px-4 py-3 align-middle">
                        {t.active && movingInLabel(t.moveInDate) ? (
                          <StatusPill tone="info">{movingInLabel(t.moveInDate)}</StatusPill>
                        ) : (
                          <StatusPill tone={t.active ? "success" : "danger"}>
                            {t.active ? "Active" : "Moved out"}
                          </StatusPill>
                        )}
                      </td>

                      <td className="relative px-2 py-3 align-middle">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            aria-label={`Actions for ${t.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionId((id) => (id === t.id ? null : t.id));
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
                          >
                            <DotsThreeVertical size={20} weight="bold" />
                          </button>
                        </div>

                        {openActionId === t.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-3 top-10 z-20 w-40 rounded-lg border border-line bg-paper p-1.5 shadow-card"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionId(null);
                                navigate(`/tenants/${t.portalToken}`);
                              }}
                              className="w-full rounded-md px-2.5 py-2 text-left text-xs text-ink hover:bg-mist"
                            >
                              View details
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionId(null);
                                setDeletingId(t.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                            >
                              <Trash size={14} weight="duotone" />
                              Delete tenant
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}

                {isReady && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10">
                      <div className="flex flex-col items-center justify-center gap-2 text-center">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mist text-muted">
                          <UsersThree size={18} weight="duotone" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            {statusFilter === "active"
                              ? "No active tenants"
                              : "No moved-out tenants"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            Try a different search or tab.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </DataTableBody>
            </DataTable>
          </div>


          {/* Mobile cards — each tenant is its own bordered card (not just a hairline-divided
              list row), so it reads as a distinct, tappable item rather than blending into one
              continuous strip. */}
          <div className="space-y-3 p-3 md:hidden">
            {!isReady &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-line p-4">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}

            {isReady &&
              pageRows.map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/tenants/${t.portalToken}`)}
                  className="relative rounded-xl border border-line bg-paper p-4 transition-colors active:bg-mist/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-medium text-brand underline underline-offset-2">
                        {t.name}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {t.phones[0] ?? "—"}
                      </p>
                    </div>

                    <button
                      type="button"
                      aria-label={`Actions for ${t.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionId((id) => (id === t.id ? null : t.id));
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist"
                    >
                      <DotsThreeVertical size={24} weight="bold" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted">Room</p>
                      <p className="mt-1 text-ink">{t.room || "No unit"}</p>
                    </div>
                    <div>
                      <p className="text-muted">Move-in</p>
                      <p className="mt-1 text-ink">
                        {formatDisplayDate(t.moveInDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Rent</p>
                      <p className="mt-1 font-medium text-ink">
                        {formatCurrency(t.rentAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">Status</p>
                      <p className="mt-1">
                        {t.active && movingInLabel(t.moveInDate) ? (
                          <StatusPill tone="info">{movingInLabel(t.moveInDate)}</StatusPill>
                        ) : (
                          <StatusPill tone={t.active ? "success" : "danger"}>
                            {t.active ? "Active" : "Moved out"}
                          </StatusPill>
                        )}
                      </p>
                    </div>
                  </div>

                  {openActionId === t.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-10 top-14 z-20 w-44 rounded-lg border border-line bg-paper p-1.5 shadow-card"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenActionId(null);
                          navigate(`/tenants/${t.portalToken}`);
                        }}
                        className="w-full rounded-md px-3 py-2.5 text-left text-sm text-ink hover:bg-mist"
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenActionId(null);
                          setDeletingId(t.id);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash size={16} weight="duotone" />
                        Delete tenant
                      </button>
                    </div>
                  )}
                </div>
              ))}

            {isReady && pageRows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist text-muted">
                  <UsersThree size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {statusFilter === "active"
                      ? "No active tenants"
                      : "No moved-out tenants"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Try a different search or tab.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-line px-4 py-3">
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              pageSize={rowsPerPage}
              totalItems={filtered.length}
              onPageChange={(nextPage) => {
                setOpenActionId(null);
                setPage(nextPage);
              }}
              onPageSizeChange={(size) => {
                setRowsPerPage(size);
                setPage(1);
                setOpenActionId(null);
              }}
            />
          </div>
          </TableCard>
        </main>
      </div>

      <AnimatePresence>
        {deleting && (
          <ConfirmDeleteTenantModal
            tenant={deleting}
            onClose={() => setDeletingId(null)}
            onConfirm={() => {
              deleteTenant(deleting.id);
              setDeletingId(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
