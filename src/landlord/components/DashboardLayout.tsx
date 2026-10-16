import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { ThemeProvider, useTheme } from "../ThemeContext";
import { ToastProvider } from "../ToastContext";
import { ExpensesProvider } from "../ExpensesContext";
import { StaffProvider } from "../StaffContext";
import { TenantsProvider } from "../TenantsContext";
import { RoomsProvider } from "../RoomsContext";
import { MaintenanceProvider } from "../MaintenanceContext";
import { SettingsProvider } from "../SettingsContext";
import { NotificationsProvider } from "../NotificationsContext";
import { InvoicesProvider } from "../InvoicesContext";
import { SidebarProvider } from "../SidebarContext";
import { AssistantUiProvider } from "../AssistantUiContext";
import SyncToast from "./SyncToast";
import { SyncStatusBadge } from "./SyncStatus";
import AssistantPanel from "../../components/AssistantPanel";
import { SkeletonPage } from "./Skeleton";

function Shell() {
  const { isDark } = useTheme();
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Client-side routing doesn't reset scroll on its own — without this, navigating to a new page
  // keeps whatever scroll position the previous page's content was left at.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className={`flex h-screen flex-col overflow-hidden ${isDark ? "theme-dark" : ""}`}>
      {/* Full-width header spans the whole viewport, above both the sidebar and the content —
          logo, search and account all live here rather than being boxed into the sidebar column. */}
      <Header />

      {/* Standard full-bleed dashboard shell: sidebar and content sit flush, edge to edge, no
          outer padding, no rounded/bordered frame around the pair — just plain colour contrast
          (gray sidebar, white content) doing the separating. On mobile, Sidebar renders nothing
          here at all below `lg` (its own full-screen menu is a fixed overlay, not part of this
          flex row), so there's no backdrop or drawer-width concern at this level any more. */}
      <div className="relative flex flex-1 overflow-hidden">
        <Sidebar />

        {/* scrollbar-gutter: stable — this is the actual scrolling container (the page never
            scrolls), so a page like Settings whose content height changes when you switch tabs
            would otherwise toggle this scrollbar on/off, shifting everything inside horizontally
            (including anything mid-animation, like the Settings tab bar's sliding underline). */}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto bg-mist"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", scrollbarGutter: "stable" }}
        >
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
            {/* Pages are lazy-loaded; this inner boundary catches a page chunk still downloading so
                only the content area shows a skeleton, instead of the root boundary blanking the
                whole shell with the full-screen loader. */}
            <Suspense fallback={<SkeletonPage />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </main>
      </div>
      <SyncToast />
      <SyncStatusBadge />
      {/* Assistant widget — read-only chat, lives on every dashboard page (never on the public
          tenant payment portal, which has its own separate layout tree entirely). Its own floating
          trigger is visible at every width now that there's no bottom tab bar reserving that
          corner's real estate for a "Chat" tab. */}
      <AssistantPanel />
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SettingsProvider>
          <NotificationsProvider>
            <ExpensesProvider>
              <StaffProvider>
                <TenantsProvider>
                  <RoomsProvider>
                    <MaintenanceProvider>
                      <InvoicesProvider>
                        <SidebarProvider>
                          <AssistantUiProvider>
                            <Shell />
                          </AssistantUiProvider>
                        </SidebarProvider>
                      </InvoicesProvider>
                    </MaintenanceProvider>
                  </RoomsProvider>
                </TenantsProvider>
              </StaffProvider>
            </ExpensesProvider>
          </NotificationsProvider>
        </SettingsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
