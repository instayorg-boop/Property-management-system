import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { UsersThree, CreditCard, Receipt, Wrench, Coins, DoorOpen, X as CloseIcon } from "@phosphor-icons/react";

type CreateAction = { key: string; label: string; icon: PhosphorIcon; to: string };
type CreateGroup = { label: string; actions: CreateAction[] };

/** "Add staff" is deliberately excluded — its route is commented out in App.tsx, not live. */
const groups: CreateGroup[] = [
  {
    label: "People",
    actions: [{ key: "add-tenant", label: "Add tenant", icon: UsersThree, to: "/tenants/new" }],
  },
  {
    label: "Rooms",
    actions: [{ key: "add-room-type", label: "Add room type", icon: DoorOpen, to: "/rooms?action=add-room-type" }],
  },
  {
    label: "Tasks & maintenance",
    actions: [{ key: "add-maintenance", label: "Maintenance request", icon: Wrench, to: "/maintenance?action=add-request" }],
  },
  {
    label: "Payments",
    actions: [
      { key: "log-payment", label: "Log payment", icon: CreditCard, to: "/rent?action=log-payment" },
      { key: "add-expense", label: "Add expense", icon: Receipt, to: "/expense-tracker?action=add-expense" },
      { key: "add-payout-method", label: "Add payout method", icon: Coins, to: "/online-payments?action=add-recipient" },
    ],
  },
];

function useIsDesktop() {
  const query = "(min-width: 768px)";
  const [matches, setMatches] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(query).matches));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return matches;
}

/** From `md` up: opens from the left, next to the sidebar it's triggered from, and spans more
 * than half the screen so its grouped grid of every "create X" flow reads at a glance — a
 * launcher, not a form, so it deliberately doesn't reuse Modal/SlideOver's narrower centered/
 * right-edge chrome. Below `md`: there's no sidebar to open "next to", and a handful of short
 * menu rows forced to fill the whole phone screen just leaves a wall of empty space underneath
 * them — so it becomes a bottom sheet sized to its own content instead, sliding up rather than
 * in from the edge. Portaled to document.body for the same reason Modal/SlideOver are: Sidebar's
 * own transform would otherwise clip a `fixed` child to its box. */
export default function CreateLauncherModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={isDesktop ? { opacity: 0, x: -16 } : { y: "100%" }}
        animate={isDesktop ? { opacity: 1, x: 0 } : { y: 0 }}
        exit={isDesktop ? { opacity: 0, x: -16 } : { y: "100%" }}
        transition={isDesktop ? { duration: 0.22, ease: [0.22, 1, 0.36, 1] } : { type: "spring", damping: 30, stiffness: 300 }}
        className="relative flex h-full w-full flex-col overflow-hidden bg-paper shadow-card md:max-w-3xl"
        style={{ paddingBottom: isDesktop ? undefined : "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4 md:px-8 md:py-5">
          <h2 className="border-l-4 border-brand pl-3 font-display text-lg font-semibold tracking-tight text-ink uppercase">
            Create new
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <CloseIcon size={16} weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 md:px-8 md:py-6">
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-8">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="pb-3 text-[11px] font-semibold tracking-wide text-muted uppercase">{group.label}</p>
                <div className="space-y-3.5">
                  {group.actions.map(({ key, label, icon: Icon, to }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => go(to)}
                      className="flex w-full items-center gap-2.5 text-left text-sm text-ink transition-colors hover:text-brand"
                    >
                      <Icon size={17} weight="regular" className="shrink-0 text-muted" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
