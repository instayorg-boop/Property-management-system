import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Button from "../landlord/components/Button";

const links = [
  { label: "Pricing", to: "/pricing" },
  { label: "Features", to: "/" },
  { label: "Contact Us", to: "/how-it-works" },
  { label: "About", to: "/features/reports" },
];

export default function Nav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const textPrimary = isScrolled ? "text-slate-900" : "text-white";
  const linkBaseClasses =
    "transition-colors duration-300 px-1 py-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  const linkHoverClasses = isScrolled
    ? "hover:text-slate-900 hover:bg-slate-50"
    : "hover:bg-white/10";
  const linkTextColor = isScrolled ? "text-slate-600" : "text-white";

  const headerBg = isScrolled
    ? "bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-100"
    : "bg-transparent backdrop-blur-md";

  // For the hamburger icon, let's use a minimal SVG
  const HamburgerIcon = ({ open }: { open: boolean }) => (
    <button
      aria-label={open ? "Close Menu" : "Open Menu"}
      onClick={() => setMobileMenuOpen((prev) => !prev)}
      className={`md:hidden z-50 p-2 rounded transition-colors ${isScrolled ? "bg-slate-50 hover:bg-slate-100 text-slate-900" : "bg-white/10 hover:bg-white/20 text-white"}`}
      type="button"
    >
      <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      {open ? (
        // X icon
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
        </svg>
      ) : (
        // Hamburger menu icon
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      )}
    </button>
  );

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${headerBg}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <img
            src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png"
            alt="Instay Manage"
            className="h-10"
          />
          <p
            className={`font-sans text-xl font-semibold leading-[1.08] tracking-[-0.05em] transition-colors duration-300 ${textPrimary}`}
          >
            Instay Manage
          </p>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className={`${linkBaseClasses} ${linkTextColor} ${linkHoverClasses}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <Link
            to="/sign-in"
            className={`hidden sm:block text-sm font-medium transition-colors duration-300 ${linkBaseClasses} ${linkTextColor} ${linkHoverClasses}`}
          >
            Sign in
          </Link>
          <Button
            variant="primary"
            className="
              font-medium
          
              sm:px-8 
              sm:py-3.5 
              px-4
              py-2
              text-sm
              sm:text-base
              bg-[#0056D2] 
              hover:bg-[#0041A3] 
              text-white 
              shadow-sm 
              hover:shadow
              transition-all
            "
          >
            Book Free Demo
          </Button>
        </div>
      </div>
      
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden flex-col bg-white/95 backdrop-blur-md">
          <div className="flex justify-between items-center px-4 py-4 border-b border-slate-200">
            <Link to="/" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
              <img
                src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png"
                alt="Instay Manage"
                className="h-8"
              />
              <span className="font-semibold text-lg text-slate-900">Instay Manage</span>
            </Link>
            {/* Close button */}
            <HamburgerIcon open={true} />
          </div>
          <nav className="flex flex-col items-start gap-2 px-4 py-6">
            {links.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                className="block w-full py-2 text-base text-slate-700 font-medium rounded transition-colors hover:bg-slate-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <Link
              to="/sign-in"
              className="block w-full py-2 text-base text-slate-700 font-medium rounded transition-colors hover:bg-slate-100"
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign in
            </Link>
            <Button
              variant="primary"
              className="w-full mt-4 bg-[#0056D2] hover:bg-[#0041A3] text-white font-medium text-base px-4 py-2 rounded shadow-sm hover:shadow transition-all"
              onClick={() => setMobileMenuOpen(false)}
            >
              Book Free Demo
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}