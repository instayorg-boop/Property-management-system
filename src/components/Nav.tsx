
"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Button from "../landlord/components/Button";

const links = [
  { label: "Pricing", to: "/pricing" },
  { label: "Contact Us", to: "/contact" },
  { label: "About", to: "/about" },
];

interface NavProps {
  /**
   * Whether the navbar starts transparent at the top of the page.
   * Defaults to true.
   */
  transparent?: boolean;

  /**
   * Text color when the navbar is at the top.
   * Useful for dark/light hero sections.
   */
  textColor?: "text-white" | "text-slate-900";

  /**
   * Whether scrolling changes the navbar to the solid style.
   * Defaults to true.
   */
  changeOnScroll?: boolean;

  /**
   * Background class when the navbar is scrolled.
   */
  scrolledBg?: string;

  /**
   * Background class when the navbar is at the top.
   */
  topBg?: string;
}

export default function Nav({
  transparent = true,
  textColor = "text-white",
  changeOnScroll = true,
  scrolledBg = "bg-white/90 backdrop-blur-md ",
  topBg = "bg-transparent",
}: NavProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  /*
   * If changeOnScroll is disabled, the navbar always uses
   * the configured top appearance.
   */
  const shouldUseScrolledStyle = changeOnScroll && isScrolled;

  const useDarkText =
    shouldUseScrolledStyle || !transparent;

  

  const currentLinkColor = useDarkText
    ? "text-slate-600"
    : textColor;

  const headerBg = shouldUseScrolledStyle
    ? scrolledBg
    : topBg;

  const linkHoverClasses = useDarkText
    ? "hover:text-slate-900 hover:bg-slate-50"
    : "hover:bg-white/10";

  const hamburgerClasses = useDarkText
    ? "bg-slate-50 hover:bg-slate-100 text-slate-900"
    : "bg-white/10 hover:bg-white/20 text-white";

  const HamburgerIcon = ({ open }: { open: boolean }) => (
    <button
      aria-label={open ? "Close Menu" : "Open Menu"}
      onClick={() => setMobileMenuOpen((prev) => !prev)}
      className={`md:hidden z-50 rounded p-2 transition-colors ${hamburgerClasses}`}
      type="button"
    >
      <span className="sr-only">
        {open ? "Close menu" : "Open menu"}
      </span>

      {open ? (
        <svg
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            d="M6 6l12 12M6 18L18 6"
          />
        </svg>
      ) : (
        <svg
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            d="M4 7h16M4 12h16M4 17h16"
          />
        </svg>
      )}
    </button>
  );

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${headerBg}`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img
            src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png"
            alt="Instay Manage" 
            className="h-10"
          />

          <p
            className={`font-sans text-xl font-bold  tracking-[-0.08em] text-blue-600 transition-colors duration-300 `}
          >
            Instay Manage
          </p>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-8 text-sm md:flex">
          {links.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className={`
                rounded px-1 py-0.5
                transition-colors duration-300
                focus:outline-none
                focus-visible:ring-2 font-semibold
                focus-visible:ring-brand
                ${currentLinkColor}
                ${linkHoverClasses}
              `}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 md:gap-3">
          <Link
            to="/sign-in"
            className={`
              hidden rounded px-1 py-0.5 text-sm font-medium
              transition-colors duration-300
              focus:outline-none
              focus-visible:ring-2
              focus-visible:ring-brand
              sm:block
              ${currentLinkColor}
              ${linkHoverClasses}
            `}
          >
            Sign in
          </Link>

          <Button
            variant="primary"
            className="
              px-4 py-2 text-sm
              font-medium text-white
              shadow-sm transition-all
              hover:shadow
             
              bg-[#0056D2]
              hover:bg-[#0041A3]
            "
          >
            Book Free Demo
          </Button>

          
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white/95 backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <Link
              to="/"
              className="flex items-center gap-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              <img
                src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png"
                alt="Instay Manage"
                className="h-8"
              />

              <span className="text-lg  font-bold text-slate-900 tracking-[-0.04em]">
         
                Instay Manage
              </span>
            </Link>

            <HamburgerIcon open={true} />
          </div>

          <nav className="flex flex-col items-start gap-2 px-4 py-6">
            {links.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className="
                  block w-full rounded py-2
                  text-base font-medium
                  text-slate-700
                  transition-colors
                  hover:bg-slate-100
                "
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            <Link
              to="/sign-in"
              className="
                block w-full rounded py-2
                text-base font-medium
                text-slate-700
                transition-colors
                hover:bg-slate-100
              "
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign in
            </Link>

            <Button
              variant="primary"
              className="
                mt-4 w-full
                rounded
                bg-[#0056D2]
                px-4 py-2
                text-base font-medium text-white
                shadow-sm
                transition-all
                hover:bg-[#0041A3]
                hover:shadow
              "
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

