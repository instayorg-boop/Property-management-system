// Generates a branded PDF rent receipt right after a successful mobile-money payment and saves it
// straight into the tenant's Documents (tenant_documents / the private tenant-documents bucket —
// same place the landlord-side Tenant Profile page's Documents tab already reads from).
//
// PDF rendering: jsPDF, hand-laid-out with its drawing API rather than converting HTML — Supabase
// edge functions run on Deno Deploy, which can't run a headless browser, so true HTML+CSS-to-PDF
// isn't available here without paying for a third-party rendering API. jsPDF runs natively in Deno
// and is the standard approach for generating invoices/receipts server-side.
//
// Layout (v3, Stripe/Anthropic-invoice style): "Receipt" title top-left, small IPM brand mark
// top-right (icon only, aspect-correct — see fitImage), receipt number (short display code) + date
// paid, a bill-from (landlord/property, unmasked landlord phone) / bill-to (tenant, room + room
// type, unmasked tenant phone) pair, a bold "K2,500.00 paid on <date>" line with a partial-payment
// note underneath when the payment didn't clear the balance owed, an itemized table sourced from
// collections.line_items with a separate "Processing fee" row, Total + Amount paid (no subtotal,
// there's no tax/discount to separate it from total), a paid-via line, and a centered "Powered by
// Instay Manage" footer lockup (icon + wordmark, vertically centered against each other). No stamp
// graphic, no amount-in-words, no payment-history table (a receipt is generated per payment, so
// history would only ever have shown the one row already above it).
//
// Logo aspect ratio: jsPDF stretches addImage to whatever width/height you pass, so a non-square
// source forced into a square box (the old bug) looks distorted. fitImage reads the real pixel
// dimensions via doc.getImageProperties and scales to fit inside a max box without stretching.
//
// Trust boundary: the caller only supplies a collectionId and their session token — every actual
// figure on the receipt (amount, phone, operator, when it happened, what it covered) is read back
// from the `collections` row itself, which only pay-portal-collect-payment (at initiation) and
// lenco-webhook (on confirmation) ever write. A tenant can't forge a receipt for a payment that
// didn't happen, inflate the amount on one that did, or relabel what it was paying toward.
//
// Note: tenants.phone is unused in this schema (always null) — the real number lives in the
// tenants.phones array, so the tenant-side number on the receipt reads from phones[0].
//
// Receipt number: collections.id is a full UUID, too long to be a readable receipt number, so this
// derives a short display code (last 12 hex chars, grouped) purely for display — collection.id
// remains the real reference used internally (e.g. by the storage file path).
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
  rule: [229, 229, 224] as [number, number, number],
  band: [244, 245, 242] as [number, number, number],
};

