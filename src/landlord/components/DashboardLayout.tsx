import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { ThemeProvider, useTheme } from "../ThemeContext";
import { ToastProvider } from "../ToastContext";
import { ExpensesProvider } from "../ExpensesContext";
import { StaffProvider } from "../StaffContext";
import { TenantsProvider } from "../TenantsContext";
import { RoomsProvider } from "../RoomsContext";
import { MaintenanceProvider } from "../MaintenanceContext";
import { SettingsProvider } from "../SettingsContext";
import { InvoicesProvider } from "../InvoicesContext";
import { SidebarProvider, useSidebar } from "../SidebarContext";
import ProductTour from "./ProductTour";
import SyncToast from "./SyncToast";
import { SyncStatusBadge } from "./SyncStatus";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function Shell() {
  const { isDark } = useTheme();
  const { open, setOpen } = useSidebar();
  const drawerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Client-side routing doesn't reset scroll on its own — without this, navigating to a new page
  // keeps whatever scroll position the previous page's content was left at.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  // Escape-to-close + a focus trap while the mobile drawer is open, and focus lands inside it on open.
  useEffect(() => {
    if (!open) return;

    const drawer = drawerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstFocusable = drawer?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawer) return;
      const focusables = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, setOpen]);

  return (
    <div className={`flex h-screen flex-col overflow-hidden ${isDark ? "theme-dark" : ""}`}>
      {/* Standard full-bleed dashboard shell: sidebar and content sit flush, edge to edge, no
          outer padding, no rounded/bordered frame around the pair — just plain colour contrast
          (gray sidebar, white content) doing the separating. */}
      <div className="relative flex flex-1 overflow-hidden">
        {open && (
          <div
            className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar ref={drawerRef} />

        <main ref={mainRef} className="flex-1 overflow-y-auto bg-paper">
          {/* Floating, fixed-position mobile menu trigger + notifications bell — they sit in line
              with each page's PageHeader title row but stay put on scroll instead of scrolling
              away with the page. The account menu lives in the sidebar, same as always. */}
          <TopBar />
          {/*
            No AnimatePresence/exit here on purpose: waiting for the old page to fade out before
            mounting the new one (mode="wait") left a gap where the old page's height had already
            collapsed but the new page hadn't mounted yet, so the layout visibly snapped — that's
            the "glitch". Mounting the new page immediately and only fading it in (no exit, no
            y-shift that would fight the scroll-reset effect above) avoids that collapse entirely.
          */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <ProductTour />
      <SyncToast />
      <SyncStatusBadge />
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SettingsProvider>
          <ExpensesProvider>
            <StaffProvider>
              <TenantsProvider>
                <RoomsProvider>
                  <MaintenanceProvider>
                    <InvoicesProvider>
                      <SidebarProvider>
                        <Shell />
                      </SidebarProvider>
                    </InvoicesProvider>
                  </MaintenanceProvider>
                </RoomsProvider>
              </TenantsProvider>
            </StaffProvider>
          </ExpensesProvider>
        </SettingsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
