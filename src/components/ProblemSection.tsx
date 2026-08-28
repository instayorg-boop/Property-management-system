import { useRef, useState } from "react";

function XIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 stroke-current" strokeWidth={2} fill="none">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 stroke-current" strokeWidth={2.25} fill="none">
      <path d="M3.5 8.2l3 3 6-6.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
      <path d="M5 3l-4 5 4 5M11 3l4 5-4 5" strokeWidth={0} />
    </svg>
  );
}

const rows = [
  { before: "Rent chased by hand on WhatsApp", after: "Auto-reminders and live arrears, per tenant" },
  { before: "Cash collected with no receipt", after: "Mobile money or cash, receipt sent instantly" },
  { before: "Bookkeeping in a notebook", after: "Live income vs expenses, per property" },
  { before: "Tenant records scattered across memory", after: "One ledger per tenant, deposits kept separate" },
  { before: "Room status is a guess", after: "Occupancy synced live, no double bookings" },
  { before: "Staff hours tracked on paper", after: "Clock-in kiosk, payroll calculated for you" },
  { before: "No record of who paid what", after: "Full payment history, month by month" },
  { before: "Reports built by hand for owners", after: "Branded PDF reports, one tap to share" },
];

function BeforePanel() {
  return (
    <div className="h-full bg-ink px-6 py-7 sm:px-8">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-paper/50">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-paper/10 text-paper/70">
          <XIcon />
        </span>
        BEFORE INSTAY
      </p>
      <h3 className="mt-3 font-display text-xl font-semibold text-paper">Running on disconnected tools.</h3>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.before} className="flex items-center gap-2.5 rounded-lg bg-paper/5 px-3 py-2.5">
            <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-paper/10 text-paper/60">
              <XIcon />
            </span>
            <span className="text-xs text-paper/70">{r.before}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-paper/40">
        Manual. Disconnected. Error-prone.
      </p>
    </div>
  );
}

function AfterPanel() {
  return (
    <div className="h-full bg-linear-to-br from-brand to-rose-600 px-6 py-7 sm:px-8">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-paper/80">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-paper/20 text-paper">
          <CheckIcon />
        </span>
        WITH INSTAY
      </p>
      <h3 className="mt-3 font-display text-xl font-semibold text-paper">One platform. Everything connected.</h3>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.after} className="flex items-center gap-2.5 rounded-lg bg-paper/10 px-3 py-2.5">
            <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-paper/25 text-paper">
              <CheckIcon />
            </span>
            <span className="text-xs font-medium text-paper">{r.after}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-paper/70">
        Automatic. Connected. Zero guesswork.
      </p>
    </div>
  );
}

function CompareSlider() {
  const [pct, setPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(96, Math.max(4, next)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    updateFromClientX(e.clientX);
  };

  const onPointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <div className="lg:hidden">
      <p className="mb-3 text-center text-[11px] font-medium tracking-wide text-muted">
        DRAG TO COMPARE →
      </p>
      <div
        ref={containerRef}
        className="relative touch-none overflow-hidden rounded-3xl select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <BeforePanel />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
          <AfterPanel />
        </div>

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-paper/80"
          style={{ left: `${pct}%` }}
        />
        <button
          type="button"
          aria-label="Drag to compare"
          onPointerDown={onPointerDown}
          className="absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-ink shadow-lg"
          style={{ left: `${pct}%` }}
        >
          <DragHandleIcon />
        </button>
      </div>
    </div>
  );
}

export default function ProblemSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Stop managing your properties
          <br />
          <span className="text-brand">across five disconnected tools.</span>
        </h2>
        <p className="mt-4 text-muted">
          Most landlords rely on WhatsApp, cash, a notebook and a spreadsheet to get
          through a single month. Instay connects everything into one system.
        </p>
      </div>

      <div className="mt-14">
        <CompareSlider />

        <div className="hidden overflow-hidden rounded-xl lg:grid lg:grid-cols-2">
          <BeforePanel />
          <AfterPanel />
        </div>
      </div>
    </section>
  );
}
