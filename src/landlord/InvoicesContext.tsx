import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";
import { listInvoices, insertInvoice, getMaxInvoiceSequence, type Invoice, type InvoiceStatus } from "../lib/invoices";

export type { Invoice, InvoiceStatus };

type InvoicesContextValue = {
  invoices: Invoice[];
  /** Generates the invoice number and id, appends the invoice, persists it, and returns it. */
  recordInvoice: (invoice: Omit<Invoice, "id" | "invoiceNumber">) => Invoice;
  /** Whether a "sent" invoice already exists for this tenant + period — drives the "Invoice sent" badge. */
  hasSentInvoiceForPeriod: (tenantId: string, period: string) => boolean;
};

const InvoicesContext = createContext<InvoicesContextValue | null>(null);

export function InvoicesProvider({ children }: { children: ReactNode }) {
  const { propertyId } = useSettings();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  // A ref (not state) for the sequence counter — "Send all" records several invoices in the same
  // tick, and only a ref guarantees each of those calls sees the previous one's increment
  // immediately, rather than racing on a stale `useState` closure until the next render.
  const sequenceRef = useRef({ year: new Date().getFullYear(), count: 0 });

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      const thisYear = new Date().getFullYear();
      const [rows, maxSequence] = await Promise.all([
        listInvoices(propertyId),
        getMaxInvoiceSequence(propertyId, thisYear),
      ]);
      if (cancelled) return;
      setInvoices(rows);
      sequenceRef.current = { year: thisYear, count: maxSequence };
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const recordInvoice = (invoice: Omit<Invoice, "id" | "invoiceNumber">): Invoice => {
    const thisYear = new Date().getFullYear();
    if (sequenceRef.current.year !== thisYear) sequenceRef.current = { year: thisYear, count: 0 };
    sequenceRef.current = { year: thisYear, count: sequenceRef.current.count + 1 };
    const invoiceNumber = `INV-${thisYear}-${String(sequenceRef.current.count).padStart(4, "0")}`;
    const created: Invoice = { ...invoice, id: crypto.randomUUID(), invoiceNumber };
    setInvoices((prev) => [created, ...prev]);
    if (propertyId) void insertInvoice(propertyId, created.id, created).catch((e) => console.error("Failed to save invoice", e));
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
