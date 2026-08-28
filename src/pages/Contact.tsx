import PageShell from "../components/PageShell";

export default function Contact() {
  return (
    <PageShell
      eyebrow="Contact"
      title="Talk to us."
      subtitle="Questions about pricing, onboarding, or moving from another system — we'll get back to you within a day."
      showCta={false}
    >
      <form className="mx-auto max-w-lg space-y-3 rounded-2xl border border-line p-6 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-1 block text-[11px] font-medium text-muted">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              placeholder="Your name"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-[11px] font-medium text-muted">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="you@property.co"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
            />
          </div>
        </div>

        <div>
          <label htmlFor="message" className="mb-1 block text-[11px] font-medium text-muted">
            Message
          </label>
          <textarea
            id="message"
            required
            rows={5}
            placeholder="How can we help?"
            className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-brand py-2.5 text-[13px] font-medium text-paper transition-transform hover:scale-[1.01]"
        >
          Send message
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Or email us directly at{" "}
        <a href="mailto:hello@instay.app" className="font-medium text-ink underline-offset-2 hover:underline">
          hello@instay.app
        </a>
      </p>
    </PageShell>
  );
}
