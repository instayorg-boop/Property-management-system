import { AnimatePresence, motion } from "framer-motion";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

function defaultLabel(monthOffset: number): string {
  if (monthOffset === 0) return "This month";
  return monthOffset < 0 ? "Past month" : "Upcoming month";
}

/** The month-navigation control used everywhere a page browses one month at a time (Accounting,
 * Rent, the Income vs Expenses and Owner Payout reports) — a small label over a large month name,
 * with prev/next as their own square buttons rather than a single inline "‹ September 2026 ›" pill. */
export default function MonthSwitcher({
  month,
  monthOffset,
  onPrev,
  onNext,
  onJumpToNow,
  label,
}: {
  month: string;
  monthOffset: number;
  onPrev: () => void;
  onNext: () => void;
  /** Omit to hide the "Back to this month" link entirely (e.g. read-only contexts). */
  onJumpToNow?: () => void;
  /** Defaults to "This month" / "Past month" / "Upcoming month" based on monthOffset — pass this
   * to override, but the label should almost always track the actual position being viewed. */
  label?: string;
}) {
  const resolvedLabel = label ?? defaultLabel(monthOffset);

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <AnimatePresence mode="wait">
          <motion.p
            key={resolvedLabel}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="text-xs font-semibold tracking-wide text-muted uppercase"
          >
            {resolvedLabel}
          </motion.p>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.p
            key={month}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-2xl font-bold tracking-tight text-ink"
          >
            {month}
          </motion.p>
        </AnimatePresence>
        {monthOffset !== 0 && onJumpToNow && (
          <button type="button" onClick={onJumpToNow} className="mt-0.5 text-xs font-medium text-brand hover:underline">
            Back to this month
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={monthOffset === 0}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-mist hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
