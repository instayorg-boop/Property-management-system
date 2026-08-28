import { Link } from "react-router-dom";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Tenants", to: "/features/tenants" },
      { label: "Rent collection", to: "/features/rent-collection" },
      { label: "Staff & payroll", to: "/features/payroll" },
      { label: "Reports", to: "/features/reports" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Careers", to: "/careers" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help center", to: "/help" },
      { label: "API docs", to: "/docs" },
      { label: "Status", to: "/status" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-line px-6 py-14">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-ink">
                <span className="font-display text-xs font-bold text-paper">I</span>
              </div>
              <span className="font-display text-sm font-semibold">Instay</span>
            </Link>
            <p className="mt-3 text-xs text-muted">One system for every property.</p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-medium text-ink">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-xs text-muted transition-colors hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 text-xs text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Instay. All rights reserved.</p>
          <p>Made for landlords and property managers.</p>
        </div>
      </div>
    </footer>
  );
}
