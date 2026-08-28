const nodes = ["WhatsApp", "Lenco", "Mobile Money", "Email", "PDF Reports", "Instay Marketplace"];

export default function ConnectedSection() {
  return (
    <section className="relative overflow-hidden bg-ink text-paper">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(500px 260px at 50% 0%, rgba(20,83,45,0.35), transparent 65%)",
        }}
      />
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-paper/50">Connected stack</p>
        <h2 className="mx-auto mt-4 max-w-lg font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          All the tools you already use. None of the manual work.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-paper/60">
          Instay sits at the center, so a payment, a receipt and a report are always the
          same event — never three separate updates.
        </p>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
          {nodes.map((n) => (
            <span
              key={n}
              className="rounded-full border border-paper/15 bg-paper/5 px-4 py-2 text-sm text-paper/80 backdrop-blur-sm"
            >
              {n}
            </span>
          ))}
        </div>

        <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-paper px-5 py-2.5 text-sm font-medium text-ink">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-ink text-[10px] font-bold text-paper">
            I
          </div>
          Instay
        </div>
      </div>
    </section>
  );
}
