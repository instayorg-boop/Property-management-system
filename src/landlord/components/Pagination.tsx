import Select from "./Select";

export const PAGE_SIZE_OPTIONS = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 50;

/** Shared table footer — rows-per-page picker, page buttons, and a "go to page" jump. Used by every paginated table so behavior stays consistent. */
export default function Pagination({
  page,
  pageCount,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        Rows per page
        <Select
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          className="w-20 py-1.5 text-xs"
        />
        <span className="hidden sm:inline">· {totalItems} total</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
              page === p ? "bg-ink text-paper" : "text-muted hover:bg-mist"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm text-muted">
        Go to page
        <input
          type="number"
          min={1}
          max={pageCount}
          value={page}
          onChange={(e) => onPageChange(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))}
          className="w-14 rounded-lg border border-line px-2 py-1 text-center text-sm text-ink outline-none focus:border-brand"
        />
      </div>
    </div>
  );
}
