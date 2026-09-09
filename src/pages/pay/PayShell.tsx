import type { ReactNode } from "react";

export type PayStep = "balance" | "method" | "pay" | "done";

const STEPS: { key: PayStep; label: string }[] = [
  { key: "balance", label: "Balance" },
  { key: "method", label: "Method" },
  { key: "pay", label: "Pay" },
  { key: "done", label: "Done" },
];

/** Stripe-style atmospheric gradient mesh — cream / sherbet / lavender / indigo / ruby blobs
 * washed across the upper band. Pure decoration behind the card, so it's inert to pointer events. */
function GradientMesh() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden" aria-hidden>
      <div className="absolute -inset-x-10 -top-32 h-96 blur-3xl opacity-70 [background:radial-gradient(38%_55%_at_15%_20%,#f5e9d4_0%,transparent_70%),radial-gradient(35%_50%_at_45%_0%,#9b6829_0%,transparent_65%),radial-gradient(45%_60%_at_75%_25%,#665efd_0%,transparent_70%),radial-gradient(35%_45%_at_95%_10%,#ea2261_0%,transparent_70%),radial-gradient(50%_60%_at_55%_45%,#533afd_0%,transparent_75%)]" />
    </div>
  );
}

export default function PayShell({
  propertyName,
  step,
  children,
}: {
  propertyName: string;
  /** Omit to hide the progress rail (used for the tenant-search and maintenance screens). */
  step?: PayStep;
  children: ReactNode;
}) {
  const activeIndex = step ? STEPS.findIndex((s) => s.key === step) : -1;

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <GradientMesh />
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-6">
        <div className="flex items-center justify-center">
          <img src="https://cdn.brandfetch.io/idkuvXnjOH/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Instay" className="h-6" />
        </div>
        <p className="mt-1.5 text-center text-xs font-medium text-[#61718a]">{propertyName}</p>

        {activeIndex >= 0 && (
          <div className="mt-6 flex items-center gap-1.5 px-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={`h-1 w-full rounded-full transition-colors ${
                    i <= activeIndex ? "bg-[#533afd]" : "bg-[#e3e8ee]"
                  }`}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: i <= activeIndex ? "#0d253d" : "#64748d" }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex-1 rounded-lg bg-white p-5 shadow-lg ">
          {children}
        </div>

       
      </div>
    </div>
  );
}
