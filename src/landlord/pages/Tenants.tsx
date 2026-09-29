import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ConfirmDeleteTenantModal from "../components/ConfirmDeleteTenantModal";
import { useTenants, formatCurrency } from "../TenantsContext";
import {
  CaretDown,
  CaretUpDown,
  DotsThreeVertical,
  MagnifyingGlass,
  Trash,
  UsersThree,
} from "@phosphor-icons/react";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import tenantphoto from "../../assets/Tenant empty state UI.png";
import Button from "../components/Button";

function SearchIcon() {
  return <MagnifyingGlass size={22} weight="regular" />;
}

function SortCaret() {
  return <CaretUpDown size={16} weight="bold" className="text-[#96908b]" />;
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

const colors = {
  ink: "#1c1b1a",
  muted: "#6f6965",
  border: "#96908b",
  paper: "#ffffff",
  mist: "#faf8f7",
  teal: "#00535c",
  purple: "#ce63de",
  yellow: "#fac13d",
  red: "#c72e48",
  green: "#19af61",
};

export default function Tenants() {
  const { tenants, isReady, deleteTenant } = useTenants();
  const navigate = useNavigate();

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
      <div className="min-h-full bg-white text-[#1c1b1a]">
        {/* Page header */}
        <header className="flex flex-col gap-4 px-4 pb-0 pt-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12 lg:pt-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand">
            Tenants
          </h1>
          < Button
            type="button"
            variant="primary"
            onClick={() => navigate("/tenants/new")}
          >
            <span>Add tenant</span>
          </Button>
        </header>
   

        <main className="px-3 pb-10 pt-7 sm:px-8 lg:px-12">
          {/* Tabs (Condensed) */}
          <div className="border-b border-[#e7e4e2]">
            <div className="flex items-end gap-1 overflow-x-auto">
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
                    className={[
                      "relative min-w-fit px-4 pb-3 pt-1.5 text-[15px] font-medium transition-colors",
                      active
                        ? "text-[#1c1b1a]"
                        : "text-[#6f6965] hover:text-[#1c1b1a]",
                    ].join(" ")}
                  >
                    {tab === "active" ? "Active" : "Moved out"}
                    {active && (
                      <span
                        className="absolute inset-x-1 -bottom-px h-[3px] rounded-t-full bg-brand"
                        style={{ transition: "all 0.16s cubic-bezier(.45,1.08,.54,1)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
    

          {/* Search */}
          <div className="py-6">
            <label className="flex h-[40px] w-full max-w-[500px] items-center gap-2 rounded-md border border-[#96908b] bg-white px-3 text-[#6f6965] transition-colors focus-within:border-[#00535c] focus-within:ring-2 focus-within:ring-[#00535c]/10">
              <SearchIcon size={18} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search tenants"
                className="min-w-0 flex-1 bg-transparent text-[16px] font-normal tracking-[-0.01em] text-[#1c1b1a] outline-none placeholder:text-[#6f6965]"
              />
            </label>
          </div>
    

          {/* Desktop table */}
          <div className="hidden overflow-visible md:block">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-y border-[#96908b] bg-[#faf8f7]">
                  <th className="px-3 py-2 font-medium text-[#6f6965]">
                    <span className="inline-flex items-center gap-1.5">
                      Name
                     
                    </span>
                  </th>
                  <th className="px-3 py-2 font-medium text-[#6f6965]">
                    <span className="inline-flex items-center gap-1.5">
                      Room
                    
                    </span>
                  </th>
                  <th className="px-3 py-2 font-medium text-[#6f6965]">
                    <span className="inline-flex items-center gap-1.5">
                      Move-in date
                     
                    </span>
                  </th>
                  <th className="px-3 py-2 font-medium text-[#6f6965]">
                    <span className="inline-flex items-center gap-1.5">
                      Rent
                     
                    </span>
                  </th>
                  <th className="px-3 py-2 font-medium text-[#6f6965]">
                    Status
                  </th>
                  <th className="w-[70px] px-2 py-2 text-right font-medium text-[#6f6965]">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {!isReady &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} cols={6} />
                  ))}

                {isReady &&
                  pageRows.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tenants/${t.portalToken}`)}
                      className="group cursor-pointer border-b border-[#eee] transition-colors hover:bg-[#faf8f7]"
                    >
                      <td className="px-3 py-2 align-middle">
                        <p className="text-[15px] font-medium text-brand underline decoration-1 underline-offset-2">
                          {t.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[#6f6965]">
                          {t.phones[0] ?? "—"}
                        </p>
                      </td>

                      <td className="px-3 py-2 align-middle">
                        <p className="text-[15px] text-[#1c1b1a]">{t.roomType}</p>
                        <p className="mt-0.5 text-xs text-[#6f6965]">{t.room}</p>
                      </td>

                      <td className="px-3 py-2 align-middle text-[#1c1b1a]">
                        {formatDisplayDate(t.moveInDate)}
                      </td>

                      <td className="px-3 py-2 align-middle font-medium text-[#1c1b1a]">
                        {formatCurrency(t.rentAmount)}
                      </td>

                      <td className="px-3 py-2 align-middle">
                        <span className="inline-flex items-center gap-2 text-[#1c1b1a]">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: t.active
                                ? colors.green
                                : colors.red,
                            }}
                       
                          />
                          {t.active ? "Active" : "Moved out"}
                        </span>
                      </td>

                      <td className="relative px-2 py-2 align-middle">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            aria-label={`Actions for ${t.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionId((id) => (id === t.id ? null : t.id));
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-[#6f6965] transition-colors hover:bg-[#e7e4e2] hover:text-[#1c1b1a]"
                          >
                            <DotsThreeVertical size={20} weight="bold" />
                          </button>
                        </div>

                        {openActionId === t.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-3 top-10 z-20 w-40 rounded-[8px] border border-[#96908b] bg-white p-1.5 shadow-[0_4px_16px_rgba(28,27,26,0.10)]"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionId(null);
                                navigate(`/tenants/${t.portalToken}`);
                              }}
                              className="w-full rounded-md px-2.5 py-2 text-left text-xs text-[#1c1b1a] hover:bg-[#faf8f7]"
                            >
                              View details
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionId(null);
                                setDeletingId(t.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-[#c72e48] hover:bg-[#fff5f6]"
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
                    <td colSpan={6} className="px-3 py-10">
                      <div className="flex flex-col items-center justify-center gap-2 text-center">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#faf8f7] text-[#6f6965]">
                          <UsersThree size={18} weight="duotone" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-[#1c1b1a]">
                            {statusFilter === "active"
                              ? "No active tenants"
                              : "No moved-out tenants"}
                          </p>
                          <p className="mt-0.5 text-xs text-[#6f6965]">
                            Try a different search or tab.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
    

          {/* Mobile cards */}
          <div className="divide-y divide-[#96908b] md:hidden">
            {!isReady &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 py-5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}

            {isReady &&
              pageRows.map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/tenants/${t.portalToken}`)}
                  className="relative py-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-medium text-[#00535c] underline underline-offset-2">
                        {t.name}
                      </p>
                      <p className="mt-1 text-sm text-[#6f6965]">
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
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6f6965] hover:bg-[#faf8f7]"
                    >
                      <DotsThreeVertical size={24} weight="bold" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[#6f6965]">Room</p>
                      <p className="mt-1 text-[#1c1b1a]">{t.room}</p>
                    </div>
                    <div>
                      <p className="text-[#6f6965]">Move-in</p>
                      <p className="mt-1 text-[#1c1b1a]">
                        {formatDisplayDate(t.moveInDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#6f6965]">Rent</p>
                      <p className="mt-1 font-medium text-[#1c1b1a]">
                        {formatCurrency(t.rentAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#6f6965]">Status</p>
                      <p className="mt-1 inline-flex items-center gap-2 text-[#1c1b1a]">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: t.active
                              ? colors.yellow
                              : colors.red,
                          }}
                        />
                        {t.active ? "Active" : "Moved out"}
                      </p>
                    </div>
                  </div>

                  {openActionId === t.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-10 top-14 z-20 w-44 rounded-[10px] border border-[#96908b] bg-white p-1.5 shadow-[0_8px_24px_rgba(28,27,26,0.12)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenActionId(null);
                          navigate(`/tenants/${t.portalToken}`);
                        }}
                        className="w-full rounded-md px-3 py-2.5 text-left text-sm hover:bg-[#faf8f7]"
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenActionId(null);
                          setDeletingId(t.id);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-[#c72e48] hover:bg-[#fff5f6]"
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
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#faf8f7] text-[#6f6965]">
                  <UsersThree size={22} weight="duotone" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1c1b1a]">
                    {statusFilter === "active"
                      ? "No active tenants"
                      : "No moved-out tenants"}
                  </p>
                  <p className="mt-1 text-sm text-[#6f6965]">
                    Try a different search or tab.
                  </p>
                </div>
              </div>
            )}
          </div>

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
