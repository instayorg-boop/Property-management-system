import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type InvoiceStatus = "sent" | "downloaded";

export type Invoice = {
  id: string;
  /** Primary tenant this invoice is for — for an institution-grouped invoice this is the first
   * tenant in the group, with the rest listed in `tenantIds`. */
  tenantId: string;
  /** Present only for institution-grouped invoices — every tenant the combined document covers. */
  tenantIds?: string[];
  institutionName?: string;
  amount: number;
  /** Billing period label, e.g. "August 2026". */
  period: string;
  issuedAt: string;
  dueAt: string;
  status: InvoiceStatus;
  invoiceNumber: string;
};

const STORAGE_KEY = "instay_invoices_v1";

type StoredShape = { invoices: Invoice[]; sequenceYear: number; sequenceCount: number };

function loadStored(): StoredShape {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.invoices)) throw new Error("bad shape");
    return {
      invoices: parsed.invoices,
      sequenceYear: parsed.sequenceYear ?? new Date().getFullYear(),
      sequenceCount: parsed.sequenceCount ?? 0,
    };
  } catch {
    return { invoices: [], sequenceYear: new Date().getFullYear(), sequenceCount: 0 };
  }
}

type InvoicesContextValue = {
  invoices: Invoice[];
  /** Generates the invoice number and id, appends the invoice, persists it, and returns it. */
  recordInvoice: (invoice: Omit<Invoice, "id" | "invoiceNumber">) => Invoice;
  /** Whether a "sent" invoice already exists for this tenant + period — drives the "Invoice sent" badge. */
  hasSentInvoiceForPeriod: (tenantId: string, period: string) => boolean;
};

const InvoicesContext = createContext<InvoicesContextValue | null>(null);

export function InvoicesProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadStored()).current;
  const [invoices, setInvoices] = useState<Invoice[]>(initial.invoices);
  // A ref (not state) for the sequence counter — "Send all" records several invoices in the same
  // tick, and only a ref guarantees each of those calls sees the previous one's increment
  // immediately, rather than racing on a stale `useState` closure until the next render.
  const sequenceRef = useRef({ year: initial.sequenceYear, count: initial.sequenceCount });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ invoices, sequenceYear: sequenceRef.current.year, sequenceCount: sequenceRef.current.count })
      );
    } catch {
      // localStorage unavailable (private browsing, quota) — invoices still work for this session
    }
  }, [invoices]);

  const recordInvoice = (invoice: Omit<Invoice, "id" | "invoiceNumber">): Invoice => {
    const thisYear = new Date().getFullYear();
    if (sequenceRef.current.year !== thisYear) sequenceRef.current = { year: thisYear, count: 0 };
    sequenceRef.current = { year: thisYear, count: sequenceRef.current.count + 1 };
    const invoiceNumber = `INV-${thisYear}-${String(sequenceRef.current.count).padStart(4, "0")}`;
    const created: Invoice = { ...invoice, id: `inv${Date.now()}${Math.round(Math.random() * 1000)}`, invoiceNumber };
    setInvoices((prev) => [created, ...prev]);
    return created;
  };

  const hasSentInvoiceForPeriod = (tenantId: string, period: string) =>
    invoices.some(
      (inv) => inv.status === "sent" && inv.period === period && (inv.tenantId === tenantId || inv.tenantIds?.includes(tenantId))
    );

  return (
    <InvoicesContext.Provider value={{ invoices, recordInvoice, hasSentInvoiceForPeriod }}>
      {children}
    </InvoicesContext.Provider>
  );
}

export function useInvoices() {
  const ctx = useContext(InvoicesContext);
  if (!ctx) throw new Error("useInvoices must be used within InvoicesProvider");
  return ctx;
}
