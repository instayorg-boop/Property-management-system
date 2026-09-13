import type { ReactNode } from "react";
import PortalHeader from "./PortalHeader";
import PortalFooter from "./PortalFooter";

/** Minimal shell for the two edge-case screens that still use it (TenantBalance's "link not
 * found" / "couldn't load your account" states) — everything else in the portal renders its own
 * full page with PortalHeader/PortalFooter directly. Kept lean rather than the old gradient-mesh
 * + step-rail design so a dead-end screen still matches the rest of the portal's current look. */
export default function PayShell({ propertyName, children }: { propertyName?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PortalHeader propertyName={propertyName} />
      <div className="mx-auto w-full max-w-md flex-1 px-5 py-8">{children}</div>
      <PortalFooter />
    </div>
  );
}
