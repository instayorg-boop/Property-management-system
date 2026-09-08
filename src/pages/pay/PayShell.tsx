import type { ReactNode } from "react";
import { LockSimple } from "@phosphor-icons/react";

export type PayStep = "balance" | "method" | "pay" | "done";

const STEPS: { key: PayStep; label: string }[] = [
  { key: "balance", label: "Balance" },
  { key: "method", label: "Method" },
  { key: "pay", label: "Pay" },
  { key: "done", label: "Done" },
];

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
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">
        <div className="flex items-center justify-center">
          <img src="https://cdn.brandfetch.io/idkuvXnjOH/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Instay" className="h-6" />
        </div>
        <p className="mt-1 text-center text-xs font-medium text-muted">{propertyName}</p>

        {activeIndex >= 0 && (
          <div className="mt-5 flex items-center gap-1.5 px-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={`h-1.5 w-full rounded-full transition-colors ${
                    i <= activeIndex ? "bg-brand" : "bg-line"
                  }`}
                />
                <span className={`text-[10px] font-medium ${i <= activeIndex ? "text-ink" : "text-muted"}`}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex-1 rounded-lg border border-line  p-5 ">{children}</div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted">
          <LockSimple size={11} weight="fill" />
          Secured by Instay · Payments processed by Lenco
        </div>
      </div>
    </div>
  );
}
