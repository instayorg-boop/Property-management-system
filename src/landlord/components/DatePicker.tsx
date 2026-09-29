import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
 * match the rest of the app's chrome. Built on shadcn's `Popover` (no `calendar` primitive exists
 * in this repo yet, so the grid itself is hand-built here, token-compliant). */
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
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setViewMonth(selected ?? new Date());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm outline-none transition-colors focus:border-primary",
            className
          )}
        >
          <span className={selected ? "text-foreground" : "text-muted-foreground"}>
            {selected ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : placeholder}
          </span>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-xl border-border bg-card p-3 shadow-md">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            aria-label="Previous month"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <ChevronLeftIcon className="size-3.5" />
          </button>
          <span className="text-sm font-semibold text-foreground">
            {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            aria-label="Next month"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <ChevronRightIcon className="size-3.5" />
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-muted-foreground">
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
                className={cn(
                  "mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  isSelected
                    ? "bg-primary font-semibold text-primary-foreground"
                    : isToday
                      ? "font-semibold text-primary hover:bg-surface-muted"
                      : "text-foreground hover:bg-surface-muted"
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
