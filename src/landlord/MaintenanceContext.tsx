import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import { supabase } from "../lib/supabaseClient";
import {
  listReports,
  insertReport,
  updateReportRow,
  deleteReportRow,
  type MaintenanceReport,
  type MaintenanceStatus,
} from "../lib/maintenance";
import { readCachedView, writeCachedView } from "../lib/offline/cachedView";
import { enqueueAction } from "../lib/offline/sync";
import { ACTION_PRIORITY } from "../lib/offline/db";

export type { MaintenanceReport, MaintenanceStatus };

const REPORTS_VIEW_KEY = "maintenance_reports";

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

    readCachedView<MaintenanceReport>(REPORTS_VIEW_KEY, propertyId).then((cached) => {
      if (!cancelled && cached) {
        setReports(cached);
        setIsReady(true);
      }
    });

    (async () => {
      try {
        const rows = await listReports(propertyId);
        if (!cancelled) {
          setReports(rows);
          setIsReady(true);
        }
        void writeCachedView(REPORTS_VIEW_KEY, propertyId, rows);
      } catch (e) {
        if (!cancelled && !navigator.onLine) setIsReady(true);
        else console.error("Failed to load maintenance reports", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  // Live updates — a tenant submitting a report from the portal (or a status change from another
  // device/tab) shows up here, and in the Sidebar's unread badge, without a manual refresh.
  // Refetches the whole list rather than patching the changed row in place: simpler and safe to
  // reuse the same mapping logic (photo URLs, resolvedAt, etc.) that listReports already has,
  // and a property's report count is small enough that this is cheap.
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase
      .channel(`maintenance_reports:${propertyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maintenance_reports", filter: `property_id=eq.${propertyId}` },
        () => {
          void listReports(propertyId)
            .then((rows) => {
              setReports(rows);
              void writeCachedView(REPORTS_VIEW_KEY, propertyId, rows);
            })
            .catch((e) => console.error("Failed to refresh reports after a live update", e));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [propertyId]);

  const setStatus = (id: string, status: MaintenanceStatus) => {
    const resolvedAt = status === "resolved" ? new Date().toISOString() : undefined;
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status, resolvedAt } : r)));

    if (!navigator.onLine && propertyId) {
      void enqueueAction({
        id: crypto.randomUUID(),
        type: "update_maintenance_report",
        propertyId,
        payload: { id, status, resolved_at: resolvedAt ?? null },
        // The mapped MaintenanceReport type doesn't carry updated_at yet, so this can't be
        // conflict-checked until that's threaded through lib/maintenance.ts's row mapping —
        // the write still queues and applies, just without the "someone else changed it" check.
        baseUpdatedAt: null,
        priority: ACTION_PRIORITY.update_maintenance_report,
      });
      return;
    }

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
