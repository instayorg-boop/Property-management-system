import type { ReactNode } from "react";
import Nav from "./Nav";
import Footer from "./Footer";
import CTABanner from "./CTABanner";

export default function PageShell({
  eyebrow,
  title,
  subtitle,
  children,
  showCta = true,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  showCta?: boolean;
}) {
  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main>
        <section className="px-6 pt-16 pb-10 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            {eyebrow && (
              <p className="text-[11px] font-semibold tracking-widest text-brand uppercase">{eyebrow}</p>
            )}
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
            {subtitle && <p className="mx-auto mt-4 max-w-xl text-muted">{subtitle}</p>}
          </div>
        </section>

        {children && <section className="mx-auto max-w-4xl px-6 pb-16">{children}</section>}

        {showCta && <CTABanner />}
      </main>
      <Footer />
    </div>
  );
}
