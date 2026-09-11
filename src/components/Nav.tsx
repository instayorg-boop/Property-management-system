import { Link } from "react-router-dom";

const links = [
  { label: "Product", to: "/" },
  { label: "How it works", to: "/how-it-works" },
  { label: "Reports", to: "/features/reports" },
  { label: "Pricing", to: "/pricing" },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-transparent backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png" alt="Instay Manage" className="h-10 " />
          <p className="font-sans text-white text-xl font-semibold leading-[1.08] tracking-[-0.02em]  ">Instay Manage</p>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-white md:flex">
          {links.map((l) => (
            <Link key={l.label} to={l.to} className="transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/sign-in" className="hidden text-sm font-medium text-white transition-colors hover:text-ink sm:block">
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
