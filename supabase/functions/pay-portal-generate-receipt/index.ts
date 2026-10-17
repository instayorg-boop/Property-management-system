// Generates a branded PDF rent receipt right after a successful mobile-money payment and saves it
// straight into the tenant's Documents (tenant_documents / the private tenant-documents bucket —
// same place the landlord-side Tenant Profile page's Documents tab already reads from).
//
// PDF rendering: jsPDF, hand-laid-out with its drawing API rather than converting HTML — Supabase
// edge functions run on Deno Deploy, which can't run a headless browser, so true HTML+CSS-to-PDF
// isn't available here without paying for a third-party rendering API. jsPDF runs natively in Deno
// and is the standard approach for generating invoices/receipts server-side.
//
// Layout (v4): "Rent receipt" title top-left (no brand mark up here, the brand only appears once,
// in the footer lockup), receipt number + date paid, a bill-from (landlord/property, unmasked
// landlord phone) / bill-to (tenant, room + room type, unmasked tenant phone) pair, a bold
// "K2,500.00 paid on <date>" line with a small outlined status mark set directly against it
// (drawStatusPill, green for "Paid in full", amber for "Partly paid", the one accent color on
// the page) and a partial-payment note underneath when the payment didn't clear the balance owed,
// an itemized table sourced from collections.line_items with a separate "Processing fee" row, a
// Total / Amount paid / Balance band set apart with a tint instead of a pair of rules, a paid-via
// line with the Lenco reference underneath it (moved down from the header info block, where it
// used to sit next to a plain "Status" row that the pill above now replaces), and a centered
// "Powered by Instay Manage" footer lockup (icon + wordmark, vertically centered against each
// other). No amount-in-words, no payment-history table (a receipt is generated per payment, so
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
  paid: [31, 122, 77] as [number, number, number],
  amber: [180, 83, 9] as [number, number, number],
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

