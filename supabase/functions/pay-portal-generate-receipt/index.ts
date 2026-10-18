// Generates a branded PDF rent receipt right after a successful mobile-money payment and saves it
// straight into the tenant's Documents (tenant_documents / the private tenant-documents bucket —
// same place the landlord-side Tenant Profile page's Documents tab already reads from).
//
// PDF rendering: jsPDF, hand-laid-out with its drawing API rather than converting HTML — Supabase
// edge functions run on Deno Deploy, which can't run a headless browser, so true HTML+CSS-to-PDF
// isn't available here without paying for a third-party rendering API. jsPDF runs natively in Deno
// and is the standard approach for generating invoices/receipts server-side.
//
// Layout (v5, designed and signed off on a canvas before any of it was built here): a full-width
// brand-navy masthead carrying the property, the receipt number, the amount at 64px and the paid
// mark, so the only question the document exists to answer is settled before anything else is
// read; then, on white, a "Paid by" / "Paid to" pair, an itemized table from
// collections.line_items with its own "Processing fee" row, a tinted totals band separating what
// the phone was debited from the rent actually settled and the balance left after it, the
// mobile-money method and Lenco reference, and a centered "Powered by Instay Manage" lockup at the
// foot. A part payment gets an amber band directly under the masthead stating the shortfall,
// rather than the small grey note it used to be easy to miss.
//
// Why v4 looked thin next to the reports: it was set in jsPDF's built-in Helvetica at 8 to 13pt,
// so its "hero" amount rendered at roughly 17px on an A4 page among 8pt labels, with no size
// contrast anywhere. This one embeds the app's own pairing, Inter and Fraunces (see
// registerFonts), works in px like generate-report does, and runs a real type scale.
//
// Colours are the app's own tokens now (src/index.css), not the green this file used to invent.
//
// No amount-in-words, no payment-history table (a receipt is generated per payment, so history
// would only ever have shown the one row already above it).
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

type Payload = { tenantId?: string; sessionToken?: string; collectionId?: string; recordedFor?: string };
type LineItem = { label: string; amount: number };

// Straight from the app's own design tokens in src/index.css (--color-brand, --color-brand-soft,
// --color-ink, --color-muted, --color-line). The receipt used to run a green-tinted palette of its
// own that appeared nowhere else in the product.
const COLOR = {
  brand: [30, 58, 138] as [number, number, number],
  brandSoft: [232, 236, 249] as [number, number, number],
  brandSoftRule: [205, 214, 239] as [number, number, number],
  onBrand: [255, 255, 255] as [number, number, number],
  onBrandMuted: [205, 212, 232] as [number, number, number],
  onBrandBody: [232, 236, 246] as [number, number, number],
  bandLabel: [68, 80, 107] as [number, number, number],
  ink: [33, 37, 41] as [number, number, number],
  muted: [108, 117, 125] as [number, number, number],
  rule: [221, 226, 234] as [number, number, number],
  paid: [6, 95, 70] as [number, number, number],
  amberInk: [138, 75, 6] as [number, number, number],
  amberBg: [253, 244, 231] as [number, number, number],
  amberRule: [240, 223, 196] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
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

// Portrait A4 at 96dpi, in px, so every coordinate below matches the approved design 1:1 (the
// same unit choice generate-report makes, and the reason its layouts are easier to reason about
// than this file's old millimetre maths).
const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 56;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL2_X = MARGIN + (CONTENT_W - 48) / 2 + 48;
const MASTHEAD_H = 296;
const PARTIAL_BAND_H = 46;

// jsPDF's setFontSize is always in points whatever the document's unit, so a size meant to read as
// 13px has to be converted or every string renders about a third too large (the same trap
// generate-report documents).
const PX_TO_PT = 0.75;

type FontFace = "sans" | "sansBold" | "display";
type Ctx = { doc: jsPDF; sans: string; display: string };

function setFont(ctx: Ctx, face: FontFace, sizePx: number, color: [number, number, number]): void {
  if (face === "display") ctx.doc.setFont(ctx.display, "bold");
  else ctx.doc.setFont(ctx.sans, face === "sansBold" ? "bold" : "normal");
  ctx.doc.setFontSize(sizePx * PX_TO_PT);
  ctx.doc.setTextColor(...color);
}

async function fetchFontBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  } catch {
    return null;
  }
}

