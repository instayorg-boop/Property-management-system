import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIso(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** A drop-in replacement for `<input type="date">` with the same `value`/`onChange(string)`
 * contract (YYYY-MM-DD) — the native picker renders wildly differently per browser/OS and doesn't
 * match the rest of the app's chrome, so every date field uses this instead. */
export default function DatePicker({
  value,
  onChange,
  className = "",
  placeholder = "Select date",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());

  const openPicker = () => {
    setViewMonth(selected ?? new Date());
    setOpen(true);
  };

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells: (Date | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-paper px-3 py-2.5 text-left text-sm outline-none transition-colors focus:border-brand ${className}`}
      >
        <span className={selected ? "text-ink" : "text-muted"}>
          {selected ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : placeholder}
        </span>
        <CalendarBlank size={15} weight="bold" className="shrink-0 text-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-full left-0 z-20 mt-1.5 w-64 rounded-lg border border-line bg-paper p-3 shadow-card"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                  aria-label="Previous month"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
                >
                  <CaretLeft size={13} weight="bold" />
                </button>
                <span className="text-sm font-semibold text-ink">
                  {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <button
                  type="button"
                  onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                  aria-label="Next month"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
                >
                  <CaretRight size={13} weight="bold" />
                </button>
              </div>

              <div className="mt-2.5 grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-muted">
                {WEEKDAYS.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
                {cells.map((day, i) => {
                  if (!day) return <span key={i} />;
                  const isSelected = selected && sameDay(day, selected);
                  const isToday = sameDay(day, today);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onChange(toIso(day));
                        setOpen(false);
                      }}
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        isSelected
                          ? "bg-brand font-semibold text-paper"
                          : isToday
                            ? "font-semibold text-brand hover:bg-mist"
                            : "text-ink hover:bg-mist"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
