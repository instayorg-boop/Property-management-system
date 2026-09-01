import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shared open/closed state for the mobile sidebar drawer. Lives in its own context because three
 * separate components need to read and write it: Topbar (the hamburger button), Sidebar (the
 * drawer itself + closes on nav), and DashboardLayout (the backdrop overlay + Escape handling).
 */
type SidebarContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  return <SidebarContext.Provider value={{ open, setOpen, toggle }}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
