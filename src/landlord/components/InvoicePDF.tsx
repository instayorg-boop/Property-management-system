import { Document, Page, View, Text, StyleSheet, Svg, Path, Circle } from "@react-pdf/renderer";
import type { InvoiceLineItem } from "../invoiceUtils";
import { formatMoney } from "../invoiceUtils";

const BRAND = "#FF385C";

export type InvoicePaymentMethod = {
  type: "mtn" | "airtel" | "cash" | "bank" | "other";
  number?: string;
  bankName?: string;
  accountNumber?: string;
  /** Platform name for "other" — e.g. "Mukuru". */
  label?: string;
};

export type InvoiceDocData = {
  invoiceNumber: string;
  issueDateLabel: string;
  dueDateLabel: string;
  dueDateIsUrgent: boolean;
  propertyName: string;
  landlordName: string;
  propertyAddress: string;
  landlordPhone: string;
  billToName: string;
  billToSubline: string;
  billToPhone?: string;
  periodLabel: string;
  lineItems: InvoiceLineItem[];
  total: number;
  paymentLink: string;
  dailyPenaltyRate: number;
  paymentMethods: InvoicePaymentMethod[];
};

// react-pdf renders its own PDF primitives (not DOM/SVG via react-dom), so icon libraries built
// for the browser — @phosphor-icons/react, @tabler/icons-react — can't be dropped in directly.
// These three are hand-built from the well-known Feather/Tabler-style 24x24 stroke glyphs
// (phone, link, map-pin) using react-pdf's own Svg/Path/Circle primitives instead.
function PhoneGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LinkGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MapPinGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path
        d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={3} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

function BankGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M3 21h18" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 10h18" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 6l7-3l7 3" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 10v11" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 10v11" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 14v3" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 14v3" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 14v3" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a", paddingBottom: 40 },
  accentBar: { height: 4, backgroundColor: BRAND, width: "100%" },
  body: { paddingHorizontal: 32, paddingTop: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BRAND, textTransform: "uppercase", letterSpacing: 1 },
  invoiceTitle: { fontSize: 28, fontFamily: "Helvetica-Bold", marginTop: 4 },
  metaRight: { alignItems: "flex-end" },
  metaLine: { fontSize: 9, color: "#555555", marginTop: 2 },
  metaLineDue: { fontSize: 9, color: "#DC2626", marginTop: 2, fontFamily: "Helvetica-Bold" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e5e5", marginVertical: 16 },
  fromToRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  col: { width: "48%" },
  colLabel: { fontSize: 8, color: "#888888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  colLine: { fontSize: 10, color: "#1a1a1a", marginTop: 1 },
  table: { marginTop: 16, borderTopWidth: 1, borderTopColor: "#e5e5e5" },
  tableHeaderRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e5e5e5" },
  tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  tableRowTinted: { backgroundColor: "#FEF2F2" },
  th: { fontSize: 8, color: "#888888", textTransform: "uppercase", letterSpacing: 0.5 },
  descCol: { flex: 1 },
  amountCol: { width: 90, textAlign: "right" },
  totalRow: { flexDirection: "row", paddingVertical: 10, marginTop: 4, paddingHorizontal: 4 },
  totalLabel: { flex: 1, fontSize: 13, fontFamily: "Helvetica-Bold" },
  totalAmount: { width: 90, textAlign: "right", fontSize: 13, fontFamily: "Helvetica-Bold" },
  payBox: { marginTop: 20, backgroundColor: "#f5f5f5", borderRadius: 6, padding: 16 },
  payHeading: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  payRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  payText: { fontSize: 9, color: "#333333", marginLeft: 8 },
  payLink: { fontSize: 9, color: BRAND, marginLeft: 8 },
  footer: { position: "absolute", bottom: 22, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 8, color: "#999999" },
  pageNumber: { position: "absolute", bottom: 8, left: 32, right: 32, textAlign: "center", fontSize: 7, color: "#bbbbbb" },
});

