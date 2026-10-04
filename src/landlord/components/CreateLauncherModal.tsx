import { useEffect } from "react";
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

/** Opens from the left, next to the sidebar it's triggered from, and spans more than half the
 * screen so its grouped grid of every "create X" flow reads at a glance — a launcher, not a form,
 * so it deliberately doesn't reuse Modal/SlideOver's narrower centered/right-edge chrome.
 * Portaled to document.body for the same reason Modal/SlideOver are: Sidebar.tsx's own
 * translate-x-0/-translate-x-full transform would otherwise clip a `fixed` child to its box. */
export default function CreateLauncherModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

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
    <div className="fixed inset-0 z-50 flex">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-paper shadow-card"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-8 py-5">
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

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3">
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
