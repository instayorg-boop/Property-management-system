import { Link, Navigate, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import CTABanner from "../components/CTABanner";
import { featureDetails } from "../data/features";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-brand" strokeWidth={2}>
      <circle cx="10" cy="10" r="8.5" strokeOpacity="0.35" />
      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FeatureDetail() {
  const { slug } = useParams();
  const feature = featureDetails.find((f) => f.slug === slug);

  if (!feature) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main>
        <section className="px-6 pt-16 pb-6 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold tracking-widest text-brand uppercase">{feature.navLabel}</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{feature.title}</h1>
            <p className="mx-auto mt-4 max-w-xl text-muted">{feature.desc}</p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-16">
          <div className={`overflow-hidden rounded-3xl bg-linear-to-br p-10 sm:p-16 ${feature.gradient}`}>
            <div className="mx-auto max-w-sm rounded-xl border border-white/60 bg-white p-5 shadow-lg">
              <p className="text-xs font-medium text-ink">{feature.panelLabel}</p>
              <div className="mt-4 h-32 rounded-lg bg-mist" />
            </div>
          </div>

          <ul className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            {feature.points.map((p) => (
              <li key={p} className="flex items-start gap-2 rounded-xl border border-line px-4 py-3 text-sm text-ink/80">
                <CheckIcon />
                {p}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {featureDetails.map((f) => (
              <Link
                key={f.slug}
                to={`/features/${f.slug}`}
                className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                  f.slug === feature.slug ? "bg-ink text-paper" : "border border-line text-muted hover:text-ink"
                }`}
              >
                {f.navLabel}
              </Link>
            ))}
          </div>
        </section>

        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
