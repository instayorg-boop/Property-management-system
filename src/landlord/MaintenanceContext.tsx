import { createContext, useContext, useState, type ReactNode } from "react";

export type MaintenanceStatus = "open" | "in-progress" | "resolved";

export type MaintenanceReport = {
  id: string;
  tenant: string;
  /** Where on the property — not just a room. Free text: "Room 08", "Main gate", "Borehole pump", etc. */
  location: string;
  description: string;
  submittedAt: string; // ISO
  status: MaintenanceStatus;
  unread: boolean;
  hasPhoto: boolean;
  /** Actual photo, once tenants can attach one through the payment-link confirmation screen. Falls back to a placeholder when absent but hasPhoto is true. */
  photoUrl?: string;
  /** Set when status moves to "resolved"; cleared if it moves away again. */
  resolvedAt?: string;
};

const initialReports: MaintenanceReport[] = [
  {
    id: "m1", tenant: "B. Phiri", location: "Room 08",
    description: "Tap in the bathroom won't stop dripping, has been going for two days.",
    submittedAt: "2026-08-27T08:12:00", status: "open", unread: true, hasPhoto: true,
  },
  {
    id: "m2", tenant: "F. Chileshe", location: "Room 19",
    description: "Window latch is broken, doesn't lock properly at night.",
    submittedAt: "2026-08-26T19:40:00", status: "open", unread: true, hasPhoto: false,
  },
  {
    id: "m3", tenant: "A. Mwansa", location: "Room 12",
    description: "Ceiling light in the room has stopped working.",
    submittedAt: "2026-08-25T14:05:00", status: "in-progress", unread: false, hasPhoto: true,
  },
  {
    id: "m4", tenant: "G. Mwape", location: "Room 22",
    description: "Door handle came loose, still usable but needs tightening.",
    submittedAt: "2026-08-22T09:30:00", status: "in-progress", unread: false, hasPhoto: false,
  },
  {
    id: "m5", tenant: "H. Banda", location: "Main gate",
    description: "Gate to the compound was squeaking, plumber fixed it after oiling.",
    submittedAt: "2026-08-18T11:15:00", status: "resolved", unread: false, hasPhoto: false,
    resolvedAt: "2026-08-19T10:00:00",
  },
  {
    id: "m6", tenant: "D. Zulu", location: "Room 05",
    description: "Requested extra key cut for a guardian visiting for the weekend.",
    submittedAt: "2026-08-15T16:50:00", status: "resolved", unread: false, hasPhoto: false,
    resolvedAt: "2026-08-16T09:20:00",
  },
];

type MaintenanceContextValue = {
  reports: MaintenanceReport[];
  setStatus: (id: string, status: MaintenanceStatus) => void;
  markRead: (id: string) => void;
  addReport: (report: Omit<MaintenanceReport, "id" | "unread" | "resolvedAt">) => void;
};

const MaintenanceContext = createContext<MaintenanceContextValue | null>(null);

// Temporary switch for previewing empty states across the app — flip back to `false`
// once the preview is done.
const DEMO_EMPTY_STATE = true;

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<MaintenanceReport[]>(DEMO_EMPTY_STATE ? [] : initialReports);

  const setStatus = (id: string, status: MaintenanceStatus) => {
    setReports((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status, resolvedAt: status === "resolved" ? new Date().toISOString() : undefined } : r
      )
    );
  };

  const markRead = (id: string) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, unread: false } : r)));
  };

  const addReport = (report: Omit<MaintenanceReport, "id" | "unread" | "resolvedAt">) => {
    setReports((prev) => [{ ...report, id: `m${Date.now()}`, unread: false }, ...prev]);
  };

  return (
    <MaintenanceContext.Provider value={{ reports, setStatus, markRead, addReport }}>{children}</MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  const ctx = useContext(MaintenanceContext);
  if (!ctx) throw new Error("useMaintenance must be used within MaintenanceProvider");
  return ctx;
}
