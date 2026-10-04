import { useEffect, useState } from "react";

/**
 * A one-shot confetti burst for the payment-success screen.
 *
 * Pure CSS on ~70 absolutely-positioned rectangles — no canvas, no library, no rAF loop, so it
 * costs nothing on the mid-range Android phones most tenants pay from and it can't keep the page
 * busy after it finishes.
 *
 * Three things it deliberately does:
 *  - It is `position: fixed` over the whole viewport at a z-index above the page, so pieces fall
 *    past the receipt card rather than being trapped (and painted under) the header box.
 *  - Pieces are emitted continuously across EMIT_WINDOW_MS rather than all at once, so it reads as
 *    falling confetti for about three seconds instead of one instant puff.
 *  - The whole layer fades out and then unmounts, leaving no fixed overlay sitting on top of the
 *    page afterwards.
 *
 * The global prefers-reduced-motion rule in portalUi.tsx collapses the animation to nothing, which
 * is the right outcome — the success state never depends on the confetti to be legible.
 */

const COLORS = ["#12B76A", "#F79009", "#2E90FA", "#F04438", "#FDB022", "#7A5AF8"];
const PIECES = 70;
/** How long new pieces keep being released for. */
const EMIT_WINDOW_MS = 2200;
/** When the layer starts fading, and when it stops existing. */
const FADE_AT_MS = 3400;
const REMOVE_AT_MS = 4200;

type Piece = {
  id: number;
  left: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  width: number;
  height: number;
  radius: string;
};

export default function Confetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);

  // Seeded in an effect, not during render: Math.random() in a render body makes the component
  // impure, and under StrictMode's double render it would deal two different bursts. Running once
  // on mount also means a parent re-render can never re-shuffle pieces mid-flight.
  useEffect(() => {
    setPieces(
      Array.from({ length: PIECES }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * (EMIT_WINDOW_MS / 1000),
        duration: 2.6 + Math.random() * 1.4,
        drift: (Math.random() - 0.5) * 160,
        spin: 180 + Math.random() * 720,
        width: 6 + Math.random() * 5,
        height: 9 + Math.random() * 7,
        radius: Math.random() > 0.7 ? "50%" : "1px",
      }))
    );
    const fadeTimer = window.setTimeout(() => setFading(true), FADE_AT_MS);
    const removeTimer = window.setTimeout(() => setDone(true), REMOVE_AT_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (done) return null;

  return (
    <div className={`confetti-layer${fading ? " is-fading" : ""}`} aria-hidden="true">
      <style>{`
        .confetti-layer {
          position: fixed;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          /* Above the page's cards — the previous absolute layer was clipped to the header box and
             painted beneath the receipt card that follows it in the DOM. */
          z-index: 60;
          opacity: 1;
          transition: opacity 700ms ease;
        }
        .confetti-layer.is-fading { opacity: 0; }
        .confetti-piece {
          position: absolute;
          top: -28px;
          opacity: 0;
          animation-name: confetti-fall;
          animation-timing-function: cubic-bezier(0.3, 0.5, 0.5, 1);
          animation-fill-mode: forwards;
          animation-iteration-count: 1;
          will-change: transform, opacity;
        }
        @keyframes confetti-fall {
          0%   { opacity: 0; transform: translate3d(0, -10px, 0) rotate(0deg); }
          8%   { opacity: 1; }
          85%  { opacity: 1; }
          100% { opacity: 0; transform: translate3d(var(--drift), 105vh, 0) rotate(var(--spin)); }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              width: p.width,
              height: p.height,
              background: p.color,
              borderRadius: p.radius,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
