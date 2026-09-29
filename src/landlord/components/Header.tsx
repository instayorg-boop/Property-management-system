import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  List as MenuIcon,
  MagnifyingGlass,
  Bell as BellIcon,
  UserCircle,
  DotsThreeVertical,
  GearSix,
  SignOut,
} from "@phosphor-icons/react";
import { useSidebar } from "../SidebarContext";
import { useSettings } from "../SettingsContext";
import { useNotifications } from "../NotificationsContext";
import { signOut as signOutRequest } from "../../lib/auth";
import NotificationsPanel from "./NotificationsPanel";
import GlobalSearch from "./GlobalSearch";

/** Full-width top bar — logo, search and account all live here, spanning the whole viewport width
 * above both the sidebar and the page content, rather than being boxed into the sidebar column. */
export default function Header() {
  const { setOpen } = useSidebar();
  const { propertyName, propertyLogoUrl } = useSettings();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!accountOpen && !notificationsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) setNotificationsOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAccountOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [accountOpen, notificationsOpen]);

  // Cmd/Ctrl+K opens global search from anywhere in the dashboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // The header field is just the entry point — once search is open the full-screen panel owns the
  // query, so a fresh open always starts from an empty draft rather than replaying the last search.
  useEffect(() => {
    if (!searchOpen) setSearchDraft("");
  }, [searchOpen]);

  const handleSignOut = () => {
    setAccountOpen(false);
    void signOutRequest().finally(() => navigate("/sign-in"));
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-paper px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink lg:hidden"
        >
          <MenuIcon size={18} weight="bold" />
        </button>

        <Link to="/dashboard" className="flex items-center gap-3">
          <img
            src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay%20Manage%20Logo.png"
            alt="Instay Manage"
            className="h-9"
          />
          <p className="hidden font-sans text-xl font-bold leading-[1.08] tracking-[-0.09em] text-blue-700 sm:block">
            Instay Manage
          </p>
        </Link>
      </div>

      {/* Centered search field — the header's left (logo) and right (notifications/account) groups
          stay fixed-width, so this middle group can flex to fill and keep the input truly centered. */}
      <div className="hidden flex-1 justify-center px-6 sm:flex">
        <div className="flex w-full max-w-md items-center gap-2 rounded-lg border border-line bg-mist/60 px-3 py-2 text-muted transition-colors focus-within:border-brand focus-within:bg-paper">
          <MagnifyingGlass size={16} weight="bold" className="shrink-0" />
          <input
            ref={searchInputRef}
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search tenants, rooms, maintenance…"
            className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink sm:hidden"
        >
          <MagnifyingGlass size={18} weight="bold" />
        </button>

        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((v) => !v)}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <BellIcon size={18} weight="bold" />
            {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />}
          </button>
          {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
        </div>

        <div ref={accountRef} className="relative ml-1">
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            aria-label="Open account menu"
            aria-expanded={accountOpen}
            className="flex items-center gap-2 rounded-md  p-1.5 transition-colors"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              {propertyLogoUrl ? (
                <img src={propertyLogoUrl} alt="" className="h-10 w-10 rounded-full border border-gray-200 object-cover" />
              ) : (
                <UserCircle size={26} weight="fill" className="text-muted" />
              )}
            </span>
            <span className="hidden min-w-0 max-w-40 flex-col items-start text-left md:flex">
              <span className="w-full truncate text-sm font-semibold text-ink">{propertyName}</span>

            </span>
            <DotsThreeVertical size={16} weight="bold" className="hidden shrink-0 text-muted md:block" />
          </button>

          {accountOpen && (
            <div className="absolute top-full right-0 z-10 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-paper shadow-card">
              <div className="px-4 pt-3.5 pb-3">
                <p className="truncate text-sm font-semibold text-ink">{propertyName}</p>
                <p className="text-xs text-muted">Property account</p>
              </div>
              <div className="h-px bg-line" />
              <div className="p-1">
                <Link
                  to="/settings"
                  onClick={() => setAccountOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
                >
                  <GearSix size={16} weight="duotone" />
                  Settings
                </Link>
              </div>
              <div className="p-1">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <SignOut size={16} weight="duotone" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {searchOpen && (
        <GlobalSearch
          initialQuery={searchDraft}
          onClose={() => setSearchOpen(false)}
          onNavigate={() => setSearchOpen(false)}
        />
      )}
    </header>
  );
}
