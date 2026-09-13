import { Link } from "react-router-dom";

/** Shared "Powered by Instay" footer — same mark on every tenant-facing pay-portal page. */
export default function PortalFooter() {
  return (
    <div className="mt-8 flex flex-col items-center gap-1 pb-2">
      <span className="text-[11px] text-muted">Powered by</span>
      <Link to="/" className="flex items-center gap-2">
        <img src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png" alt="Instay Manage" className="h-10 " />
        <p className="font-sans text-brand text-xl font-semibold leading-[1.08] tracking-[-0.09em]  ">Instay Manage</p>
      </Link>
    </div>
  );
}
