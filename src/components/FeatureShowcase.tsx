import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-brand" strokeWidth={2}>
      <circle cx="10" cy="10" r="8.5" strokeOpacity="0.35" />
      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M3.5 8h9M8.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Panel({
  gradient,
  label,
  children,
  className = "",
}: {
  gradient: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-linear-to-br p-8 ${gradient} ${className}`}>
      <div className="w-full max-w-sm rounded-2xl border border-white/60 bg-white p-6 shadow-lg">
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

type Feature = {
  gradient: string;
  panelLabel: string;
  visual: ReactNode;
  title: string;
  desc: string;
  points: string[];
  link: string;
  slug: string;
};

const rentRows = [
  { l: "B. Phiri", v: "K950", s: "Overdue", c: "bg-red-50 text-red-600" },
  { l: "A. Mwansa", v: "K1,200", s: "Paid", c: "bg-emerald-50 text-emerald-600" },
  { l: "C. Banda", v: "K1,100", s: "Partial", c: "bg-amber-50 text-amber-600" },
];

const staffRows = [
  { l: "J. Tembo", v: "07:58 – 17:02" },
  { l: "M. Kunda", v: "08:04 – 17:31" },
  { l: "P. Zulu", v: "07:55 – 16:58" },
];

const invoiceRows = [
  { l: "Room 12 — September rent", v: "K1,200" },
  { l: "Carried over from August", v: "K300" },
  { l: "Total due", v: "K1,500", strong: true },
];

const reminderRows = ["3 days before due, sent automatically", "Overdue — escalated to parent", "Receipt sent on WhatsApp"];

const roomColors = ["bg-emerald-200", "bg-emerald-200", "bg-slate-200", "bg-amber-200", "bg-emerald-200", "bg-red-200", "bg-emerald-200", "bg-slate-200"];

const reportBars = [40, 65, 50, 80, 60, 95, 70];

const features: Feature[] = [
  {
    gradient: "from-sky-100 via-sky-50 to-indigo-100",
    panelLabel: "Collect rent",
    visual: (
      <div className="space-y-2">
        {rentRows.map((r) => (
          <div key={r.l} className="flex items-center justify-between rounded-lg bg-mist px-2.5 py-1.5">
            <span className="text-[11px] text-muted">{r.l}</span>
            <span className="text-[11px] font-medium">{r.v}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${r.c}`}>{r.s}</span>
          </div>
        ))}
      </div>
    ),
    title: "Rent collection & payment tracking",
    desc: "Know exactly who's paid, across every room. No more matching mobile money names by hand or guessing what someone still owes from last month.",
    points: ["Mobile money payments matched to tenants automatically", "Partial payments and carried-over balances tracked", "Custom due date and grace period, per property"],
    link: "Learn about rent collection",
    slug: "rent-collection",
  },
  {
    gradient: "from-amber-100 via-orange-50 to-amber-50",
    panelLabel: "Staff attendance",
    visual: (
      <div className="space-y-2">
        {staffRows.map((r) => (
          <div key={r.l} className="flex items-center justify-between rounded-lg bg-mist px-2.5 py-1.5">
            <span className="text-[11px] text-muted">{r.l}</span>
            <span className="text-[11px] font-medium">{r.v}</span>
          </div>
        ))}
      </div>
    ),
    title: "Staff management & payroll",
    desc: "No more entering staff hours into a spreadsheet. Clock in and out on a shared tablet, and hours, overtime and pay calculate themselves.",
    points: ["Clock-in kiosk for the whole team", "Overtime calculated automatically", "Feeds straight into payroll, no re-entry"],
    link: "Learn about staff & payroll",
    slug: "payroll",
  },
  {
    gradient: "from-violet-100 via-purple-50 to-fuchsia-100",
    panelLabel: "Invoice",
    visual: (
      <div className="space-y-2">
        {invoiceRows.map((r) => (
          <div key={r.l} className="flex items-center justify-between rounded-lg bg-mist px-2.5 py-1.5">
            <span className="text-[11px] text-muted">{r.l}</span>
            <span className={`text-[11px] ${r.strong ? "font-semibold text-ink" : "font-medium"}`}>{r.v}</span>
          </div>
        ))}
      </div>
    ),
    title: "Invoicing",
    desc: "One invoice per tenant, generated for you. No more writing an invoice by hand for every tenant, every month — you just review and send.",
    points: ["Pre-filled invoices for every tenant", "Carried-over balances included automatically", "Review once, send all via WhatsApp"],
    link: "Learn about invoicing",
    slug: "invoicing",
  },
  {
    gradient: "from-rose-100 via-pink-50 to-orange-100",
    panelLabel: "Reminders & receipts",
    visual: (
      <div className="space-y-2">
        {reminderRows.map((t) => (
          <div key={t} className="flex items-center gap-2 rounded-lg bg-mist px-2.5 py-1.5 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            {t}
          </div>
        ))}
      </div>
    ),
    title: "Automated reminders & receipts",
    desc: "Stop calling tenants to remind them rent is due. Reminders and receipts go out on their own — to the tenant, or straight to a parent.",
    points: ["Reminders sent before and after the due date", "Escalates to a parent or guardian automatically", "Receipt sent the moment a payment lands"],
    link: "Learn about reminders",
    slug: "reminders",
  },
  {
    gradient: "from-emerald-100 via-lime-50 to-emerald-50",
    panelLabel: "Rooms - 92% occupied",
    visual: (
      <div className="grid grid-cols-4 gap-2">
        {roomColors.map((c, i) => (
          <div key={i} className={`aspect-square rounded-md ${c}`} />
        ))}
      </div>
    ),
    title: "Rooms & occupancy",
    desc: "Know which rooms are open, without checking a file. Room status updates live, so nothing gets double-booked by mistake.",
    points: ["Live status per room", "Move-ins and move-outs tracked", "Occupancy at a glance"],
    link: "Learn about rooms & occupancy",
    slug: "rooms-occupancy",
  },
  {
    gradient: "from-blue-100 via-sky-50 to-blue-50",
    panelLabel: "Monthly report",
    visual: (
      <div className="flex h-20 items-end gap-1.5">
        {reportBars.map((h, i) => (
          <div key={i} className="flex-1 rounded-sm bg-brand/70" style={{ height: `${h}%` }} />
        ))}
      </div>
    ),
    title: "Reports",
    desc: "Every report you need, ready to share. Collection rates, arrears, rent roll — branded and easy to hand to an owner.",
    points: ["Income and expenses, per property", "Arrears sorted by how overdue", "Share as PDF, email, or WhatsApp"],
    link: "Learn about reports",
    slug: "reports",
  },
];

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current">
      <path d="M4 2.8v10.4a.8.8 0 0 0 1.22.68l8.3-5.2a.8.8 0 0 0 0-1.36l-8.3-5.2A.8.8 0 0 0 4 2.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current">
      <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" />
    </svg>
  );
}

