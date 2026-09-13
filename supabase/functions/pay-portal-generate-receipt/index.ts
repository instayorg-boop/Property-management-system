// Generates a branded PDF rent receipt right after a successful mobile-money payment and saves it
// straight into the tenant's Documents (tenant_documents / the private tenant-documents bucket —
// same place the landlord-side Tenant Profile page's Documents tab already reads from).
//
// PDF rendering: jsPDF, hand-laid-out with its drawing API rather than converting HTML — Supabase
// edge functions run on Deno Deploy, which can't run a headless browser, so true HTML+CSS-to-PDF
// isn't available here without paying for a third-party rendering API. jsPDF runs natively in Deno
// and is the standard approach for generating invoices/receipts server-side.
//
// Layout matches the receipt artifact: letterhead with logo, receipt no. and issued timestamp,
// a PAID / PARTIAL PAYMENT stamp sitting in its own row (never overlapping the letterhead), the
// amount spelled out in words, a received-from/received-by pair, a real itemized table sourced
// from collections.line_items + fee_amount, and a paid-via/number/reference row.
//
// Trust boundary: the caller only supplies a collectionId and their session token — every actual
// figure on the receipt (amount, phone, operator, when it happened, what it covered) is read back
// from the `collections` row itself, which only pay-portal-collect-payment (at initiation) and
// lenco-webhook (on confirmation) ever write. A tenant can't forge a receipt for a payment that
// didn't happen, inflate the amount on one that did, or relabel what it was paying toward.
//
// Deploy:  supabase functions deploy pay-portal-generate-receipt
// Invoke:  supabase.functions.invoke("pay-portal-generate-receipt", { body: { tenantId, sessionToken, collectionId } })

import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";
import { corsHeaders, handleOptions } from "./_shared/cors.ts";

type Payload = { tenantId?: string; sessionToken?: string; collectionId?: string };
type LineItem = { label: string; amount: number };

const COLOR = {
  ink: [27, 36, 32] as [number, number, number],
  inkMuted: [91, 102, 95] as [number, number, number],
  green: [47, 82, 51] as [number, number, number],
  amber: [156, 107, 34] as [number, number, number],
  rule: [225, 227, 222] as [number, number, number],
};

