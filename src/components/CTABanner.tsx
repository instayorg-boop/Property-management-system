import { Link } from "react-router-dom";

export default function CTABanner() {
  return (
    <section className="px-6 pb-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl px-8 py-16 text-center text-paper sm:py-20">
        <img
          src="https://images.unsplash.com/photo-1783621723306-29f6e894cabf?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-ink/75" />

        <div className="relative">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Serious about property management?
       
        </h2>
        <p className="mx-auto mt-3 max-w-md text-paper/60">
        Save more time & manage more units. See if Instay Manage is the right fit.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/get-started"
            className="w-full rounded-full bg-paper px-6 py-3 text-sm font-medium text-ink transition-transform hover:scale-[1.02] sm:w-auto"
          >
            Get started free
          </Link>
          <Link
            to="/contact"
            className="w-full rounded-full border border-paper/20 px-6 py-3 text-sm font-medium text-paper transition-colors hover:bg-paper/10 sm:w-auto"
          >
            Talk to us
          </Link>
        </div>
        </div>
      </div>
    </section>
  );
}
