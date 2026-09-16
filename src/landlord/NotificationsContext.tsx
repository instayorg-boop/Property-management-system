import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import { supabase } from "../lib/supabaseClient";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
  type NotificationCategory,
} from "../lib/notificationsApi";

export type { NotificationRow, NotificationCategory };

type NotificationsContextValue = {
  notifications: NotificationRow[];
  isReady: boolean;
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { propertyId } = useSettings();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listNotifications(propertyId);
        if (!cancelled) {
          setNotifications(rows);
          setIsReady(true);
        }
      } catch (e) {
        if (!cancelled && !navigator.onLine) setIsReady(true);
        else console.error("Failed to load notifications", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  // Live updates — a payment landing or a tenant submitting a maintenance report while the
  // dashboard is open shows up immediately, without a refresh. Refetches the whole (small,
  // 50-row-capped) list rather than patching in place, same tradeoff MaintenanceContext makes.
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase
      .channel(`notifications:${propertyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `property_id=eq.${propertyId}` },
        () => {
          void listNotifications(propertyId)
            .then(setNotifications)
            .catch((e) => console.error("Failed to refresh notifications after a live update", e));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [propertyId]);

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)));
    void markNotificationRead(id).catch((e) => console.error("Failed to mark notification read", e));
  };

  const markAllRead = () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    if (propertyId) void markAllNotificationsRead(propertyId).catch((e) => console.error("Failed to mark all notifications read", e));
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <NotificationsContext.Provider value={{ notifications, isReady, unreadCount, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
