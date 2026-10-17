import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import type { Permission } from "./permissions";

export type AccessRow = {
  property_id: string;
  property_name: string;
  is_owner: boolean;
  role: string;
  permissions: string[];
  status: string;
};

type AccessContextValue = {
  rows: AccessRow[];
  /** False until the first my_access fetch resolves. */
  isReady: boolean;
  active: AccessRow | null;
  setActivePropertyId: (id: string) => void;
  can: (permission: Permission | "*") => boolean;
  isOwner: boolean;
  /** True once rows have loaded at least once and the previously-active property is no longer in them. */
  accessRemoved: boolean;
  refetch: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue | null>(null);
const ACTIVE_PROPERTY_KEY = "ipm.activePropertyId";

function readStoredActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROPERTY_KEY);
  } catch {
    return null;
  }
}

function writeStoredActiveId(id: string) {
  try {
    localStorage.setItem(ACTIVE_PROPERTY_KEY, id);
  } catch {
    // ignore (private mode / blocked storage)
  }
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const { session, isReady: authReady } = useAuth();
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [accessRemoved, setAccessRemoved] = useState(false);
  const hadRowsRef = useRef(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase.rpc("my_access");
    if (error) {
      console.error("[AccessContext] my_access failed", error.message);
      return;
    }
    const next = (data ?? []) as AccessRow[];
    setRows(next);
    setIsReady(true);

    setActiveId((prev) => {
      const stored = prev ?? readStoredActiveId();
      const stillThere = stored ? next.some((r) => r.property_id === stored) : false;
      if (hadRowsRef.current && prev && !next.some((r) => r.property_id === prev)) {
        setAccessRemoved(true);
      }
      if (stillThere) return stored as string;
      return next[0]?.property_id ?? null;
    });
    if (next.length > 0) hadRowsRef.current = true;
  }, [session]);

  useEffect(() => {
    if (!authReady) return;
    if (!session) {
      setRows([]);
      setIsReady(true);
      setActiveId(null);
      return;
    }
    load();
  }, [authReady, session, load]);

  useEffect(() => {
    if (!session) return;
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(load, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [session, load]);

  const active = rows.find((r) => r.property_id === activeId) ?? rows[0] ?? null;

  const setActivePropertyId = useCallback((id: string) => {
    setActiveId(id);
    writeStoredActiveId(id);
  }, []);

  const can = useCallback(
    (permission: Permission | "*") => {
      if (!active) return false;
      if (active.is_owner || active.permissions.includes("*")) return true;
      return active.permissions.includes(permission);
    },
    [active],
  );

  return (
    <AccessContext.Provider
      value={{
        rows,
        isReady,
        active,
        setActivePropertyId,
        can,
        isOwner: !!active?.is_owner,
        accessRemoved,
        refetch: load,
      }}
    >
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within AccessProvider");
  return ctx;
}
