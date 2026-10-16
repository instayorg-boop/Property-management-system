import { motion } from "framer-motion";

/** Base shimmer block — compose from this or use the shaped helpers below. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton rounded-md ${className}`} style={style} aria-hidden="true" />;
}

/** A line of text, e.g. a label or value. */
export function SkeletonText({ width = "100%", className = "" }: { width?: string; className?: string }) {
  return <Skeleton className={`h-3.5 rounded ${className}`} style={{ width }} />;
}

/**
 * Cross-fades between a skeleton and real content once `ready` flips true, with no layout jump —
 * matches the Apple/Airbnb pattern of skeletons shaped like the final content rather than a spinner.
 */
export function SkeletonSwap({
  ready,
  skeleton,
  children,
}: {
  ready: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      key={ready ? "content" : "skeleton"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {ready ? children : skeleton}
    </motion.div>
  );
}

/** Skeleton row matching a table row of stat cells — used for tenant/rent tables. */
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr className="border-b border-line/60">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full max-w-[10rem]" />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton card matching the stat/summary cards used on Dashboard and Rent. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-paper p-5 shadow-card ${className}`}>
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="h-7 w-32" />
    </div>
  );
}

/** Staggered entrance for a list of skeleton rows/cards — small per-item delay feels alive, not jarring. */
export function SkeletonList({ count = 3, render }: { count?: number; render: (i: number) => React.ReactNode }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.04 }}
        >
          {render(i)}
        </motion.div>
      ))}
    </>
  );
}

/** Small inline spinner for buttons/inline actions — never full-page. */
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Table-shaped loading block: header bars plus `rows` body rows (pass the page size). */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper" aria-hidden="true">
      <div className="flex gap-4 border-b border-line px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-line px-4 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={`h-3 flex-1 ${j === 0 ? "max-w-[160px]" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Stat-tile row loading block matching the 2 / 4 column tile grid. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line bg-paper px-5 py-[18px]">
          <Skeleton className="mb-2 h-8 w-16" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Generic page-shaped placeholder (header, tiles, table) shown in the dashboard content area
 * while a lazily loaded page's code downloads — the page's own skeletons take over once it mounts. */
export function SkeletonPage() {
  return (
    <div className="min-h-full bg-paper" aria-hidden="true">
      <div className="px-4 pt-5 pb-6 sm:px-8">
        <Skeleton className="mb-2 h-6 w-40" />
        <SkeletonText width="18rem" />
      </div>
      <div className="flex flex-col gap-6 px-4 sm:px-8">
        <SkeletonTiles />
        <SkeletonTable />
      </div>
    </div>
  );
}
