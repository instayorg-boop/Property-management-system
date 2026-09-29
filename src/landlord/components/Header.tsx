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
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

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
  const notificationsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) setNotificationsOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [notificationsOpen]);

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
    void signOutRequest().finally(() => navigate("/sign-in"));
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground lg:hidden"
        >
          <MenuIcon size={18} weight="bold" />
        </button>

        <Link to="/dashboard" className="flex items-center gap-3">
          <img
            src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay%20Manage%20Logo.png"
            alt="Instay Manage"
            className="h-9"
          />
          <p className="hidden font-sans text-xl font-bold leading-[1.08] tracking-[-0.09em] text-primary sm:block">
            Instay Manage
          </p>
        </Link>
      </div>

      {/* Centered search field — the header's left (logo) and right (notifications/account) groups
          stay fixed-width, so this middle group can flex to fill and keep the input truly centered. */}
      <div className="hidden flex-1 justify-center px-6 sm:flex">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex w-full max-w-md items-center gap-2 rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-left text-muted-foreground transition-colors hover:border-primary hover:bg-card"
        >
          <MagnifyingGlass size={16} weight="bold" className="shrink-0" />
          <span className="w-full min-w-0 truncate text-sm">Search tenants, rooms, maintenance…</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground sm:hidden"
        >
          <MagnifyingGlass size={18} weight="bold" />
        </button>

        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={() => setNotificationsOpen((v) => !v)}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <BellIcon size={18} weight="bold" />
            {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />}
          </button>
          {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Open account menu"
              className="ml-1 flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-surface-muted"
            >
              <Avatar size="default">
                {propertyLogoUrl ? (
                  <AvatarImage src={propertyLogoUrl} alt="" className="object-cover" />
                ) : null}
                <AvatarFallback>
                  <UserCircle size={22} weight="fill" className="text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 max-w-40 flex-col items-start text-left md:flex">
                <span className="w-full truncate text-sm font-semibold text-foreground">{propertyName}</span>
              </span>
              <DotsThreeVertical size={16} weight="bold" className="hidden shrink-0 text-muted-foreground md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-semibold text-foreground">{propertyName}</p>
              <p className="text-xs font-normal text-muted-foreground">Property account</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings" className="cursor-pointer">
                <GearSix size={16} weight="duotone" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handleSignOut} className="cursor-pointer">
              <SignOut size={16} weight="duotone" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
