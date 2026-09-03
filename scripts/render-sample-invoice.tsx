import { pdf } from "@react-pdf/renderer";
import { writeFileSync } from "node:fs";
import InvoicePDF, { type InvoiceDocData } from "../src/landlord/components/InvoicePDF";

const samples: InvoiceDocData[] = [
  {
    invoiceNumber: "INV-2026-0007",
    issueDateLabel: "1 Sep 2026",
    dueDateLabel: "5 Sep 2026",
    dueDateIsUrgent: true,
    propertyName: "Kabulonga House",
    landlordName: "Bernard Mwansa",
    propertyAddress: "Plot 14, Kabulonga, Lusaka",
    landlordPhone: "0977 000 000",
    billToName: "B. Phiri",
    billToSubline: "Room 08 · Kabulonga House",
    billToPhone: "0955 345 678",
    periodLabel: "September 2026",
    lineItems: [
      { label: "September 2026 rent", amount: 950 },
      { label: "Outstanding balance (August)", amount: 190, tint: true },
      { label: "Late penalty (12 days overdue)", amount: 180, tint: true },
    ],
    total: 1320,
    paymentLink: "pay.instay.co/kabulonga-house",
    dailyPenaltyRate: 15,
    paymentMethods: [{ type: "mtn", number: "0977 000 111" }, { type: "airtel", number: "0977 222 333" }, { type: "cash" }, { type: "bank", bankName: "Zanaco", accountNumber: "0123456789" }],
  },
  {
    invoiceNumber: "INV-2026-0008",
    issueDateLabel: "1 Sep 2026",
    dueDateLabel: "5 Sep 2026",
    dueDateIsUrgent: false,
    propertyName: "Kabulonga House",
    landlordName: "Bernard Mwansa",
    propertyAddress: "Plot 14, Kabulonga, Lusaka",
    landlordPhone: "0977 000 000",
    billToName: "A. Mwansa",
    billToSubline: "Room 12 · Kabulonga House",
    billToPhone: "0977 123 456",
    periodLabel: "September 2026",
    lineItems: [{ label: "September 2026 rent pro-rata (16 days)", amount: 640 }],
    total: 640,
    paymentLink: "pay.instay.co/kabulonga-house",
    dailyPenaltyRate: 15,
    paymentMethods: [{ type: "mtn", number: "0977 000 111" }, { type: "cash" }],
  },
];

const run = async () => {
  const blob = await pdf(<InvoicePDF invoices={samples} />).toBlob();
  const buffer = Buffer.from(await blob.arrayBuffer());
  writeFileSync("scripts/sample-invoice.pdf", buffer);
  console.log("Wrote scripts/sample-invoice.pdf");
};

run();
