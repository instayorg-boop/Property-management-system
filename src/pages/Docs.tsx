import PageShell from "../components/PageShell";

const endpoints = [
  { method: "GET", path: "/v1/properties", desc: "List all properties in your account" },
  { method: "GET", path: "/v1/tenants", desc: "List tenants, with lease and balance info" },
  { method: "POST", path: "/v1/payments", desc: "Record a rent payment" },
  { method: "GET", path: "/v1/reports/collection", desc: "Fetch a collection-rate report" },
];

const methodColor: Record<string, string> = {
  GET: "bg-sky-50 text-sky-600",
  POST: "bg-emerald-50 text-emerald-600",
};

export default function Docs() {
  return (
    <PageShell
      eyebrow="API docs"
      title="Build on top of Instay."
      subtitle="A REST API for syncing properties, tenants, payments and reports with your own tools."
      showCta={false}
    >
      <div className="overflow-hidden rounded-2xl border border-line">
        {endpoints.map((e, i) => (
          <div
            key={e.path}
            className={`flex items-center gap-4 px-5 py-4 ${i !== endpoints.length - 1 ? "border-b border-line" : ""}`}
          >
            <span className={`w-14 shrink-0 rounded px-2 py-1 text-center text-[11px] font-semibold ${methodColor[e.method]}`}>
              {e.method}
            </span>
            <code className="shrink-0 font-mono text-sm text-ink">{e.path}</code>
            <span className="ml-auto hidden text-sm text-muted sm:block">{e.desc}</span>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        API access is available on the Growth and Portfolio plans.{" "}
        <a href="mailto:hello@instay.app" className="font-medium text-ink underline-offset-2 hover:underline">
          Request API keys
        </a>
      </p>
    </PageShell>
  );
}
