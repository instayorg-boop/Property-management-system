/** Shared top bar for every tenant-facing pay-portal page (statement, payment, success, failure)
 * — kept identical across all of them so navigating between them doesn't feel like switching
 * apps. Leads with the PROPERTY's own identity (logo + name, side by side) since that's what a
 * tenant actually recognizes, with the small "Instay / For tenants" mark kept underneath (not
 * removed) so the platform identity still shows, just secondary to whose portal this actually is.
 * No bottom border — the page content below sits flush against it instead of being cut off by a
 * rule. No photo uploaded yet means no avatar renders, not a placeholder ring. */
export default function PortalHeader({ propertyName, avatarUrl }: { propertyName?: string | null; avatarUrl?: string | null }) {
  return (
    <div className="bg-white flex w-md items-center justify-between px-5 py-3.5">
      <div className="text-left">
        <p className="font-display text-lg font-semibold leading-tight text-ink">Instay</p>
        <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">For tenants</p>
      </div>
      
      {propertyName && (
        <div className="">
          {avatarUrl && <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />}
        </div>
      )}
      
    </div>
  );
}