// Draws a small outlined status mark (check + label), right-aligned at rightEdgeX and vertically
// centered on centerY, set directly against the amount it confirms rather than filed away in the
// header info block as plain text.
function drawStatusPill(
  doc: jsPDF,
  label: string,
  rightEdgeX: number,
  centerY: number,
  color: [number, number, number]
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const textWidth = doc.getTextWidth(label);
  const padX = 2.5;
  const checkW = 4.5;
  const height = 5.5;
  const width = textWidth + padX * 2 + checkW;
  const x = rightEdgeX - width;
  const boxY = centerY - height / 2;
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, boxY, width, height, 1, 1);
  const checkX = x + padX;
  doc.setLineWidth(0.5);
  doc.line(checkX, centerY, checkX + 1.1, centerY + 1.2);
  doc.line(checkX + 1.1, centerY + 1.2, checkX + 2.6, centerY - 1.3);
  doc.setTextColor(...color);
  doc.text(label, checkX + checkW, centerY + 1.1);
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
    .select("id, tenant_id, property_id, amount, phone, operator, status, updated_at, line_items, fee_amount, owed_before, lenco_collection_id")
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
    .select("name, phones, move_in_date, unit_label, rooms!tenants_room_id_fkey(number), room_types(name)")
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

  const room = (tenant?.rooms as { number: string } | null)?.number ?? tenant?.unit_label ?? null;
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


  // "Rent paid in advance" is vague: name the month it actually covers. A tenant who hasn't moved
  // in yet is paying for their move-in month, otherwise it is the month after the payment.
  const moveIn = tenant?.move_in_date ? new Date(tenant.move_in_date) : null;
  const advanceStart =
    moveIn && !Number.isNaN(moveIn.getTime()) && moveIn > paidAt
      ? moveIn
      : new Date(paidAt.getFullYear(), paidAt.getMonth() + 1, 1);
  let advanceLabel = advanceStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const rawItems: LineItem[] =
    Array.isArray(collection.line_items) && collection.line_items.length > 0
      ? (collection.line_items as LineItem[])
      : [{ label: `${monthLabel} rent payment`, amount: rentPortion }];
  // The ledger row written for this payment is the source of truth for what it paid for (the
  // database labels it: a specific month's charge, rent held for a future month, or the balance).
  const { data: entry } = await supabase
    .from("ledger_entries")
    .select("label")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", `lenco_payment:${collectionId}`)
    .maybeSingle();
  const entryLabel: string | null = entry?.label ?? null;

  let lineItems: LineItem[] = rawItems.map((i) =>
    i.label === "Rent paid in advance" ? { ...i, label: `Rent for ${advanceLabel} (paid in advance)` } : i
  );
  let coversAdvance = rawItems.some((i) => i.label === "Rent paid in advance");
  if (entryLabel) {
    const advanceMatch = entryLabel.match(/^Rent for (.+) \(paid in advance\)$/);
    if (advanceMatch) {
      advanceLabel = advanceMatch[1];
      coversAdvance = true;
      lineItems = [{ label: entryLabel, amount: rentPortion }];
    } else if (entryLabel.startsWith("Mobile money payment, ")) {
      const what = entryLabel.slice("Mobile money payment, ".length);
      coversAdvance = false;
      lineItems = [{ label: what === "towards balance" ? "Payment towards your balance" : what.charAt(0).toUpperCase() + what.slice(1), amount: rentPortion }];
    }
  }
  const balanceAfter = owedBefore != null ? Math.max(0, Math.round((owedBefore - rentPortion) * 100) / 100) : null;
  const fileTitle = isPartial
    ? "Partial payment receipt"
    : coversAdvance
      ? `${advanceLabel} rent receipt`
      : entryLabel?.endsWith("towards balance")
        ? "Payment receipt"
        : `${monthLabel} rent receipt`;

  const logoDataUrl = await fetchLogoDataUrl(IPM_LOGO_URL);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 26;

  // Header: "Rent receipt" title, alone, the brand mark only shows once further down in the footer
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLOR.ink);
  doc.text("Rent receipt", margin, y);

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
  doc.text(property?.name ?? "-", margin, y);
  doc.text("Bill to", margin + colWidth, y, { align: "left" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.inkMuted);
  let yFrom = y + 4.5;
  if (settings?.landlord_name) {
    doc.text(`Landlord: ${settings.landlord_name}`, margin, yFrom);
    yFrom += 4.5;
  }
  if (property?.address) {
    const lines = doc.splitTextToSize(property.address, colWidth - 6) as string[];
    doc.text(lines, margin, yFrom);
    yFrom += 4.5 * lines.length;
  }
  if (settings?.landlord_phone) {
    doc.text(settings.landlord_phone, margin, yFrom);
  }

  let yTo = y + 4.5;
  doc.setTextColor(...COLOR.ink);
  doc.text(tenant?.name ?? "-", margin + colWidth, yTo);
  doc.setTextColor(...COLOR.inkMuted);
  yTo += 4.5;
  const roomText = room ? (/^[A-Za-z]?\d+[A-Za-z]?$/.test(room) ? `Room ${room}` : room) : null;
  const roomLine = [roomText, roomType].filter(Boolean).join("    ");
  if (roomLine) {
    doc.text(roomLine, margin + colWidth, yTo);
    yTo += 4.5;
  }
  if (tenantPhone) {
    doc.text(tenantPhone, margin + colWidth, yTo);
  }

  y = Math.max(yFrom, yTo) + 10;

  // Paid line, with a status mark set directly against it instead of a plain "Status" row above
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLOR.ink);
  doc.text(`${formatMoney(collection.amount)} paid on ${paidOnLabel}`, margin, y);
  drawStatusPill(
    doc,
    isPartial ? "Partly paid" : "Paid in full",
    pageWidth - margin,
    y - 3.5,
    isPartial ? COLOR.amber : COLOR.paid
  );
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

  // Total / amount paid / balance, set apart with a tinted band sized to the rows that actually
  // apply (no subtotal row, there's no tax or discount to separate it from total) rather than the
  // old pair of rules around just the Total line.
  y += 6;
  const totalsRows = 2 + (balanceAfter != null ? 1 : 0);
  const rowH = 6;
  const bandPad = 4;
  const bandTop = y - bandPad;
  const bandHeight = (totalsRows - 1) * rowH + bandPad * 2 + 3;
  doc.setFillColor(...COLOR.band);
  doc.rect(margin - 4, bandTop, contentWidth + 8, bandHeight, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.inkMuted);
  doc.text("Total", margin, y);
  doc.setTextColor(...COLOR.ink);
  doc.text(formatMoney(collection.amount), pageWidth - margin, y, { align: "right" });

  y += rowH;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR.ink);
  doc.text("Amount paid", margin, y);
  doc.text(formatMoney(collection.amount), pageWidth - margin, y, { align: "right" });

  if (balanceAfter != null) {
    y += rowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.inkMuted);
    doc.text("Balance after this payment", margin, y);
    doc.setTextColor(...COLOR.ink);
    doc.text(formatMoney(balanceAfter), pageWidth - margin, y, { align: "right" });
  }

  y = bandTop + bandHeight + 4;
  if (coversAdvance) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR.inkMuted);
    doc.text(`This payment is credited towards ${advanceLabel} rent.`, margin, y);
    y += 6;
  }

  // Paid via, with the Lenco reference set underneath it now that Reference has moved out of the
  // header info block, reading more naturally beside how the payment was made than up top.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.inkMuted);
  const operatorLabel = OPERATOR_LABEL[collection.operator ?? ""] ?? collection.operator ?? "Mobile money";
  doc.text(`Paid via ${operatorLabel} mobile money ···${lastDigits(collection.phone ?? "", 3)}`, margin, y);
  if (collection.lenco_collection_id) {
    y += 4.5;
    doc.setFontSize(7.5);
    doc.text(`Reference ${collection.lenco_collection_id}`, margin, y);
  }

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
    upsert: true,
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
