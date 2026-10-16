import { useEffect, useState, type ReactNode } from "react";

// Inline styles + one <style> tag only (no Tailwind classes), so this renders correctly even if
// it paints before the app stylesheet. Colors mirror the @theme tokens in index.css; the white
// background matches the PWA manifest's background_color, so the installed app's OS splash hands
// off to this screen without a color jump.
const BRAND = {
  // Same symbol as the landing-page nav, served locally (and precached by the PWA, see
  // includeAssets in vite.config) so it shows instantly and offline.
  logo: "/Instay_Manage_Logo-removebg-preview.png",
  bg: "#ffffff",
  accent: "#1e3a8a", // --color-brand
  track: "#dde2ea", // --color-line
};

/** How long the loader stays up at minimum once the dashboard starts mounting behind it. The app
 * is usually ready in a blink, so without this the screen just flickers; holding it briefly lets
 * the dashboard's data load underneath, so it's revealed already filled in. */
export const MIN_VISIBLE_MS = 1000;
const FADE_MS = 250;

const SPIN_CSS = `
@keyframes instay-spin { to { transform: rotate(360deg); } }
.instay-spinner { animation: instay-spin 0.7s linear infinite; }
@media (prefers-reduced-motion: reduce) { .instay-spinner { animation-duration: 2.4s; } }
`;

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <>
      <style>{SPIN_CSS}</style>
      <div
        className="instay-spinner"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid ${BRAND.track}`,
          borderTopColor: BRAND.accent,
        }}
      />
    </>
  );
}

/** Full-screen branded loader. Rendered by the auth guard, the sign-in redirect and the root
 * Suspense boundary — always the same component in the same position, so the hand-offs between
 * them read as one continuous loading screen. Not for data loading; pages use skeletons. */
export default function LoadingScreen({ fading = false }: { fading?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.bg,
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: fading ? "none" : undefined,
      }}
    >
      <img src={BRAND.logo} alt="" width={53} height={64} style={{ display: "block" }} />
      <div style={{ marginTop: 28 }}>
        <Spinner />
      </div>
    </div>
  );
}

/** Keeps the loader over `children` for at least MIN_VISIBLE_MS after mount, then fades it out.
 * `children` render (and fetch their data) underneath the whole time. */
export function MinimumLoadingScreen({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"shown" | "fading" | "gone">("shown");

  useEffect(() => {
    const fade = window.setTimeout(() => setPhase("fading"), MIN_VISIBLE_MS);
    const remove = window.setTimeout(() => setPhase("gone"), MIN_VISIBLE_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, []);

  return (
    <>
      {children}
      {phase !== "gone" && <LoadingScreen fading={phase === "fading"} />}
    </>
  );
}
