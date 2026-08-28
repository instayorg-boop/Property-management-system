import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] opacity-70"
        style={{
          background:
            "radial-gradient(600px 300px at 50% -10%, rgba(20,83,45,0.10), transparent 60%)",
        }}
      />
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 pt-8 pb-16 lg:grid-cols-2 lg:gap-2 lg:pt-16 lg:pb-16">
        <div className="text-center lg:text-left">
          <h1 className="mx-auto max-w-5xl font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight sm:text-6xl lg:mx-0 lg:text-5xl">
            All in one property management system
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted sm:text-lg lg:mx-0">
            Accounting, rent collection, maintenance, staff, invoices and more, connected in one platform so your team can stop switching between multiple disconnected tools saving hours weekly.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Link
              to="/get-started"
              className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.02] sm:w-auto"
            >
              Get started free
            </Link>
            <Link
              to="/how-it-works"
              className="w-full rounded-lg border border-line px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-mist sm:w-auto"
            >
              Watch product tour
            </Link>
          </div>
        </div>

        {/* Product mock */}
        <div className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">
          <img
            src="https://framerusercontent.com/images/DO3QbDKULsSgR1e9sOw6NQAkyZQ.png?scale-down-to=2048&width=5559&height=3306"
            alt="Instay dashboard"
            className="w-full"
          />
        </div>
      </div>
    </section>
  );
}
