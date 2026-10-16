import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Circle, X, ArrowRight } from "@phosphor-icons/react";
import { useTenants } from "../TenantsContext";
import { useSettings } from "../SettingsContext";
import { useOnboarding } from "../useOnboarding";

const BEDS = [
  { value: "Up to 80 beds", tier: "Starter" },
  { value: "81 to 299 beds", tier: "Growth" },
  { value: "300+ beds", tier: "Enterprise" },
];
const TYPES = ["Student housing", "Apartments", "Rooms or boarding house", "Other"];
const COLLECT = ["Cash", "Mobile money", "Bank transfer", "A mix"];

function Chips({ options, value, onPick }: { options: string[]; value?: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o;
        return (
          <motion.button
            key={o}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => onPick(o)}
            className={`rounded-md border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              on ? "border-white bg-white text-brand" : "border-white/30 text-white hover:bg-white/10"
            }`}
          >
            {o}
          </motion.button>
        );
      })}
    </div>
  );
}

function BedTiles({ value, onPick }: { value?: string; onPick: (v: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {BEDS.map((b) => {
        const on = value === b.value;
        return (
          <motion.button
            key={b.value}
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onPick(b.value)}
            className={`rounded-md border p-3.5 text-left transition-colors ${
              on ? "border-white bg-white text-brand" : "border-white/30 text-white hover:bg-white/10"
            }`}
          >
            <span className={`block text-[11px] font-semibold uppercase tracking-wide ${on ? "text-brand/70" : "text-white/60"}`}>{b.tier}</span>
            <span className="mt-0.5 block font-display text-[15px] font-semibold">{b.value}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** Ordered "what's next" card. Tenants come first because that's where value starts. Each step
 * reflects real state where it can; the rest are remembered in settings.onboarding. */
export default function SetupChecklist() {
  const navigate = useNavigate();
  const { tenants } = useTenants();
  const { propertyId, landlordPhone, notificationPhone, lencoConnected, bankName, autopilotEnabled, propertyType, setPropertyType } = useSettings();
  const { state, update } = useOnboarding(propertyId);

  const [stepOverride, setStepOverride] = useState<number | null>(null);
  const steps = state?.steps ?? {};
  const mark = (k: string) => update((s) => ({ ...s, steps: { ...s.steps, [k]: true } }));

  const items = useMemo(() => {
    const hasTenants = tenants.length > 0;
    const list = [
      { key: "tenants", label: "Add your tenants", detail: "Import a spreadsheet, or add them one by one.", done: hasTenants, actions: [{ label: "Import", to: "/tenants?import=1" }, { label: "Add one", to: "/tenants/new" }] },
      { key: "dueDay", label: "Confirm your rent due day", detail: "Set to the 1st of each month. Change it if yours differs.", done: Boolean(steps.dueDay), actions: [{ label: "Check", to: "/settings/rent", mark: "dueDay" }] },
      { key: "alertPhone", label: "Add a phone for alerts", detail: "Where we text you about payments and problems.", done: Boolean((notificationPhone || landlordPhone).trim()), actions: [{ label: "Add", to: "/settings/sms" }] },
      { key: "payout", label: "Connect a payout account", detail: "So collected rent reaches you.", done: lencoConnected || Boolean(bankName.trim()), actions: [{ label: "Connect", to: "/online-payments" }] },
      { key: "firstLink", label: "Send your first payment link", detail: "Tenants pay from their phone, you get the money.", done: Boolean(steps.firstLink), actions: [{ label: "Open tenants", to: "/tenants", mark: "firstLink" }] },
    ];
    if (hasTenants && tenants.length >= 5 || steps.firstLink) {
      list.push({ key: "autopilot", label: "Turn on Autopilot", detail: "Reminders and follow-ups sent for you.", done: autopilotEnabled, actions: [{ label: "Turn on", to: "/settings/autopilot" }] });
    }
    return list;
  }, [tenants.length, steps.dueDay, steps.firstLink, notificationPhone, landlordPhone, lencoConnected, bankName, autopilotEnabled]);

  if (!state || state.dismissed) return null;
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;
  const next = items.find((i) => !i.done)!;

  const a = state.answers ?? {};
  const askQuestions = !a.units || !a.rentCollection || !propertyType;
  const firstOpen = !a.units ? 0 : !propertyType ? 1 : 2;
  const qStep = stepOverride ?? firstOpen;
  const advance = (n: number) => window.setTimeout(() => setStepOverride(n > 2 ? null : n), 220);

  const nudge =
    next.key === "firstLink" && tenants.length > 0
      ? "Your tenants are in. Next, send them their payment link."
      : next.key === "autopilot"
        ? "You're set. Turn on Autopilot and reminders go out on their own."
        : null;

  return (
    <motion.div
      data-tour="setup-checklist"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`rounded-md p-5 sm:p-6 ${askQuestions ? "bg-brand text-white shadow-lg shadow-brand/20" : "border border-line border-t-2 border-t-brand bg-paper"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`${askQuestions ? "font-display text-lg text-white" : "text-sm text-ink"} font-semibold`}>{askQuestions ? "Let's set up your property" : "Get set up"}</p>
          <p className={`mt-0.5 text-xs ${askQuestions ? "text-white/70" : "text-muted"}`}>
            {askQuestions ? `Question ${Math.min(qStep + 1, 3)} of 3. It takes 20 seconds.` : nudge ?? `${doneCount} of ${items.length} done. Nothing is blocked until you're ready.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => update((s) => ({ ...s, dismissed: true }))}
          aria-label="Dismiss setup checklist"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${askQuestions ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-muted hover:bg-mist hover:text-ink"}`}
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {askQuestions ? (
        <div className="mt-5">
          <div className="mb-4 flex gap-1.5">
            {[0, 1, 2].map((n) => (
              <motion.span key={n} animate={{ opacity: n <= qStep ? 1 : 0.3 }} className="h-1 flex-1 rounded-full bg-white" />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={qStep}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
            >
              {qStep === 0 && (
                <>
                  <p className="mb-3 text-[15px] font-medium">How many beds do you manage?</p>
                  <BedTiles value={a.units} onPick={(v) => { update((s) => ({ ...s, answers: { ...s.answers, units: v } })); advance(1); }} />
                </>
              )}
              {qStep === 1 && (
                <>
                  <p className="mb-3 text-[15px] font-medium">What kind of property is it?</p>
                  <Chips options={TYPES} value={propertyType || undefined} onPick={(v) => { setPropertyType(v); advance(2); }} />
                </>
              )}
              {qStep === 2 && (
                <>
                  <p className="mb-3 text-[15px] font-medium">How do tenants pay you today?</p>
                  <Chips options={COLLECT} value={a.rentCollection} onPick={(v) => { update((s) => ({ ...s, answers: { ...s.answers, rentCollection: v } })); advance(3); }} />
                </>
              )}
            </motion.div>
          </AnimatePresence>
          {qStep > 0 && (
            <button type="button" onClick={() => setStepOverride(qStep - 1)} className="mt-4 text-xs font-semibold text-white/70 hover:text-white">
              Back
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-mist">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(doneCount / items.length) * 100}%` }} />
          </div>
          <div className="mt-4 space-y-1.5">
            {items.map((item) => {
              const isNext = item === next;
              return (
                <div key={item.key} className={`flex items-center gap-3 rounded-md border p-3 ${isNext ? "border-brand/40 bg-brand-soft/40" : "border-line"} ${item.done ? "bg-mist/40" : ""}`}>
                  {item.done ? <CheckCircle size={20} weight="fill" className="shrink-0 text-emerald-600" /> : <Circle size={20} className="shrink-0 text-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-medium ${item.done ? "text-muted line-through" : "text-ink"}`}>{item.label}</p>
                    {!item.done && <p className="truncate text-[11px] text-muted">{item.detail}</p>}
                  </div>
                  {!item.done && (
                    <div className="flex shrink-0 gap-1.5">
                      {item.actions.map((act) => (
                        <button
                          key={act.label}
                          type="button"
                          onClick={() => {
                            if ("mark" in act && act.mark) mark(act.mark);
                            navigate(act.to);
                          }}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${isNext ? "bg-brand text-white" : "border border-line text-ink hover:bg-mist"}`}
                        >
                          {act.label}
                          {isNext && <ArrowRight size={12} weight="bold" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}
