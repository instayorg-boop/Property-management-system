import { List as MenuIcon } from "@phosphor-icons/react";
import { useSidebar } from "../SidebarContext";

/** Mobile-only floating trigger for the off-canvas sidebar drawer. Notifications and the account
 * menu both live in the sidebar itself (header + footer) — fixed real estate that never collides
 * with a page's own header actions, unlike floating them over the content area. */
export default function TopBar() {
  const { setOpen } = useSidebar();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      className="fixed top-4 left-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg bg-paper text-muted shadow-sm transition-colors hover:bg-mist hover:text-ink lg:hidden"
    >
      <MenuIcon size={18} weight="bold" />
    </button>
  );
}
