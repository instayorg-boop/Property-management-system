import type { ReactNode } from "react";

/** The header for a labeled block of content inside a drawer/page (e.g. "Emergency contacts",
 * "Room & rent") — bold and brand-colored so it reads as a section identity at a glance, not just
 * another muted caption. Distinct from a single input's field label, which stays small and muted. */
export default function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-bold tracking-wide text-brand uppercase ${className}`}>{children}</p>;
}
