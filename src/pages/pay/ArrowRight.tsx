/** Same mark as BackArrow, mirrored — a real stroke-drawn chevron instead of a plain "→" glyph,
 * so the portal's link arrows look intentional rather than a text placeholder. */
export default function ArrowRight({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
