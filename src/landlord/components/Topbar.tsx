import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GearSix as SettingsIcon, Bell as BellIcon, List as MenuIcon, UserCircle as UserAvatarIcon } from "@phosphor-icons/react";
import NotificationsPanel from "./NotificationsPanel";
import ProfileMenu from "./ProfileMenu";
import { useSidebar } from "../SidebarContext";

export default function Topbar() {
  const { toggle: toggleSidebar } = useSidebar();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationsOpen && !profileOpen) return;

    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [notificationsOpen, profileOpen]);

  return (
    <header ref={containerRef} className="relative flex h-16 shrink-0 items-center justify-between px-4 sm:px-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink lg:hidden"
        >
          <MenuIcon size={20} weight="bold" />
        </button>
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src="https://cdn.brandfetch.io/idkuvXnjOH/theme/dark/logo.svg?c=1dxbfHSJFAPEGdCLU4o5B" alt="Instay Manage" className="h-7 " />
        </Link>
      </div>

      <div className="flex items-center gap-1">
        <Link
          to="/settings"
          aria-label="Settings"
          className="hidden h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink lg:flex"
        >
          <SettingsIcon size={18} weight="duotone" />
        </Link>
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => {
            setProfileOpen(false);
            setNotificationsOpen((v) => !v);
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <BellIcon size={18} weight="duotone" />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-brand" />
        </button>
        <button
          type="button"
          aria-label="Account"
          onClick={() => {
            setNotificationsOpen(false);
            setProfileOpen((v) => !v);
          }}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-mist text-muted transition-colors hover:opacity-80"
        >
          <UserAvatarIcon size={22} weight="fill" />
        </button>
      </div>

      {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
      {profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
