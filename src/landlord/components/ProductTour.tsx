import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { useAuth } from "../AuthContext";

type Step = {
  target: string; // matches an element's [data-tour="..."] attribute, or "" for a centered step
  title: string;
  body: string;
  to?: string; // navigate here before showing this step, so its target is on-screen
};

const STEPS: Step[] = [
  {
    target: "",
    title: "Welcome to your dashboard.",
    body: "This is your daily view — rent collected, what's outstanding, and anything that needs your attention today.",
  },
  {
    target: "setup-checklist",
    title: "Pick up where you left off.",
    body: "This checklist tracks what's left to set up. Nothing here is required to use the app — it's just a reminder, and it disappears once you're done (or you can dismiss it any time).",
    to: "/dashboard",
  },
  {
    target: "nav-rooms",
    title: "Set up your rooms.",
    body: "Add room types with their rent and deposit terms, then the individual rooms fill in underneath.",
  },
  {
    target: "nav-tenants",
    title: "Add your tenants.",
    body: "One at a time, or import a whole spreadsheet at once.",
  },
  {
    target: "nav-rent",
    title: "Track rent here.",
    body: "See who's paid, who's overdue, and log payments as they come in.",
  },
  {
    target: "nav-settings",
    title: "Configure the details.",
    body: "Late fees, payout accounts, invoicing — all the fine print lives here whenever you're ready for it.",
  },
];

const STORAGE_PREFIX = "instay-tour-seen-";

function useTargetRect(selector: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // Off-screen (e.g. the mobile nav drawer is closed) — treat as unavailable.
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return;
      }
      setRect(r);
    };
    measure();
    window.addEventListener("resize", measure);
    const id = window.setInterval(measure, 300); // catches layout settling (drawer open, fonts, etc.)
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(id);
    };
  }, [selector]);

  return rect;
}

function TourStep({ step, index, total, onNext, onBack, onSkip }: {
  step: Step;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const rect = useTargetRect(step.target);
  const isLast = index === total - 1;
  const centered = !step.target || !rect;

  const tooltipStyle: React.CSSProperties = centered
    ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
    : {
        top: Math.min(rect!.bottom + 12, window.innerHeight - 220),
        left: Math.min(Math.max(rect!.left, 16), window.innerWidth - 336),
      };

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-ink/30" onClick={onSkip} aria-hidden="true" />

      {rect && (
        <motion.div
          layoutId="tour-ring"
          className="pointer-events-none fixed z-[101] rounded-lg ring-2 ring-brand ring-offset-2 ring-offset-transparent"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="fixed z-[102] w-80 rounded-lg border border-line bg-paper p-4 shadow-card"
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-ink">{step.title}</p>
          <button
            type="button"
            onClick={onSkip}
            aria-label="Skip tour"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
        <p className="mt-1.5 text-[13px] text-muted">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted">
            {index + 1} of {total}
          </span>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button type="button" onClick={onBack} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink">
                Back
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              className="rounded-lg bg-brand px-3.5 py-1.5 text-[12px] font-medium text-paper transition-transform hover:scale-[1.02]"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/** A short, skippable spotlight tour shown once per account on first arrival at the dashboard —
 * the lighter alternative to a forced onboarding flow: land in a working dashboard first, then
 * point out the handful of things worth knowing about. */
export default function ProductTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const key = STORAGE_PREFIX + user.id;
    if (window.localStorage.getItem(key) === "1") return;
    // Let the dashboard's first paint settle before spotlighting anything on it.
    const id = window.setTimeout(() => setStepIndex(0), 600);
    return () => window.clearTimeout(id);
  }, [user]);

  const finish = () => {
    if (user) window.localStorage.setItem(STORAGE_PREFIX + user.id, "1");
    setStepIndex(null);
  };

  if (stepIndex === null) return null;
  const step = STEPS[stepIndex];

  const goTo = (next: number) => {
    const target = STEPS[next];
    if (target.to) navigate(target.to);
    setStepIndex(next);
  };

  return (
    <AnimatePresence>
      <TourStep
        key={stepIndex}
        step={step}
        index={stepIndex}
        total={STEPS.length}
        onNext={() => (stepIndex === STEPS.length - 1 ? finish() : goTo(stepIndex + 1))}
        onBack={() => goTo(Math.max(0, stepIndex - 1))}
        onSkip={finish}
      />
    </AnimatePresence>
  );
}
