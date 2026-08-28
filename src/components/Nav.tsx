import { Link } from "react-router-dom";

const links = [
  { label: "Product", to: "/" },
  { label: "How it works", to: "/how-it-works" },
  { label: "Reports", to: "/features/reports" },
  { label: "Pricing", to: "/pricing" },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="https://rkrdixplbwmjsk8r.public.blob.vercel-storage.com/avatar/cmpz1r4np000004l1qxouaobk-1782814353578.jpg" alt="Instay Manage" className="h-10 " />
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          {links.map((l) => (
            <Link key={l.label} to={l.to} className="transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/sign-in" className="hidden text-sm font-medium text-muted transition-colors hover:text-ink sm:block">
            Sign in
          </Link>
          <Link
            to="/get-started"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-paper transition-transform hover:scale-[1.02]"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
