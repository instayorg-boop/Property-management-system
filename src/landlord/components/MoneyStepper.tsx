import { useEffect, useRef } from "react";
import { Minus, Plus } from "@phosphor-icons/react";

/** Kwacha amount control: − / + buttons that step by `step` (hold to repeat, speeding up), with the
 * figure in the middle still editable by hand. Compact on purpose — not a full-width input. */
export default function MoneyStepper({
  value,
  onChange,
  step = 100,
  min = 0,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  className?: string;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => stop, []);

  const bump = (dir: 1 | -1, n: number) => {
    const next = Math.max(min, valueRef.current + dir * step * (n > 12 ? 5 : 1));
    onChange(next);
    valueRef.current = next;
  };
  const start = (dir: 1 | -1) => {
    bump(dir, 0);
    let n = 0;
    const tick = () => {
      n += 1;
      bump(dir, n);
      timer.current = window.setTimeout(tick, n > 12 ? 60 : 120);
    };
    timer.current = window.setTimeout(tick, 400);
  };

  const btn =
    "flex w-11 shrink-0 items-center justify-center text-muted transition-colors hover:bg-line/40 hover:text-ink active:scale-95 disabled:opacity-40";
  return (
    <div className={`flex w-full max-w-[280px] items-stretch overflow-hidden rounded-lg bg-mist ${className}`}>
      <button
        type="button"
        aria-label={`Decrease by ${step}`}
        disabled={value <= min}
        onPointerDown={() => start(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        className={btn}
      >
        <Minus size={16} weight="bold" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value === 0 ? "" : String(value)}
        placeholder="0"
        onChange={(e) => onChange(Math.max(min, Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
        className="w-full min-w-0 bg-transparent py-2.5 text-center text-base font-semibold tabular-nums text-ink outline-none"
      />
      <button
        type="button"
        aria-label={`Increase by ${step}`}
        onPointerDown={() => start(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        className={btn}
      >
        <Plus size={16} weight="bold" />
      </button>
    </div>
  );
}
