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