function InvoicePage({ data }: { data: InvoiceDocData }) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.accentBar} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brandLabel}>Instay PM</Text>
            <Text style={styles.invoiceTitle}>Invoice</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaLine}>{data.invoiceNumber}</Text>
            <Text style={styles.metaLine}>Issued {data.issueDateLabel}</Text>
            <Text style={data.dueDateIsUrgent ? styles.metaLineDue : styles.metaLine}>Due {data.dueDateLabel}</Text>
          </View>
        </View>

        <View style={styles.divider} />
        <View style={styles.fromToRow}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>From</Text>
            <Text style={styles.colLine}>{data.propertyName}</Text>
            <Text style={styles.colLine}>{data.landlordName}</Text>
            <Text style={styles.colLine}>{data.propertyAddress}</Text>
            <Text style={styles.colLine}>{data.landlordPhone}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>To</Text>
            <Text style={styles.colLine}>{data.billToName}</Text>
            <Text style={styles.colLine}>{data.billToSubline}</Text>
            {data.billToPhone && <Text style={styles.colLine}>{data.billToPhone}</Text>}
            <Text style={styles.colLine}>{data.periodLabel}</Text>
          </View>
        </View>
        <View style={styles.divider} />

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.descCol]}>Description</Text>
            <Text style={[styles.th, styles.amountCol]}>Amount</Text>
          </View>
          {data.lineItems.map((row, i) => (
            <View key={i} style={[styles.tableRow, row.tint ? styles.tableRowTinted : undefined]}>
              <Text style={styles.descCol}>{row.label}</Text>
              <Text style={styles.amountCol}>{formatMoney(row.amount)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total due</Text>
            <Text style={styles.totalAmount}>{formatMoney(data.total)}</Text>
          </View>
        </View>

        <View style={styles.payBox}>
          <Text style={styles.payHeading}>How to pay</Text>
          <View style={styles.payRow}>
            <LinkGlyph color={BRAND} />
            <Text style={styles.payLink}>{data.paymentLink}</Text>
          </View>
          {data.paymentMethods.map((method, i) => {
            if (method.type === "mtn") {
              return (
                <View key={i} style={styles.payRow}>
                  <PhoneGlyph color="#FFA500" />
                  <Text style={styles.payText}>MTN MoMo to {method.number}</Text>
                </View>
              );
            }
            if (method.type === "airtel") {
              return (
                <View key={i} style={styles.payRow}>
                  <PhoneGlyph color="#DC2626" />
                  <Text style={styles.payText}>Airtel Money to {method.number}</Text>
                </View>
              );
            }
            if (method.type === "bank") {
              return (
                <View key={i} style={styles.payRow}>
                  <BankGlyph color="#555555" />
                  <Text style={styles.payText}>
                    Bank transfer to {method.bankName} {method.accountNumber}
                  </Text>
                </View>
              );
            }
            if (method.type === "other") {
              return (
                <View key={i} style={styles.payRow}>
                  <LinkGlyph color="#555555" />
                  <Text style={styles.payText}>
                    {method.label} to {method.number}
                  </Text>
                </View>
              );
            }
            return (
              <View key={i} style={styles.payRow}>
                <MapPinGlyph color="#555555" />
                <Text style={styles.payText}>Cash payments at the property office</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>
          Due {data.dueDateLabel} · K{data.dailyPenaltyRate.toFixed(2)}/day penalty after the grace period
        </Text>
        <Text style={styles.footerText}>Powered by Instay PM</Text>
      </View>
      <Text
        style={styles.pageNumber}
        fixed
        render={({ pageNumber, totalPages }) =>
          `${data.propertyName} · ${data.landlordName} · ${data.periodLabel} · Page ${pageNumber} of ${totalPages}`
        }
      />
    </Page>
  );
}

/** One or more invoices as a single PDF document — one page per invoice. Used for a single
 * tenant's download, a whole institution's combined invoice, and the "download all as one PDF". */
export default function InvoicePDF({ invoices }: { invoices: InvoiceDocData[] }) {
  return (
    <Document>
      {invoices.map((data, i) => (
        <InvoicePage key={i} data={data} />
      ))}
    </Document>
  );
}
