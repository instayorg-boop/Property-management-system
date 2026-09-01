import type { ReactNode } from "react";

export default function PayShell({ propertyName, children }: { propertyName: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">
      <div className="flex items-center justify-center">
        <img src="https://cdn.brandfetch.io/idkuvXnjOH/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Instay" className="h-6" />
      </div>
      <p className="mt-1 text-center text-xs text-muted">{propertyName}</p>

      <div className="mt-6 flex-1 rounded-lg border border-line bg-paper p-5 shadow-card">{children}</div>

      <p className="mt-6 text-center text-[11px] text-muted">Secured by Instay · Payments processed by Lenco</p>
    </div>
  );
}
