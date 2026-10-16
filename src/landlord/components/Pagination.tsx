import Select from "./Select";

export const PAGE_SIZE_OPTIONS = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 50;

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const set = new Set([1, pageCount, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

/** Shared table footer: rows-per-page picker, "Page N of M", windowed page buttons. Hidden when everything fits on the smallest page size. */
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
  if (pageCount <= 1 && totalItems <= PAGE_SIZE_OPTIONS[0]) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[12.5px]">
      <div className="flex items-center gap-2 text-muted">
        Rows per page
        <Select
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          className="h-8 w-20 py-0 text-xs"
        />
        <span className="hidden sm:inline">· {totalItems} total</span>
      </div>

      <span className="text-muted">
        Page {page} of {Math.max(pageCount, 1)}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {pageWindow(page, pageCount).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-[12.5px] font-semibold transition-colors ${
                page === p ? "bg-ink text-paper" : "text-muted hover:bg-mist"
              }`}
            >
              {p}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