const INTER_REGULAR_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/static/Inter-Regular.ttf";
const INTER_BOLD_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/static/Inter-Bold.ttf";
// Fraunces is the app's own display face (src/index.css --font-display). The repo has moved its
// static instances around between releases, so try the known paths in turn and fall back to the
// variable file, which renders at its default instance rather than not at all.
const FRAUNCES_URLS = [
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/fraunces/static/Fraunces_9pt-SemiBold.ttf",
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/fraunces/static/Fraunces_9pt/Fraunces_9pt-SemiBold.ttf",
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
];

/** Registers Inter (body) and Fraunces (display) on the doc, matching the app's own type pairing.
 * Either can fail to fetch without failing the receipt: the sans falls back to jsPDF's built-in
 * Helvetica, and the display face falls back to the sans. Helvetica alone is what the receipt used
 * to be set in, and is most of why it read as flat next to the reports. */
async function registerFonts(doc: jsPDF): Promise<{ sans: string; display: string }> {
  let sans = "helvetica";
  const [regular, bold] = await Promise.all([fetchFontBase64(INTER_REGULAR_URL), fetchFontBase64(INTER_BOLD_URL)]);
  if (regular && bold) {
    try {
      doc.addFileToVFS("Inter-Regular.ttf", regular);
      doc.addFont("Inter-Regular.ttf", "Inter", "normal");
      doc.addFileToVFS("Inter-Bold.ttf", bold);
      doc.addFont("Inter-Bold.ttf", "Inter", "bold");
      sans = "Inter";
    } catch {
      sans = "helvetica";
    }
  }

  let display = sans;
  for (const url of FRAUNCES_URLS) {
    const data = await fetchFontBase64(url);
    if (!data) continue;
    try {
      doc.addFileToVFS("Fraunces.ttf", data);
      doc.addFont("Fraunces.ttf", "Fraunces", "bold");
      display = "Fraunces";
      break;
    } catch {
      // try the next candidate
    }
  }
  return { sans, display };
}

/** The paid mark, set against the amount it confirms: outlined white on the masthead when the
 * payment cleared the balance, a white chip with the amber state when it only partly did. */
