import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  List as MenuIcon,
  MagnifyingGlass,
  Bell as BellIcon,
  GearSix,
  SignOut,
  CaretDown,
  Wallet,
  Phone,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useSidebar } from "../SidebarContext";
import { useSettings } from "../SettingsContext";
import { useNotifications } from "../NotificationsContext";
import { useAuth } from "../AuthContext";
import { useAccess } from "../AccessContext";
import { ROLE_LABELS } from "../permissions";
import { signOut as signOutRequest } from "../../lib/auth";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL, SUPPORT_WHATSAPP_URL } from "../../lib/supportContact";
import GlobalSearch from "./GlobalSearch";
import TierBadge from "./TierBadge";
import NotificationsDropdown from "./NotificationsDropdown";

/** Property logo, or its initials on a brand tint when there's no logo. */
function AccountAvatar({ logoUrl, name, size }: { logoUrl?: string | null; name: string; size: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  if (logoUrl) return <img src={logoUrl} alt="" className={`${dim} shrink-0 rounded-md border border-line object-cover`} />;
  const initials =
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "IM";
  return <span className={`${dim} flex shrink-0 items-center justify-center rounded-md bg-brand-soft font-semibold text-brand`}>{initials}</span>;
}

function MenuLink({ to, icon, onClick, children }: { to: string; icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </Link>
  );
}

/** Full-width top bar — logo, search and account all live here, spanning the whole viewport width
 * above both the sidebar and the page content, rather than being boxed into the sidebar column. */
export default function Header() {
  const { setOpen } = useSidebar();
  const { propertyName, propertyLogoUrl, subscriptionPlan } = useSettings();
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const { rows, active, isOwner, can, setActivePropertyId } = useAccess();
  const navigate = useNavigate();

  // The signed-in person's own name — works the same for the owner and any team member, unlike
  // landlordName/accountEmail (owner-only Settings fields that are blank for everyone else).
  const personFullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name;
  const personName = personFullName?.trim() || user?.email?.split("@")[0] || "Account";
  const [propertySwitcherOpen, setPropertySwitcherOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const onClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [accountOpen]);

  // Same pattern as the account menu's own outside-click/Escape handling, kept as a separate
  // effect (rather than merged into one) since the two dropdowns open and close independently.
  useEffect(() => {
    if (!notifOpen) return;
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNotifOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [notifOpen]);

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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-paper px-4 sm:px-6">
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
            src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png"
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

        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
            aria-expanded={notifOpen}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <BellIcon size={18} weight="bold" />
            {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <>
                {/* A faint backdrop over the rest of the dashboard — not to block clicks (the
                    outside-click handler above already closes on any of them), just so the eye
                    settles on the panel instead of competing with the page behind it. */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-20 bg-ink/15"
                  aria-hidden="true"
                />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 z-30 mt-2"
                >
                  <NotificationsDropdown onClose={() => setNotifOpen(false)} />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div ref={accountRef} className="relative ml-1">
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            aria-label="Open account menu"
            aria-expanded={accountOpen}
            className={`flex items-center gap-2.5 rounded-md border px-1.5 py-1 transition-colors md:pr-2.5 ${
              accountOpen ? "border-brand/40 bg-mist" : "border-transparent hover:border-line hover:bg-mist/60"
            }`}
          >
            <AccountAvatar logoUrl={propertyLogoUrl} name={propertyName} size="sm" />
            <span className="hidden min-w-0 max-w-40 flex-col items-start text-left leading-tight md:flex">
              <span className="flex w-full items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{propertyName || "Your property"}</span>
                <TierBadge plan={subscriptionPlan} size="sm" />
              </span>
              <span className="w-full truncate text-[11px] text-muted">{personName}</span>
            </span>
            <CaretDown
              size={12}
              weight="bold"
              className={`hidden shrink-0 text-muted transition-transform md:block ${accountOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {accountOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute top-full right-0 z-30 mt-2 w-64 origin-top-right overflow-hidden rounded-md border border-line bg-paper shadow-lg"
              >
                <div className="flex items-center gap-3 border-b border-line bg-mist/50 px-4 py-3.5">
                  <AccountAvatar logoUrl={propertyLogoUrl} name={propertyName} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-ink">{propertyName || "Your property"}</p>
                      <TierBadge plan={subscriptionPlan} size="sm" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs text-muted">{personName}</p>
                      {!isOwner && active && (
                        <span className="shrink-0 rounded-md bg-mist px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          {ROLE_LABELS[active.role] ?? active.role}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {rows.length > 1 && (
                  <div className="border-b border-line p-1.5">
                    <button
                      type="button"
                      onClick={() => setPropertySwitcherOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs font-medium text-ink hover:bg-mist"
                    >
                      Switch property
                      <CaretDown size={12} weight="bold" className={`transition-transform ${propertySwitcherOpen ? "rotate-180" : ""}`} />
                    </button>
                    {propertySwitcherOpen && (
                      <div className="mt-0.5 space-y-0.5">
                        {rows.map((r) => (
                          <button
                            key={r.property_id}
                            type="button"
                            onClick={() => {
                              setActivePropertyId(r.property_id);
                              setPropertySwitcherOpen(false);
                              setAccountOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-mist ${
                              r.property_id === active?.property_id ? "font-semibold text-ink" : "text-muted"
                            }`}
                          >
                            <span className="truncate">{r.property_name}</span>
                            <span className="shrink-0 text-[10px] text-muted">{r.is_owner ? "Owner" : ROLE_LABELS[r.role] ?? r.role}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="p-1.5">
                  <MenuLink to="/settings" icon={<GearSix size={16} weight="duotone" />} onClick={() => setAccountOpen(false)}>
                    Settings
                  </MenuLink>
                  {(isOwner || can("payouts.view") || can("payouts.request") || can("payout_methods.manage")) && (
                    <MenuLink to="/online-payments" icon={<Wallet size={16} weight="duotone" />} onClick={() => setAccountOpen(false)}>
                      Online payments
                    </MenuLink>
                  )}
                  <MenuLink to="/notifications" icon={<BellIcon size={16} weight="duotone" />} onClick={() => setAccountOpen(false)}>
                    Notifications
                    {unreadCount > 0 && (
                      <span className="ml-auto rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">{unreadCount}</span>
                    )}
                  </MenuLink>
                </div>
                <div className="border-t border-line p-2.5">
                  <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Need help?</p>
                  <div className="flex items-center gap-2">
                    <a
                      href={SUPPORT_PHONE_TEL}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
                    >
                      <Phone size={14} weight="duotone" />
                      Call
                    </a>
                    <a
                      href={SUPPORT_WHATSAPP_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
                    >
                      <WhatsappLogo size={14} weight="duotone" />
                      WhatsApp
                    </a>
                  </div>
                  <p className="px-1 pt-1.5 text-[11px] text-muted">{SUPPORT_PHONE_DISPLAY}</p>
                </div>
                <div className="border-t border-line p-1.5">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <SignOut size={16} weight="duotone" />
                    Log out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
