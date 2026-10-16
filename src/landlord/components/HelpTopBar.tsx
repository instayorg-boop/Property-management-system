import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";

/** Minimal top bar for the Help & Support pages, which sit outside DashboardLayout and so get
 * none of its chrome (Header, Sidebar) for free -- just enough to orient someone who landed here
 * (the logo) and get them back to the app (the dashboard link). */
export default function HelpTopBar() {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white px-4 py-3 sm:px-8">
      <img
        src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay%20Manage%20Logo.png"
        alt="Instay Manage"
        className="h-6 w-auto"
      />
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} weight="bold" />
        Back to dashboard
      </Link>
    </div>
  );
}
