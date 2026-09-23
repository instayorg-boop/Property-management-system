import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Open/closed state for the assistant panel — the desktop FAB and the mobile Chat tab both
 * drive the same widget, so the state lives above both rather than inside AssistantPanel. */
type AssistantUiValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const AssistantUiContext = createContext<AssistantUiValue | null>(null);

export function AssistantUiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <AssistantUiContext.Provider value={value}>{children}</AssistantUiContext.Provider>;
}

export function useAssistantUi() {
  const ctx = useContext(AssistantUiContext);
  if (!ctx) throw new Error("useAssistantUi must be used within AssistantUiProvider");
  return ctx;
}
