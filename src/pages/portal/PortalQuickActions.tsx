import { useEffect, useRef, useState } from "react";
import { Wrench, ClockCounterClockwise } from "@phosphor-icons/react";
import { ActionTile } from "./portalUi";

const HIGHLIGHT_MS = 2700; // three pulses of p-tile-pulse

/**
 * The "Report a problem" / "Payment history" tiles, plus a floating "Report a problem" button
 * that stays at the bottom of the screen while the tiles are scrolled out of view. The tiles sit
 * low on the page (below the balance and tenancy details), so tenants were missing them — the
 * button scrolls down to them and pulses the report tile, rather than skipping straight to the
 * form, so the tenant also learns where it lives for next time.
 */
export default function PortalQuickActions({ token }: { token: string }) {
  const tilesRef = useRef<HTMLDivElement>(null);
  const [tilesInView, setTilesInView] = useState(true);
  const [highlight, setHighlight] = useState(false);
  const highlightTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = tilesRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setTilesInView(entry.isIntersecting), { threshold: 0.6 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const showTiles = () => {
    tilesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Restart the pulse even if it's mid-animation from a previous tap.
    setHighlight(false);
    window.clearTimeout(highlightTimer.current);
    requestAnimationFrame(() => {
      setHighlight(true);
      highlightTimer.current = window.setTimeout(() => setHighlight(false), HIGHLIGHT_MS);
    });
  };

  return (
    <>
      <div ref={tilesRef} className="mt-4 flex gap-3">
        <ActionTile
          to={`/p/${token}/maintenance`}
          icon={<Wrench size={18} weight="regular" />}
          label="Report a problem"
          highlight={highlight}
        />
        <ActionTile to={`/p/${token}/history`} icon={<ClockCounterClockwise size={18} weight="regular" />} label="Payment history" />
      </div>

      <button
        type="button"
        onClick={showTiles}
        data-shown={!tilesInView}
        aria-hidden={tilesInView}
        tabIndex={tilesInView ? -1 : 0}
        className="p-fab fixed left-1/2 z-40 flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold"
        style={{
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          background: "var(--p-accent)",
          color: "#fff",
          boxShadow: "0 6px 16px -6px rgba(30, 58, 138, 0.4)",
        }}
      >
        <Wrench size={15} weight="bold" />
        Report a problem
      </button>
    </>
  );
}