function drawPill(ctx: Ctx, label: string, rightX: number, centerY: number, variant: "paid" | "part"): void {
  const { doc } = ctx;
  setFont(ctx, "sansBold", 13, variant === "paid" ? COLOR.onBrand : COLOR.amberInk);
  const textW = doc.getTextWidth(label);
  const iconW = 15;
  const gap = 8;
  const padLeft = variant === "paid" ? 14 : 16;
  const padRight = 18;
  const h = 30;
  const w = padLeft + iconW + gap + textW + padRight;
  const x = rightX - w;
  const y = centerY - h / 2;

  if (variant === "paid") {
    doc.setDrawColor(...COLOR.onBrandMuted);
    doc.setLineWidth(1.5);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "S");
    doc.setDrawColor(...COLOR.onBrand);
    doc.setLineWidth(2.1);
    const cx = x + padLeft;
    doc.line(cx + 2, centerY + 0.5, cx + 5.8, centerY + 4.2);
    doc.line(cx + 5.8, centerY + 4.2, cx + 12.5, centerY - 4.3);
  } else {
    doc.setFillColor(...COLOR.white);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
    doc.setFillColor(...COLOR.amberInk);
    doc.circle(x + padLeft + iconW / 2, centerY, 4.5, "F");
  }

  setFont(ctx, "sansBold", 13, variant === "paid" ? COLOR.onBrand : COLOR.amberInk);
  doc.text(label, x + padLeft + iconW + gap, centerY + 4.5);
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
  // "Recorded" mode: a payment the landlord's import recorded as already made before the tenant
  // joined (no Lenco collection exists for it). The caller names only the charge it settled, by
  // label; every figure is read back from the import's own ledger rows below.
  const recordedFor = payload.recordedFor?.trim() ?? "";
  if (!tenantId || !sessionToken || (!collectionId && !recordedFor)) {
    return new Response(JSON.stringify({ error: "tenantId, sessionToken and collectionId (or recordedFor) are required" }), {
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

  // deno-lint-ignore no-explicit-any
  let collection: any = null;
  let recordedChargeId = "";
  if (recordedFor) {
    // Shape the import's ledger rows like a collection so one drawing path serves both. Only
    // payments the import itself wrote count (origin 'import', not voided, linked to a charge
    // whose label is the one asked for), so this can't be used to mint a receipt for anything else.
    const { data: tenantRow } = await supabase.from("tenants").select("property_id").eq("id", tenantId).maybeSingle();
    const { data: importPayments } = await supabase
      .from("ledger_entries")
      .select("id, amount, created_at, charge_id")
      .eq("tenant_id", tenantId)
      .eq("event_type", "payment")
      .eq("origin", "import")
      .is("voided_at", null)
      .not("charge_id", "is", null)
      .order("created_at", { ascending: true });
    const chargeIds = [...new Set((importPayments ?? []).map((r: { charge_id: string }) => r.charge_id))];
    const { data: charges } = chargeIds.length
      ? await supabase.from("ledger_entries").select("id, label, amount").in("id", chargeIds).eq("label", recordedFor).is("voided_at", null)
      : { data: [] };
    const charge = (charges ?? [])[0] as { id: string; label: string; amount: number } | undefined;
    const settled = (importPayments ?? []).filter((r: { charge_id: string }) => charge && r.charge_id === charge.id);
    if (tenantRow && charge && settled.length > 0) {
      const paid = settled.reduce((sum: number, r: { amount: number }) => sum + Math.abs(Number(r.amount)), 0);
      recordedChargeId = charge.id;
      collection = {
        id: settled[0].id,
        tenant_id: tenantId,
        property_id: tenantRow.property_id,
        amount: paid,
        phone: null,
        operator: null,
        status: "successful",
        updated_at: settled[settled.length - 1].created_at,
        line_items: [{ label: charge.label, amount: paid }],
        fee_amount: 0,
        owed_before: Number(charge.amount),
        lenco_collection_id: null,
      };
    }
  } else {
    const { data } = await supabase
      .from("collections")
      .select("id, tenant_id, property_id, amount, phone, operator, status, updated_at, line_items, fee_amount, owed_before, lenco_collection_id")
      .eq("id", collectionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    collection = data;
  }

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
  const filePath = recordedFor
    ? `${collection.property_id}/${tenantId}/recorded-${recordedChargeId}-receipt.pdf`
    : `${collection.property_id}/${tenantId}/${collectionId}-receipt.pdf`;
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
    .or(`idempotency_key.eq.lenco_payment:${collectionId},idempotency_key.like.lenco_payment:${collectionId}:%`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const entryLabel: string | null = entry?.label ?? null;

  // Collections started since allocate_payment already name every line exactly as the ledger does
  // ("Broken window", "October 2026 rent", "November 2026 rent (paid in advance)"), so they print
  // as stored. Only older ones carry the vague "Rent paid in advance", which gets its month here.
  // Both advance wordings are recognised: "November 2026 rent (paid in advance)" now, and
  // "Rent for November 2026 (paid in advance)" on rows written before the wording was unified.
  const ADVANCE_RE = /^(?:Rent for (.+) \(paid in advance\)|(.+) rent \(paid in advance\))$/;
  let lineItems: LineItem[] = rawItems.map((i) =>
    i.label === "Rent paid in advance" ? { ...i, label: `${advanceLabel} rent (paid in advance)` } : i
  );
  const advanceLine = lineItems.map((i) => i.label.match(ADVANCE_RE)).find((m) => m !== null);
  if (advanceLine) advanceLabel = advanceLine[1] ?? advanceLine[2];
  let coversAdvance = !!advanceLine;
  // Only a single-line payment can be renamed wholesale from its ledger row; a payment that
  // settled several charges keeps the stored line items.
  if (entryLabel && rawItems.length <= 1) {
    const advanceMatch = entryLabel.match(ADVANCE_RE);
    if (advanceMatch) {
      advanceLabel = advanceMatch[1] ?? advanceMatch[2];
      coversAdvance = true;
      lineItems = [{ label: entryLabel, amount: rentPortion }];
    } else if (entryLabel.startsWith("Mobile money payment, ")) {
      const what = entryLabel.slice("Mobile money payment, ".length);
      coversAdvance = false;
      lineItems = [{ label: what === "towards balance" ? "Payment towards your balance" : what.charAt(0).toUpperCase() + what.slice(1), amount: rentPortion }];
    }
  }
  const balanceAfter = owedBefore != null ? Math.max(0, Math.round((owedBefore - rentPortion) * 100) / 100) : null;
  // Only call it a rent receipt when every line is rent: a payment for a broken window (or rent plus
  // a one-off charge) is a payment receipt.
  const allRent = lineItems.every((i) => /\brent\b/i.test(i.label));
  const fileTitle = isPartial
    ? "Partial payment receipt"
    : !allRent
      ? "Payment receipt"
      : coversAdvance
        ? `${advanceLabel} rent receipt`
        : entryLabel?.endsWith("towards balance")
          ? "Payment receipt"
          : `${monthLabel} rent receipt`;

  const logoDataUrl = await fetchLogoDataUrl(IPM_LOGO_URL);

  const doc = new jsPDF({ unit: "px", format: [PAGE_W, PAGE_H] });
  const faces = await registerFonts(doc);
  const ctx: Ctx = { doc, sans: faces.sans, display: faces.display };

  const bodyTop = MASTHEAD_H + (isPartial ? PARTIAL_BAND_H : 0);
  const timeLabel = paidAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const purpose =
    lineItems.length === 1
      ? lineItems[0].label
      : `${lineItems[0].label} and ${lineItems.length - 1} more`;

  // Masthead: the whole point of the document, settled before anything else is read. The amount is
  // the rent that was actually settled; what the phone was debited (rent plus the processing fee)
  // is broken out in the totals band below, which is the distinction tenants ask about most.
  doc.setFillColor(...COLOR.brand);
  doc.rect(0, 0, PAGE_W, MASTHEAD_H, "F");

  setFont(ctx, "display", 23, COLOR.onBrand);
  doc.text(property?.name ?? "Your property", MARGIN, 70);
  if (property?.address) {
    setFont(ctx, "sans", 12.5, COLOR.onBrandMuted);
    doc.text(property.address, MARGIN, 92);
  }

  setFont(ctx, "sans", 11.5, COLOR.onBrandMuted);
  doc.text("Receipt number", RIGHT, 68, { align: "right" });
  setFont(ctx, "sansBold", 14, COLOR.onBrand);
  doc.text(shortReceiptNumber(collection.id), RIGHT, 89, { align: "right" });

  setFont(ctx, "sans", 12.5, COLOR.onBrandMuted);
  doc.text(recordedFor ? "Payment recorded" : "Payment received", MARGIN, 178);
  setFont(ctx, "display", 64, COLOR.onBrand);
  doc.text(formatMoney(rentPortion), MARGIN, 240);
  setFont(ctx, "sans", 13.5, COLOR.onBrandBody);
  doc.text(recordedFor ? `${purpose}, recorded on ${paidOnLabel}` : `${purpose}, paid on ${paidOnLabel} at ${timeLabel}`, MARGIN, 268);

  drawPill(ctx, isPartial ? "Part paid" : recordedFor ? "Recorded payment" : "Paid in full", RIGHT, 258, isPartial ? "part" : "paid");

  // A shortfall is stated in its own band rather than left as a grey note someone can miss.
  if (isPartial) {
    doc.setFillColor(...COLOR.amberBg);
    doc.rect(0, MASTHEAD_H, PAGE_W, PARTIAL_BAND_H, "F");
    doc.setDrawColor(...COLOR.amberRule);
    doc.setLineWidth(1);
    doc.line(0, MASTHEAD_H + PARTIAL_BAND_H, PAGE_W, MASTHEAD_H + PARTIAL_BAND_H);
    setFont(ctx, "sans", 13.5, COLOR.amberInk);
    doc.text("This payment did not clear the full amount due.", MARGIN, MASTHEAD_H + 29);
    setFont(ctx, "sansBold", 14, COLOR.amberInk);
    doc.text(`${formatMoney(remaining)} still owed`, RIGHT, MASTHEAD_H + 29, { align: "right" });
  }

  // Who paid whom. "Bill from / Bill to" was invoice language on a document that proves a payment
  // already happened, and nobody is being billed by it.
  setFont(ctx, "sans", 11.5, COLOR.muted);
  doc.text("Paid by", MARGIN, bodyTop + 50);
  doc.text("Paid to", COL2_X, bodyTop + 50);

  setFont(ctx, "sansBold", 15, COLOR.ink);
  doc.text(tenant?.name ?? "Tenant", MARGIN, bodyTop + 74);
  doc.text(settings?.landlord_name ?? property?.name ?? "Landlord", COL2_X, bodyTop + 74);

  setFont(ctx, "sans", 13, COLOR.muted);
  const tenantPlace = [room ? `Room ${room}` : null, roomType].filter(Boolean).join(", ");
  if (tenantPlace) doc.text(tenantPlace, MARGIN, bodyTop + 94);
  if (property?.name) doc.text(property.name, COL2_X, bodyTop + 94);
  if (tenantPhone) doc.text(tenantPhone, MARGIN, bodyTop + 113);
  if (settings?.landlord_phone) doc.text(settings.landlord_phone, COL2_X, bodyTop + 113);

  doc.setDrawColor(...COLOR.rule);
  doc.setLineWidth(1);
  doc.line(MARGIN, bodyTop + 143, RIGHT, bodyTop + 143);

  setFont(ctx, "sans", 11.5, COLOR.muted);
  doc.text("What this covers", MARGIN, bodyTop + 172);
  doc.text("Amount", RIGHT, bodyTop + 172, { align: "right" });

  let rowTop = bodyTop + 182;
  const ROW_H = 44;
  for (const item of lineItems) {
    doc.setDrawColor(...COLOR.rule);
    doc.setLineWidth(1);
    doc.line(MARGIN, rowTop, RIGHT, rowTop);
    setFont(ctx, "sans", 13.5, COLOR.ink);
    doc.text(doc.splitTextToSize(item.label, CONTENT_W - 120)[0] ?? item.label, MARGIN, rowTop + 27);
    setFont(ctx, "sans", 14, COLOR.ink);
    doc.text(formatMoney(item.amount), RIGHT, rowTop + 27, { align: "right" });
    rowTop += ROW_H;
  }
  if (feeAmount > 0) {
    doc.setDrawColor(...COLOR.rule);
    doc.setLineWidth(1);
    doc.line(MARGIN, rowTop, RIGHT, rowTop);
    setFont(ctx, "sans", 13.5, COLOR.muted);
    doc.text("Processing fee", MARGIN, rowTop + 27);
    setFont(ctx, "sans", 14, COLOR.muted);
    doc.text(formatMoney(feeAmount), RIGHT, rowTop + 27, { align: "right" });
    rowTop += ROW_H;
  }

  const bandTop = rowTop + 20;
  // A recorded payment has no phone debit, so its band drops the "Total charged" row.
  const BAND_H = recordedFor ? (balanceAfter != null ? 108 : 62) : balanceAfter != null ? 148 : 102;
  const rentRowY = bandTop + (recordedFor ? 36 : 76);
  doc.setFillColor(...COLOR.brandSoft);
  doc.rect(MARGIN, bandTop, CONTENT_W, BAND_H, "F");

  if (!recordedFor) {
    setFont(ctx, "sans", 13.5, COLOR.bandLabel);
    doc.text("Total charged to your phone", MARGIN + 24, bandTop + 36);
    setFont(ctx, "sans", 15, COLOR.ink);
    doc.text(formatMoney(collection.amount), RIGHT - 24, bandTop + 36, { align: "right" });
  }

  setFont(ctx, "sansBold", 14, COLOR.ink);
  doc.text(recordedFor ? "Rent recorded as paid" : "Rent settled", MARGIN + 24, rentRowY);
  setFont(ctx, "display", 26, COLOR.brand);
  doc.text(formatMoney(rentPortion), RIGHT - 24, rentRowY, { align: "right" });

  if (balanceAfter != null) {
    doc.setDrawColor(...COLOR.brandSoftRule);
    doc.setLineWidth(1);
    doc.line(MARGIN + 24, rentRowY + 20, RIGHT - 24, rentRowY + 20);
    setFont(ctx, "sans", 13.5, COLOR.bandLabel);
    doc.text("Balance on your account after this payment", MARGIN + 24, rentRowY + 50);
    setFont(ctx, "sansBold", 15, balanceAfter > 0 ? COLOR.amberInk : COLOR.paid);
    doc.text(formatMoney(balanceAfter), RIGHT - 24, rentRowY + 50, { align: "right" });
  }

  const detailsY = bandTop + BAND_H + 42;
  const operatorLabel = OPERATOR_LABEL[collection.operator ?? ""] ?? collection.operator ?? "Mobile money";
  setFont(ctx, "sans", 11.5, COLOR.muted);
  doc.text(recordedFor ? "Recorded by" : "Paid with", MARGIN, detailsY);
  setFont(ctx, "sans", 13.5, COLOR.ink);
  if (recordedFor) {
    doc.text(settings?.landlord_name ?? property?.name ?? "Your property manager", MARGIN, detailsY + 21);
    setFont(ctx, "sans", 11.5, COLOR.muted);
    doc.text("Recorded on", COL2_X, detailsY);
    setFont(ctx, "sans", 13.5, COLOR.ink);
    doc.text(paidOnLabel, COL2_X, detailsY + 21);
  } else {
    doc.text(`${operatorLabel} mobile money, number ending ${lastDigits(collection.phone ?? "", 3)}`, MARGIN, detailsY + 21);
  }
  if (collection.lenco_collection_id) {
    setFont(ctx, "sans", 11.5, COLOR.muted);
    doc.text("Reference", COL2_X, detailsY);
    setFont(ctx, "sans", 13.5, COLOR.ink);
    doc.text(doc.splitTextToSize(collection.lenco_collection_id, CONTENT_W / 2 - 24)[0] ?? collection.lenco_collection_id, COL2_X, detailsY + 21);
  }

  // Footer: the company lockup, centered, with the mark at a size it can actually be read at.
  doc.setDrawColor(...COLOR.rule);
  doc.setLineWidth(1);
  doc.line(MARGIN, 1000, RIGHT, 1000);

  setFont(ctx, "sans", 11, COLOR.muted);
  doc.text("Powered by", PAGE_W / 2, 1022, { align: "center" });

  const wordmark = "Instay Manage";
  setFont(ctx, "display", 17, COLOR.brand);
  const wordmarkW = doc.getTextWidth(wordmark);
  const markW = logoDataUrl ? 26 : 0;
  const markGap = logoDataUrl ? 10 : 0;
  const groupX = PAGE_W / 2 - (markW + markGap + wordmarkW) / 2;
  if (logoDataUrl) fitImage(doc, logoDataUrl, groupX + markW / 2, 1046, markW, 31);
  doc.text(wordmark, groupX + markW + markGap, 1052);

  setFont(ctx, "sans", 10.5, COLOR.muted);
  doc.text(
    recordedFor
      ? "This confirms a payment recorded by your property manager. Generated automatically, no signature required."
      : "Keep this receipt as proof of payment. Generated automatically, no signature required.",
    PAGE_W / 2,
    1085,
    { align: "center" }
  );


  const pdfBytes = doc.output("arraybuffer");

  const fileName = recordedFor ? `${recordedFor} receipt.pdf` : `${fileTitle}.pdf`;

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
