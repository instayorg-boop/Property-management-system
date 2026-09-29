import { cn } from "cn";
import Select from "./Select";
import {
  Pagination as ShadcnPagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";

export const PAGE_SIZE_OPTIONS = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 50;

/** Shared table footer — rows-per-page picker, page buttons (shadcn `Pagination`), and a "go to
 * page" jump. Used by every paginated table so behavior stays consistent. When there's only one
 * page (or none), the page-button row and jump-to-page input step back to a minimal disabled
 * state instead of rendering a single broken-looking "1" button. */
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
  const hasMultiplePages = pageCount > 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        Rows per page
        <Select
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          className="w-20 py-1.5 text-xs"
        />
        <span className="hidden sm:inline">· {totalItems} total</span>
      </div>

      {hasMultiplePages ? (
        <ShadcnPagination className="mx-0 w-auto">
          <PaginationContent className="gap-1.5">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  href="#"
                  isActive={page === p}
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    onPageChange(p);
                  }}
                  className={cn(
                    "rounded-md",
                    page === p ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground"
                  )}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
          </PaginationContent>
        </ShadcnPagination>
      ) : (
        <span className="text-sm text-muted-foreground">Page 1 of 1</span>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        Go to page
        <Input
          type="number"
          min={1}
          max={pageCount}
          value={page}
          disabled={!hasMultiplePages}
          onChange={(e) => onPageChange(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))}
          className="h-8 w-14 rounded-md text-center"
        />
      </div>
    </div>
  );
}