const SLIDE_MS = 5000;
const IDLE_BEFORE_AUTOPLAY_MS = 1200;

/** Height (in viewport-heights) of scroll track per feature — controls how much scrolling it takes to advance. */
const VH_PER_SLIDE = 0.85;
const STICKY_TOP_PX = 96;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const lastUserScrollRef = useRef(0);
  const autoScrollingRef = useRef(false);

  // Scroll-driven index: recompute on scroll/resize which slide is active.
  useEffect(() => {
    const onScroll = () => {
      const el = trackRef.current;
      if (!el) return;
      if (!autoScrollingRef.current) lastUserScrollRef.current = performance.now();

      const rect = el.getBoundingClientRect();
      const stickyHeight = window.innerHeight - STICKY_TOP_PX;
      const scrollable = rect.height - stickyHeight;
      if (scrollable <= 0) return;

      const progress = clamp(-rect.top / scrollable, 0, 1);
      const idx = Math.min(features.length - 1, Math.floor(progress * features.length));
      setActive(idx);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Idle autoplay: when the user hasn't scrolled recently, gently advance the page scroll.
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      const el = trackRef.current;
      if (!el) return;
      if (performance.now() - lastUserScrollRef.current < IDLE_BEFORE_AUTOPLAY_MS) return;

      const rect = el.getBoundingClientRect();
      const inView = rect.top < window.innerHeight * 0.8 && rect.bottom > 0;
      if (!inView) return;

      const stickyHeight = window.innerHeight - STICKY_TOP_PX;
      const scrollable = rect.height - stickyHeight;
      if (scrollable <= 0) return;

      const nextIndex = (active + 1) % features.length;
      const targetProgress = (nextIndex + 0.02) / features.length;
      const targetY = window.scrollY + rect.top + targetProgress * scrollable;

      autoScrollingRef.current = true;
      window.scrollTo({ top: targetY, behavior: "smooth" });
      window.setTimeout(() => {
        autoScrollingRef.current = false;
      }, 500);
    }, SLIDE_MS);
    return () => clearInterval(interval);
  }, [active, paused]);

  const jumpTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const stickyHeight = window.innerHeight - STICKY_TOP_PX;
    const scrollable = rect.height - stickyHeight;
    const targetProgress = (i + 0.02) / features.length;
    const targetY = window.scrollY + rect.top + targetProgress * scrollable;
    autoScrollingRef.current = true;
    window.scrollTo({ top: targetY, behavior: "smooth" });
    window.setTimeout(() => {
      autoScrollingRef.current = false;
    }, 500);
  };

  const current = features[active];

  return (
    <section id="product" className="py-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything you need, in one place.
          </h2>
          <p className="mt-3 text-muted">
            Rent, rooms, tenants and reports — all connected, so nothing gets lost
            between tools. Keep scrolling to see how each one works.
          </p>
        </div>
      </div>

      <div ref={trackRef} style={{ height: `${features.length * VH_PER_SLIDE * 100}vh` }} className="relative mt-14">
        <div className="sticky flex items-center" style={{ top: STICKY_TOP_PX, height: `calc(100vh - ${STICKY_TOP_PX}px)` }}>
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-10 px-6 lg:grid-cols-2 lg:gap-14">
            {/* Illustration side */}
            <div className="relative order-1 h-105 sm:h-120">
              <AnimatePresence initial={false}>
                <motion.div
                  key={current.slug}
                  initial={{ opacity: 0, scale: 0.94, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.05, filter: "blur(6px)" }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0"
                >
                  <Panel className="h-full rounded-2xl" gradient={current.gradient} label={current.panelLabel}>
                    {current.visual}
                  </Panel>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Text side */}
            <div className="relative order-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.slug}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="text-xs font-medium tracking-wide text-brand uppercase">
                    {String(active + 1).padStart(2, "0")} / {String(features.length).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                    {current.title}
                  </h3>
                  <p className="mt-3 text-base text-muted">{current.desc}</p>

                  <ul className="mt-5 space-y-2.5">
                    {current.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm text-ink/80">
                        <CheckIcon />
                        {p}
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={`/features/${current.slug}`}
                    className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand transition-colors hover:text-ink"
                  >
                    {current.link}
                    <ArrowIcon />
                  </Link>
                </motion.div>
              </AnimatePresence>

              <div className="mt-8 flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  {features.map((f, i) => (
                    <button
                      key={f.title}
                      type="button"
                      aria-label={`Go to ${f.title}`}
                      onClick={() => jumpTo(i)}
                      className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-brand" : "w-1.5 bg-line"}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line">
                    {paused ? <PlayIcon /> : <PauseIcon />}
                  </span>
                  {paused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
