import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Button from "../landlord/components/Button";

export const Footer: React.FC = () => {
  const navigation = [
    { name: "Pricing", href: "/pricing" },
    { name: "Features", href: "/#features" },
    { name: "About Us", href: "/about" },
    { name: "Contact Us", href: "/contact" },
    { name: "FAQ", href: "/faq" }
  ];

  const social = [
    { name: "Facebook", href: "https://x.com" },
    { name: "Instagram", href: "https://linkedin.com" },
    { name: "Tiktok", href: "https://linkedin.com" }
  ];

  const legal = [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
  ];

  return (
    <footer className="relative overflow-hidden  pt-20 lg:pt-28 text-slate-900 ">
      {/* 1. CTA Callout */}
      <div className="container relative z-10 mx-auto px-4 text-center space-y-4 max-w-3xl">
        <h2 className="text-3xl font-bold font-display tracking-tight md:text-4xl lg:text-5xl text-slate-900">
        Book a free demo
        </h2>
        <p className="text-slate-600 mx-auto max-w-xl text-base sm:text-lg leading-relaxed text-balance">
        We'll walk through your properties with you and confirm it's the right fit, no commitment
        </p>
        <div className="pt-3">
          <Button
           variant="primary"
            className="inline-block bg-[#0056D2] hover:bg-[#0041A3] text-white font-medium text-base px-8 py-3.5  shadow-sm hover:shadow transition-all"
          >
            Book Free Demo
          </Button>
        </div>
      </div>

      {/* 2. Navigation & Links */}
      <nav className="container relative z-10 mx-auto px-4 mt-16 flex flex-col items-center gap-6">
        {/* Main Nav & Socials */}
        <ul className="flex flex-wrap items-center justify-center gap-6 text-sm sm:text-base">
          {navigation.map((item) => (
            <li key={item.name}>
              <Link
                to={item.href}
                className="font-medium text-slate-700 hover:text-[#0056D2] transition-colors"
              >
                {item.name}
              </Link>
            </li>
          ))}
          {social.map((item) => (
            <li key={item.name}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 font-medium text-slate-700 hover:text-[#0056D2] transition-colors"
              >
                {item.name} <ArrowUpRight className="size-4" />
              </a>
            </li>
          ))}
        </ul>

        {/* Legal Links */}
        <ul className="flex flex-wrap items-center justify-center gap-6">
          {legal.map((item) => (
            <li key={item.name}>
              <Link
                to={item.href}
                className="text-slate-500 text-xs sm:text-sm hover:text-slate-800 transition-colors"
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* 3. Large "MANAGE" Watermark Graphic */}
      <div className="mt-8 w-full select-none leading-none overflow-hidden text-[#0056D2]/10 pointer-events-none">
        <svg
          viewBox="0 0 1000 180"
          className="w-full h-auto block  translate-y-4"
          aria-hidden="true"
        >
          <text
            x="50%"
            y="85%"
            textAnchor="middle"
            fill="currentColor"
            fontSize="180"
            fontWeight="900"
            letterSpacing="-0.04em"
            className="font-sans uppercase"
          >
            MANAGE
          </text>
        </svg>
      </div>
    </footer>
  );
};

export default Footer;