function formatMoney(amount: number): string {
  return `K${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lastDigits(phone: string, count: number): string {
  return phone.replace(/\D/g, "").slice(-count);
}

const OPERATOR_LABEL: Record<string, string> = { mtn: "MTN", airtel: "Airtel", zamtel: "Zamtel" };

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function threeDigitsToWords(n: number): string {
  let out = "";
  if (n >= 100) {
    out += `${ONES[Math.floor(n / 100)]} hundred`;
    n %= 100;
    if (n) out += " and ";
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)];
    if (n % 10) out += `-${ONES[n % 10]}`;
  } else if (n > 0) {
    out += ONES[n];
  }
  return out;
}

function integerToWords(n: number): string {
  if (n === 0) return "zero";
  const groups: [number, string][] = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
    [1, ""],
  ];
  let remaining = n;
  const parts: string[] = [];
  for (const [value, label] of groups) {
    const count = Math.floor(remaining / value);
    if (count > 0) {
      parts.push(label ? `${threeDigitsToWords(count)} ${label}` : threeDigitsToWords(count));
      remaining %= value;
    }
  }
  return parts.join(" ");
}

function amountToWords(amount: number): string {
  const kwacha = Math.floor(amount);
  const ngwee = Math.round((amount - kwacha) * 100);
  const kwachaWords = `${integerToWords(kwacha)} kwacha`;
  if (ngwee === 0) return capitalize(kwachaWords);
  return capitalize(`${kwachaWords} and ${integerToWords(ngwee)} ngwee`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function fetchLogoDataUrl(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tenantId = payload.tenantId?.trim() ?? "";
  const sessionToken = payload.sessionToken?.trim() ?? "";
  const collectionId = payload.collectionId?.trim() ?? "";
  if (!tenantId || !sessionToken || !collectionId) {
    return new Response(JSON.stringify({ error: "tenantId, sessionToken and collectionId are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: verified, error: verifyError } = await supabase.rpc("pay_portal_verify_session", {
    p_tenant_id: tenantId,
    p_session_token: sessionToken,
  });
  if (verifyError || !verified) {
    return new Response(JSON.stringify({ error: "invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: collection } = await supabase
    .from("collections")
    .select("id, tenant_id, property_id, amount, phone, operator, status, updated_at, line_items, fee_amount, owed_before")
    .eq("id", collectionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!collection || collection.status !== "successful") {
    return new Response(JSON.stringify({ error: "No successful payment found for that reference." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, rooms(number)")
    .eq("id", tenantId)
    .maybeSingle();
  const { data: property } = await supabase
    .from("properties")
    .select("name, address, logo_url")
    .eq("id", collection.property_id)
    .maybeSingle();
  const { data: settings } = await supabase
    .from("settings")
    .select("landlord_name")
    .eq("property_id", collection.property_id)
    .maybeSingle();

  const room = (tenant?.rooms as { number: string } | null)?.number ?? null;
  const paidAt = new Date(collection.updated_at);
  const monthLabel = paidAt.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const feeAmount: number = collection.fee_amount ?? 0;
  const owedBefore: number | null = collection.owed_before ?? null;
  const rentPortion = collection.amount - feeAmount;
  const isPartial = owedBefore != null && rentPortion < owedBefore;

  const stampLabel = isPartial ? "PARTIAL PAYMENT" : "PAID";
  const stampColor = isPartial ? COLOR.amber : COLOR.green;
  const title = isPartial ? "Partial payment receipt" : `${monthLabel} rent receipt`;

  const lineItems: LineItem[] =
    Array.isArray(collection.line_items) && collection.line_items.length > 0
      ? (collection.line_items as LineItem[])
      : [{ label: `${monthLabel} rent payment`, amount: rentPortion }];

  const logoDataUrl = await fetchLogoDataUrl(property?.logo_url ?? null);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 24;

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, y - 7, 10, 10);
    } catch {
      // malformed or unsupported image data — fall back to text-only letterhead
    }
  }
  const brandX = logoDataUrl ? margin + 14 : margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLOR.ink);
  doc.text("Instay Property Management", brandX, y - 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text(property?.name ?? "Property", brandX, y + 3);

  doc.setFontSize(8);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text("RECEIPT NO.", pageWidth - margin, y - 4, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.ink);
  doc.text(collection.id, pageWidth - margin, y, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text("ISSUED", pageWidth - margin, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.ink);
  doc.text(
    paidAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
      ", " +
      paidAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    pageWidth - margin,
    y + 9,
    { align: "right" }
  );

  y += 16;
  doc.setDrawColor(...COLOR.rule);
  doc.line(margin, y, pageWidth - margin, y);

  y += 10;
  doc.setDrawColor(...stampColor);
  doc.setLineWidth(0.6);
  const stampWidth = doc.getTextWidth(stampLabel) + 10;
  const stampHeight = 8;
  doc.rect(pageWidth - margin - stampWidth, y - 6, stampWidth, stampHeight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...stampColor);
  doc.text(stampLabel, pageWidth - margin - stampWidth / 2, y, { align: "center" });
  doc.setLineWidth(0.2);

  y += 14;
  doc.setFont("times", "italic");
  doc.setFontSize(14);
  doc.setTextColor(...COLOR.ink);
  doc.text(title, pageWidth / 2, y, { align: "center" });

  y += 12;
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.text(formatMoney(collection.amount), pageWidth / 2, y, { align: "center" });

  y += 6;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text(amountToWords(collection.amount), pageWidth / 2, y, { align: "center" });

  y += 14;
  const colWidth = contentWidth / 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text("RECEIVED FROM", margin, y);
  doc.text("RECEIVED BY", margin + colWidth, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.ink);
  doc.text(tenant?.name ?? "—", margin, y);
  doc.text(property?.name ?? "—", margin + colWidth, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text(room ? `Room ${room}` : "—", margin, y);
  const receivedByLine2 = [settings?.landlord_name, property?.address].filter(Boolean).join(", ");
  if (receivedByLine2) {
    doc.text(receivedByLine2, margin + colWidth, y, { maxWidth: colWidth - 4 });
  }

  y += 14;
  doc.setDrawColor(...COLOR.rule);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text("DESCRIPTION", margin, y);
  doc.text("AMOUNT", pageWidth - margin, y, { align: "right" });
  y += 3;
  doc.line(margin, y, pageWidth - margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const item of lineItems) {
    y += 7;
    doc.setTextColor(...COLOR.ink);
    doc.text(item.label, margin, y);
    doc.text(formatMoney(item.amount), pageWidth - margin, y, { align: "right" });
  }
  if (feeAmount > 0) {
    y += 7;
    doc.setTextColor(...COLOR.inkMuted);
    doc.setFontSize(9);
    doc.text("Sending fee", margin, y);
    doc.text(formatMoney(feeAmount), pageWidth - margin, y, { align: "right" });
    doc.setFontSize(10);
  }

  y += 5;
  doc.setDrawColor(...COLOR.ink);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.ink);
  doc.text("Total paid", margin, y);
  doc.text(formatMoney(collection.amount), pageWidth - margin, y, { align: "right" });

  y += 16;
  const metaColWidth = contentWidth / 3;
  const metaLabels = ["PAID VIA", "NUMBER", "TRANSACTION REF"];
  const metaValues = [
    OPERATOR_LABEL[collection.operator ?? ""] ?? collection.operator ?? "Mobile money",
    `···${lastDigits(collection.phone ?? "", 3)}`,
    collection.id,
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.inkMuted);
  metaLabels.forEach((label, i) => doc.text(label, margin + metaColWidth * i, y));
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.ink);
  metaValues.forEach((value, i) => doc.text(value, margin + metaColWidth * i, y));

  y += 16;
  doc.setDrawColor(...COLOR.rule);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text(
    "This is a computer generated receipt from Instay Property Management and needs no signature. Keep it for your records.",
    pageWidth / 2,
    y,
    { align: "center", maxWidth: contentWidth }
  );

  const pdfBytes = doc.output("arraybuffer");

  const fileName = `${title}.pdf`;
  const filePath = `${collection.property_id}/${tenantId}/${crypto.randomUUID()}-receipt.pdf`;

  const { error: uploadError } = await supabase.storage.from("tenant-documents").upload(filePath, pdfBytes, {
    contentType: "application/pdf",
  });
  if (uploadError) {
    return new Response(JSON.stringify({ error: "Failed to save the receipt." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: docRow, error: insertError } = await supabase
    .from("tenant_documents")
    .insert({
      tenant_id: tenantId,
      property_id: collection.property_id,
      name: fileName,
      file_path: filePath,
      content_type: "application/pdf",
      size_bytes: pdfBytes.byteLength,
    })
    .select("id")
    .single();
  if (insertError) {
    return new Response(JSON.stringify({ error: "Receipt generated, but couldn't be filed under Documents." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, documentId: docRow.id, name: fileName }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
