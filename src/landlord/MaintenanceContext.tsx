import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import {
  listReports,
  insertReport,
  updateReportRow,
  deleteReportRow,
  type MaintenanceReport,
  type MaintenanceStatus,
} from "../lib/maintenance";

export type { MaintenanceReport, MaintenanceStatus };

type MaintenanceContextValue = {
  reports: MaintenanceReport[];
  /** False until the initial Supabase fetch resolves. */
  isReady: boolean;
  setStatus: (id: string, status: MaintenanceStatus) => void;
  markRead: (id: string) => void;
  addReport: (report: Omit<MaintenanceReport, "id" | "unread" | "resolvedAt">) => void;
  /** Edits the location/description/photos of an existing report — not its status/read state. */
  updateReport: (id: string, patch: Partial<Pick<MaintenanceReport, "location" | "description" | "photoUrls">>) => void;
  deleteReport: (id: string) => void;
};

const MaintenanceContext = createContext<MaintenanceContextValue | null>(null);

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const { propertyId } = useSettings();
  const [reports, setReports] = useState<MaintenanceReport[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      const rows = await listReports(propertyId);
      if (!cancelled) {
        setReports(rows);
        setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const setStatus = (id: string, status: MaintenanceStatus) => {
    const resolvedAt = status === "resolved" ? new Date().toISOString() : undefined;
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status, resolvedAt } : r)));
    void updateReportRow(id, { status, resolvedAt }).catch((e) => console.error("Failed to update report status", e));
  };

  const markRead = (id: string) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, unread: false } : r)));
    void updateReportRow(id, { unread: false }).catch((e) => console.error("Failed to mark report read", e));
  };

  const addReport = (report: Omit<MaintenanceReport, "id" | "unread" | "resolvedAt">) => {
    const created: MaintenanceReport = { ...report, id: crypto.randomUUID(), unread: false };
    setReports((prev) => [created, ...prev]);
    if (propertyId) void insertReport(propertyId, created.id, report).catch((e) => console.error("Failed to save report", e));
  };

  const updateReport = (id: string, patch: Partial<Pick<MaintenanceReport, "location" | "description" | "photoUrls">>) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    void updateReportRow(id, patch).catch((e) => console.error("Failed to update report", e));
  };

  const deleteReport = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
    void deleteReportRow(id).catch((e) => console.error("Failed to delete report", e));
  };

  return (
    <MaintenanceContext.Provider value={{ reports, isReady, setStatus, markRead, addReport, updateReport, deleteReport }}>
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  const ctx = useContext(MaintenanceContext);
  if (!ctx) throw new Error("useMaintenance must be used within MaintenanceProvider");
  return ctx;
}