function formatMoney(amount: number): string {
  return `K${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function lastDigits(phone: string, count: number): string {
  return phone.replace(/\D/g, "").slice(-count);
}

function shortReceiptNumber(id: string): string {
  const hex = id.replace(/-/g, "").toUpperCase().slice(-12);
  return hex.match(/.{1,4}/g)?.join("-") ?? hex;
}

const OPERATOR_LABEL: Record<string, string> = { mtn: "MTN", airtel: "Airtel", zamtel: "Zamtel" };

const IPM_LOGO_URL =
  "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png";

async function fetchLogoDataUrl(logoUrl: string): Promise<string | null> {
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

// Places an image inside a maxW x maxH box without stretching, using the image's real pixel
// dimensions (via jsPDF's own getImageProperties) to preserve aspect ratio. Returns the box it
// actually drew into so callers can align other elements against it.
function fitImage(
  doc: jsPDF,
  dataUrl: string,
  centerX: number,
  centerY: number,
  maxW: number,
  maxH: number
): { x: number; y: number; w: number; h: number } | null {
  try {
    const props = doc.getImageProperties(dataUrl);
    const srcRatio = props.width / props.height;
    let w = maxW;
    let h = w / srcRatio;
    if (h > maxH) {
      h = maxH;
      w = h * srcRatio;
    }
    const x = centerX - w / 2;
    const y = centerY - h / 2;
    doc.addImage(dataUrl, "PNG", x, y, w, h);
    return { x, y, w, h };
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

  // Idempotent by collection: the file path is deterministic (keyed on collectionId, not a random
  // uuid) so a second "Generate receipt" tap for the same payment finds the one already on file and
  // hands it straight back instead of rendering + uploading + filing a duplicate PDF for the exact
  // same payment. Checked before any of the PDF work below, not just before the upload, so a repeat
  // tap is cheap too, not just non-duplicating.
  const filePath = `${collection.property_id}/${tenantId}/${collectionId}-receipt.pdf`;
  const { data: existingDoc } = await supabase
    .from("tenant_documents")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("file_path", filePath)
    .maybeSingle();
  if (existingDoc) {
    return new Response(JSON.stringify({ ok: true, documentId: existingDoc.id, name: existingDoc.name }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    // Disambiguated join — same reasoning as pay-portal-resolve-token/index.ts.
    .select("name, phones, rooms!tenants_room_id_fkey(number), room_types(name)")
    .eq("id", tenantId)
    .maybeSingle();
  const { data: property } = await supabase
    .from("properties")
    .select("name, address")
    .eq("id", collection.property_id)
    .maybeSingle();
  const { data: settings } = await supabase
    .from("settings")
    .select("landlord_name, landlord_phone")
    .eq("property_id", collection.property_id)
    .maybeSingle();

  const room = (tenant?.rooms as { number: string } | null)?.number ?? null;
  const roomType = (tenant?.room_types as { name: string } | null)?.name ?? null;
  const tenantPhone: string | null = Array.isArray(tenant?.phones) && tenant.phones.length > 0 ? tenant.phones[0] : null;
  const paidAt = new Date(collection.updated_at);
  const monthLabel = paidAt.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const paidOnLabel = paidAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const feeAmount: number = collection.fee_amount ?? 0;
  const owedBefore: number | null = collection.owed_before ?? null;
  const rentPortion = collection.amount - feeAmount;
  const isPartial = owedBefore != null && rentPortion < owedBefore;
  const remaining = isPartial ? (owedBefore as number) - rentPortion : 0;

  const fileTitle = isPartial ? "Partial payment receipt" : `${monthLabel} rent receipt`;

  const lineItems: LineItem[] =
    Array.isArray(collection.line_items) && collection.line_items.length > 0
      ? (collection.line_items as LineItem[])
      : [{ label: `${monthLabel} rent payment`, amount: rentPortion }];

  const logoDataUrl = await fetchLogoDataUrl(IPM_LOGO_URL);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 26;

  // Header: "Receipt" title left, brand mark (icon only, aspect-correct) right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLOR.ink);
  doc.text("Receipt", margin, y);
  if (logoDataUrl) {
    fitImage(doc, logoDataUrl, pageWidth - margin - 4.5, y - 3.5, 9, 9);
  }

  y += 6;
  doc.setDrawColor(...COLOR.ink);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.ink);
  doc.text("Receipt number", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLOR.inkMuted);
  doc.text(shortReceiptNumber(collection.id), margin + 32, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR.ink);
  doc.text("Date paid", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLOR.inkMuted);
  doc.text(paidOnLabel, margin + 32, y);

  // Bill from / bill to
  y += 12;
  const colWidth = contentWidth / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.ink);
  doc.text(property?.name ?? "—", margin, y);
  doc.text("Bill to", margin + colWidth, y, { align: "left" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.inkMuted);
  let yFrom = y + 4.5;
  if (property?.address) {
    doc.text(property.address, margin, yFrom, { maxWidth: colWidth - 6 });
    yFrom += 4.5;
  }
  if (settings?.landlord_phone) {
    doc.text(settings.landlord_phone, margin, yFrom);
  }

  let yTo = y + 4.5;
  doc.setTextColor(...COLOR.ink);
  doc.text(tenant?.name ?? "—", margin + colWidth, yTo);
  doc.setTextColor(...COLOR.inkMuted);
  yTo += 4.5;
  const roomLine = [room ? `Room ${room}` : null, roomType].filter(Boolean).join("    ");
  if (roomLine) {
    doc.text(roomLine, margin + colWidth, yTo);
    yTo += 4.5;
  }
  if (tenantPhone) {
    doc.text(tenantPhone, margin + colWidth, yTo);
  }

  y = Math.max(yFrom, yTo) + 10;

  // Paid line
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLOR.ink);
  doc.text(`${formatMoney(collection.amount)} paid on ${paidOnLabel}`, margin, y);
  if (isPartial) {
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR.inkMuted);
    doc.text(`Partial payment, ${formatMoney(remaining)} remaining`, margin, y);
  }

  // Line items table
  y += 10;
  doc.setDrawColor(...COLOR.ink);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y -= 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text("Description", margin, y);
  doc.text("Amount", pageWidth - margin, y, { align: "right" });
  y += 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const item of lineItems) {
    y += 8;
    doc.setTextColor(...COLOR.ink);
    doc.text(item.label, margin, y);
    doc.text(formatMoney(item.amount), pageWidth - margin, y, { align: "right" });
  }
  if (feeAmount > 0) {
    y += 6;
    doc.setTextColor(...COLOR.inkMuted);
    doc.setFontSize(8.5);
    doc.text("Processing fee", margin, y);
    doc.text(formatMoney(feeAmount), pageWidth - margin, y, { align: "right" });
    doc.setFontSize(9.5);
  }

  // Total / amount paid — no subtotal row, there's no tax or discount to separate it from total
  y += 6;
  doc.setDrawColor(...COLOR.rule);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text("Total", margin, y);
  doc.setTextColor(...COLOR.ink);
  doc.text(formatMoney(collection.amount), pageWidth - margin, y, { align: "right" });

  y += 4;
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR.ink);
  doc.text("Amount paid", margin, y);
  doc.text(formatMoney(collection.amount), pageWidth - margin, y, { align: "right" });

  // Paid via
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.inkMuted);
  const operatorLabel = OPERATOR_LABEL[collection.operator ?? ""] ?? collection.operator ?? "Mobile money";
  doc.text(`Paid via ${operatorLabel} mobile money ···${lastDigits(collection.phone ?? "", 3)}`, margin, y);

  // Footer: "Powered by Instay Manage" lockup, centered as one group — icon and wordmark share a
  // vertical center line instead of being placed independently (the fix for the stretched/
  // misaligned footer).
  const footerY = doc.internal.pageSize.getHeight() - 30;
  doc.setDrawColor(...COLOR.rule);
  doc.setLineWidth(0.2);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text("Powered by", pageWidth / 2, footerY + 8, { align: "center" });

  const lockupY = footerY + 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const wordmark = "Instay Manage";
  const wordmarkWidth = doc.getTextWidth(wordmark);
  const iconMax = 4.5;
  const gap = 2;
  const groupWidth = (logoDataUrl ? iconMax + gap : 0) + wordmarkWidth;
  const groupX = pageWidth / 2 - groupWidth / 2;

  if (logoDataUrl) {
    fitImage(doc, logoDataUrl, groupX + iconMax / 2, lockupY, iconMax, iconMax);
  }
  doc.setTextColor(...COLOR.ink);
  doc.text(wordmark, groupX + (logoDataUrl ? iconMax + gap : 0), lockupY + 1.5, { align: "left" });

  const pdfBytes = doc.output("arraybuffer");

  const fileName = `${fileTitle}.pdf`;

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
