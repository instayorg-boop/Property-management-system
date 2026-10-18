// Generates a landlord-facing PDF or CSV report (income vs expenses, occupancy, overdue rent) and
// returns a short-lived signed URL to it.
//
// PDF rendering: jsPDF, hand-laid-out with its drawing API — same approach and library as
// pay-portal-generate-receipt/index.ts (Deno Deploy can't run a headless browser, so real
// HTML+CSS-to-PDF isn't available here). Unit is "px" at A4 portrait size (794x1123 at 96dpi),
// rather than jsPDF's default mm/pt units, so every layout number in this file is a plain pixel
// value.
//
// Fonts: Inter regular + bold are fetched from the google/fonts repo (via a jsdelivr GitHub proxy)
// and embedded, same fetch-then-embed shape pay-portal-generate-receipt uses for the logo. If either
// fetch fails for any reason, this falls back to jsPDF's built-in Helvetica rather than failing the
// whole report — a slightly-off font is a much smaller problem than no report. (Spec asks for a
// medium/500 weight too; that's approximated with bold at a smaller size rather than embedding a
// third font file, since nothing in the three report layouts actually needs a true medium weight to
// read correctly.)
//
// Logo: the app's own Instay Manage brand mark (not the property's own logo) — these reports carry
// Instay Manage's branding, the same way pay-portal-generate-receipt's receipts do. Falls back to a
// dark green rounded square with "IPM" if that fetch ever fails.
//
// Auth: the request is made with the signed-in landlord's own session (forwarded via the
// Authorization header) and every read below goes through a client scoped to that session, so RLS
// — not a client-supplied propertyId — is what decides whether the caller can see this property's
// data at all. There is no service-role client in this function.
//
// Deploy:  supabase functions deploy generate-report
// Invoke:  supabase.functions.invoke("generate-report", { body: { report_type, format, property_id, date_from, date_to } })
//
// Request:  { report_type: "income_vs_expenses" | "occupancy" | "overdue_rent",
//             format: "pdf" | "csv", property_id: string, date_from: string, date_to: string }
//           date_from/date_to are "YYYY-MM-DD". For occupancy/overdue_rent only date_to is used
//           (treated as "as at" this date); income_vs_expenses uses the full range.
// Response: { ok: true, url: string, fileName: string }  — url is a 5-minute signed URL.
//           { error: string } on any failure, with a 4xx/5xx status.

import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";

// Inlined rather than imported from ../_shared/cors.ts — this function is deployed via the
// Supabase MCP tool's deploy_edge_function (no relative-import bundling), so its live source has
// no _shared dependency. Kept identical to _shared/cors.ts's content so a future CLI-based
// `supabase functions deploy generate-report` (which does resolve relative imports) still deploys
// the same behavior either way.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

type ReportType = "income_vs_expenses" | "occupancy" | "overdue_rent" | "payouts_sent" | "payments_received";
type ReportFormat = "pdf" | "csv";

type Payload = {
  report_type?: ReportType;
  format?: ReportFormat;
  property_id?: string;
  date_from?: string;
  date_to?: string;
  // Only used by payouts_sent/payments_received — a single status to narrow the range to (e.g.
  // "successful"), or omitted/undefined for every status. Validated against each report's own
  // status enum below rather than trusted as-is.
  status?: string;
};

const REPORT_SLUG: Record<ReportType, string> = {
  income_vs_expenses: "income-expenses",
  occupancy: "occupancy-rate",
  overdue_rent: "arrears-delinquency",
  payouts_sent: "transfers-sent",
  payments_received: "payments-received",
};

const REPORT_TITLE: Record<ReportType, string> = {
  income_vs_expenses: "Income vs expenses",
  occupancy: "Occupancy rate",
  overdue_rent: "Overdue rent",
  payouts_sent: "Transfers sent",
  payments_received: "Payments received",
};

const REPORT_AUDIENCE: Record<ReportType, string> = {
  income_vs_expenses: "Landlord / Accountant",
  occupancy: "Property Manager / Investor",
  overdue_rent: "Property Manager / Operations",
  payouts_sent: "Landlord / Accountant",
  payments_received: "Landlord / Accountant",
};

const PAYOUT_STATUSES = new Set(["pending", "processing", "successful", "failed"]);
const COLLECTION_STATUSES = new Set(["pending", "pay-offline", "successful", "failed"]);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------------------------
// Formatting — no em/en dashes anywhere in generated text (spec requirement), so every place that
// might otherwise reach for "—" uses a plain word or comma instead.
// ---------------------------------------------------------------------------------------------

function formatKwacha(amount: number): string {
  const hasCents = Math.abs(amount % 1) > 0.001;
  const n = hasCents ? amount.toFixed(2) : Math.round(amount).toString();
  const [whole, cents] = n.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K${withCommas}${cents ? `.${cents}` : ""}`;
}

function formatDMY(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function monthYearLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvField).join(","));
  // UTF-8 BOM so Excel opens it as UTF-8 rather than guessing the system codepage.
  return "﻿" + lines.join("\r\n");
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "property";
}

// ---------------------------------------------------------------------------------------------
// Logo + font fetching — same fetch-to-base64 shape as pay-portal-generate-receipt's
// fetchLogoDataUrl, generalized for any image URL and for font files.
// ---------------------------------------------------------------------------------------------

async function fetchBase64(url: string): Promise<{ base64: string; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), contentType: res.headers.get("content-type") ?? "" };
  } catch {
    return null;
  }
}

const IPM_LOGO_URL =
  "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay%20Manage%20Logo.png";

const INTER_REGULAR_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/static/Inter-Regular.ttf";
const INTER_BOLD_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/static/Inter-Bold.ttf";

/** Registers Inter on the doc if both weights fetch successfully; otherwise leaves jsPDF's default
 * Helvetica in place. Returns the font family name to actually use everywhere else in this file, so
 * callers never need their own fallback branching. */
async function registerInterFont(doc: jsPDF): Promise<string> {
  const [regular, bold] = await Promise.all([fetchBase64(INTER_REGULAR_URL), fetchBase64(INTER_BOLD_URL)]);
  if (!regular || !bold) return "helvetica";
  try {
    doc.addFileToVFS("Inter-Regular.ttf", regular.base64);
    doc.addFont("Inter-Regular.ttf", "Inter", "normal");
    doc.addFileToVFS("Inter-Bold.ttf", bold.base64);
    doc.addFont("Inter-Bold.ttf", "Inter", "bold");
    return "Inter";
  } catch {
    return "helvetica";
  }
}

// ---------------------------------------------------------------------------------------------
// PDF layout constants — straight from the design spec, in px (this doc uses unit: "px").
// ---------------------------------------------------------------------------------------------

// Portrait A4 at 96dpi (was landscape 1123x794 in the original spec) — switched per request.
const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN_X = 48;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 44;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const COLOR = {
  ink: [26, 26, 26] as [number, number, number],
  grey: [119, 119, 119] as [number, number, number],
  border: [138, 138, 138] as [number, number, number],
  headerBandBg: [250, 249, 247] as [number, number, number],
  incomeBg: [227, 241, 231] as [number, number, number],
  incomeText: [20, 83, 45] as [number, number, number],
  expenseBg: [251, 233, 227] as [number, number, number],
  expenseText: [154, 52, 18] as [number, number, number],
  netBg: [20, 83, 45] as [number, number, number],
  occupiedBorder: [183, 217, 193] as [number, number, number],
  vacantBg: [253, 240, 220] as [number, number, number],
  vacantText: [138, 75, 6] as [number, number, number],
  vacantBorder: [236, 208, 164] as [number, number, number],
  progressTrack: [230, 228, 223] as [number, number, number],
  progressFill: [20, 83, 45] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

type Ctx = { doc: jsPDF; font: string };

// jsPDF's setFontSize() is ALWAYS in points, regardless of the document's coordinate unit — it is
// not run through the same px-to-unit scaling that x/y/w/h go through. Since this document uses
// unit: "px" so every coordinate in this file can match the design spec's pixel values directly,
// a font size meant to read as "13px" has to be converted to points (1px at 96dpi = 0.75pt) before
// being handed to setFontSize, or every string renders ~33% larger than the columns were sized
// for — which is exactly what caused table text (especially in the narrower Category column) to
// overflow its cell and look misaligned.
const PX_TO_PT = 0.75;

function setFont(ctx: Ctx, weight: "normal" | "bold", sizePx: number, color: [number, number, number]) {
  ctx.doc.setFont(ctx.font, weight);
  ctx.doc.setFontSize(sizePx * PX_TO_PT);
  ctx.doc.setTextColor(...color);
}

/** Draws the shared header block (spec section "PDF DESIGN (all three reports)") and returns the y
 * coordinate content should start at below it. */
function drawHeader(
  ctx: Ctx,
  opts: {
    logoDataUrl: string | null;
    logoFormat: "PNG" | "JPEG";
    propertyName: string;
    propertyLocation: string;
    reportType: ReportType;
    createdOn: string;
    periodLine: string;
    audience: string;
  }
): number {
  const { doc } = ctx;
  let y = MARGIN_TOP;

  setFont(ctx, "normal", 13, COLOR.grey);
  doc.text("Report generated by", MARGIN_X, y);
  y += 20;

  const logoSize = 36;
  if (opts.logoDataUrl) {
    try {
      doc.addImage(opts.logoDataUrl, opts.logoFormat, MARGIN_X, y, logoSize, logoSize, undefined, "FAST");
    } catch {
      drawLogoFallback(ctx, MARGIN_X, y, logoSize);
    }
  } else {
    drawLogoFallback(ctx, MARGIN_X, y, logoSize);
  }
  setFont(ctx, "bold", 20, COLOR.ink);
  // Slight negative charSpace for the tighter letter-spacing the app's own wordmark uses elsewhere
  // (Header.tsx's "Instay Manage" logotype).
  doc.text("Instay Manage", MARGIN_X + logoSize + 10, y + logoSize / 2 + 7, { charSpace: -0.4 });
  y += logoSize + 18;

  setFont(ctx, "bold", 26, COLOR.ink);
  doc.text(REPORT_TITLE[opts.reportType], MARGIN_X, y);
  y += 30;

  setFont(ctx, "normal", 14, COLOR.ink);
  doc.text(`Report created on: ${opts.createdOn}`, MARGIN_X, y);
  y += 20;
  doc.text(opts.periodLine, MARGIN_X, y);
  y += 20;
  doc.text(`Prepared for: ${opts.audience}`, MARGIN_X, y);

  // Top-right property box.
  const boxW = 190;
  const boxX = PAGE_W - MARGIN_X - boxW;
  const boxY = MARGIN_TOP;
  setFont(ctx, "bold", 12, COLOR.ink);
  const nameLines = doc.splitTextToSize(opts.propertyName || "[Property name]", boxW - 24);
  const locLines = doc.splitTextToSize(opts.propertyLocation || "[Property location]", boxW - 24);
  const boxH = 20 + nameLines.length * 14 + locLines.length * 13;
  doc.setFillColor(...COLOR.headerBandBg);
  doc.rect(boxX, boxY, boxW, boxH, "F");
  let by = boxY + 10 + 12;
  setFont(ctx, "bold", 12, COLOR.ink);
  for (const line of nameLines) {
    doc.text(line, boxX + 12, by);
    by += 14;
  }
  setFont(ctx, "normal", 11, COLOR.grey);
  for (const line of locLines) {
    doc.text(line, boxX + 12, by);
    by += 13;
  }

  return y + 34;
}

function drawLogoFallback(ctx: Ctx, x: number, y: number, size: number) {
  const { doc } = ctx;
  doc.setFillColor(20, 83, 45);
  doc.roundedRect(x, y, size, size, 8, 8, "F");
  setFont(ctx, "bold", 13, COLOR.white);
  doc.text("IPM", x + size / 2, y + size / 2 + 4, { align: "center" });
}

/** A single stat card — spec's figure-card pattern used on the occupancy and overdue pages. */
function drawCard(
  ctx: Ctx,
  opts: { x: number; y: number; w: number; h: number; label: string; value: string; bg: [number, number, number]; text: [number, number, number]; border?: [number, number, number] }
) {
  const { doc } = ctx;
  doc.setFillColor(...opts.bg);
  if (opts.border) {
    doc.setDrawColor(...opts.border);
    doc.roundedRect(opts.x, opts.y, opts.w, opts.h, 4, 4, "FD");
  } else {
    doc.roundedRect(opts.x, opts.y, opts.w, opts.h, 4, 4, "F");
  }
  setFont(ctx, "normal", 12, opts.text);
  doc.text(opts.label, opts.x + 18, opts.y + 22);
  setFont(ctx, "bold", 30, opts.text);
  doc.text(opts.value, opts.x + 18, opts.y + 52);
}

// A generic column-based table with page-break support and a repeated header row. Cell content is
// pre-rendered by the caller (a `draw` callback per row) rather than this function knowing about
// row styling, since the three reports' rows differ too much (merged category cells, pills,
// progress bars) to force through one row-shape.
type TableColumn = { label: string; width: number; align?: "left" | "right" };

function drawTableHeader(ctx: Ctx, x: number, y: number, columns: TableColumn[], totalWidth: number): number {
  const { doc } = ctx;
  const rowH = 30;
  doc.setFillColor(...COLOR.headerBandBg);
  doc.rect(x, y, totalWidth, rowH, "F");
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.75);
  doc.rect(x, y, totalWidth, rowH, "S");
  let cx = x;
  setFont(ctx, "bold", 13, COLOR.ink);
  for (const col of columns) {
    const colW = totalWidth * col.width;
    doc.text(col.label, col.align === "right" ? cx + colW - 10 : cx + 10, y + 20, { align: col.align === "right" ? "right" : "left" });
    cx += colW;
  }
  return y + rowH;
}

function ensureRoom(ctx: Ctx, y: number, rowH: number, onNewPage: () => number): number {
  if (y + rowH > PAGE_H - MARGIN_BOTTOM) {
    ctx.doc.addPage([PAGE_W, PAGE_H], "portrait");
    return onNewPage();
  }
  return y;
}

// ---------------------------------------------------------------------------------------------
// Data fetching — one function per report, each scoped by the RLS-bound `supabase` client passed
// in (never a service-role client), so a caller can only ever see property_id rows their own
// session's RLS policies already allow.
// ---------------------------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** "2026" for a whole calendar year, "October 2026" for a whole month, otherwise the date range. */
function periodLabelFor(dateFrom: string, dateTo: string): string {
  const [fy, fm, fd] = dateFrom.split("-").map(Number);
  const [ty, tm, td] = dateTo.split("-").map(Number);
  if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return String(fy);
  const lastDay = new Date(ty, tm, 0).getDate();
  if (fy === ty && fm === tm && fd === 1 && td === lastDay) return monthYearLabel(dateFrom);
  return `${formatDMY(dateFrom)} to ${formatDMY(dateTo)}`;
}

/** Rent actually received in the period, read from the tenants' ledgers (manual and online
 * payments both land there), plus expenses grouped by category with repeat items rolled up, and a
 * month-by-month breakdown. The old version summed only online collections, so cash and manually
 * logged rent showed as K0. */
async function fetchIncomeVsExpenses(supabase: SupabaseClient, propertyId: string, dateFrom: string, dateTo: string) {
  const { data: ledger } = await supabase
    .from("ledger_entries")
    .select("amount, paid_amount, status, source, event_type, origin, affects_balance, voided_at, created_at, tenants!inner(property_id)")
    .eq("tenants.property_id", propertyId)
    .gte("created_at", `${dateFrom}T00:00:00+02:00`)
    .lte("created_at", `${dateTo}T23:59:59+02:00`)
    .limit(20000);

  type LedgerRow = {
    amount: number; paid_amount: number | null; status: string | null; source: string | null; event_type: string | null;
    origin: string | null; affects_balance: boolean | null; voided_at: string | null; created_at: string;
  };
  const monthKey = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 2 * 3600 * 1000); // Lusaka
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const rentByMonth = new Map<string, number>();
  for (const r of (ledger ?? []) as LedgerRow[]) {
    if (r.voided_at || r.affects_balance === false) continue;
    let received = 0;
    if (r.event_type === "payment") {
      if (r.origin === "penalty_waiver" || r.origin === "import" || Number(r.amount) >= 0) continue;
      received = -Number(r.amount);
    } else if (r.event_type == null && (r.source === "manual" || r.source === "lenco")) {
      if (r.status === "paid") received = Number(r.paid_amount ?? r.amount);
      else if (r.status === "partial") received = Number(r.paid_amount ?? 0);
    }
    if (received > 0) rentByMonth.set(monthKey(r.created_at), (rentByMonth.get(monthKey(r.created_at)) ?? 0) + received);
  }
  const rentCollected = Array.from(rentByMonth.values()).reduce((a, b) => a + b, 0);

  const { data: expenses } = await supabase
    .from("expenses")
    .select("name, amount, date, category_id, expense_categories(name)")
    .eq("property_id", propertyId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date", { ascending: true });

  type ExpenseRow = { name: string; amount: number; date: string; category_id: string | null; expense_categories: { name: string } | null };
  const rows = (expenses ?? []) as ExpenseRow[];

  // Same-named expenses within a category are rolled into one line ("ZESCO electricity, 12 payments").
  const groups = new Map<string, { category: string; items: Map<string, { name: string; amount: number; count: number }> }>();
  const expByMonth = new Map<string, number>();
  for (const e of rows) {
    const categoryName = e.expense_categories?.name ?? "Uncategorised";
    const key = e.category_id ?? "uncategorised";
    if (!groups.has(key)) groups.set(key, { category: categoryName, items: new Map() });
    const items = groups.get(key)!.items;
    const itemKey = e.name.trim().toLowerCase();
    const it = items.get(itemKey) ?? { name: e.name.trim(), amount: 0, count: 0 };
    it.amount += Number(e.amount);
    it.count += 1;
    items.set(itemKey, it);
    const mk = e.date.slice(0, 7);
    expByMonth.set(mk, (expByMonth.get(mk) ?? 0) + Number(e.amount));
  }
  const groupList = Array.from(groups.values())
    .map((g) => ({ category: g.category, items: Array.from(g.items.values()).sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.items.reduce((s, i) => s + i.amount, 0) - a.items.reduce((s, i) => s + i.amount, 0));
  const totalExpenses = rows.reduce((sum, e) => sum + Number(e.amount), 0);

  // Every month in the range, up to the current month.
  const nowKey = monthKey(new Date().toISOString());
  const months: { month: string; label: string; rent: number; expenses: number; net: number }[] = [];
  let [y, m] = dateFrom.slice(0, 7).split("-").map(Number);
  const endKey = dateTo.slice(0, 7) < nowKey ? dateTo.slice(0, 7) : nowKey;
  while (`${y}-${String(m).padStart(2, "0")}` <= endKey) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    const rent = rentByMonth.get(k) ?? 0;
    const exp = expByMonth.get(k) ?? 0;
    months.push({ month: k, label: new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }), rent, expenses: exp, net: rent - exp });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  return { rentCollected, groups: groupList, totalExpenses, net: rentCollected - totalExpenses, months, periodLabel: periodLabelFor(dateFrom, dateTo) };
}

async function fetchOccupancy(supabase: SupabaseClient, propertyId: string) {
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, room_type_id, room_types(name, capacity)")
    .eq("property_id", propertyId);
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, room_type_id, move_in_date")
    .eq("property_id", propertyId)
    .eq("active", true);

  type RoomRow = { id: string; room_type_id: string | null; room_types: { name: string; capacity: number } | null };
  type TenantRow = { room_type_id: string | null; move_in_date: string | null };
  const roomRows = (rooms ?? []) as RoomRow[];
  // Someone who hasn't moved in yet isn't occupying a bed today.
  const tenantRows = ((tenants ?? []) as TenantRow[]).filter((t) => hasMovedIn(t.move_in_date));

  const byType = new Map<string, { name: string; rooms: number; capacityPerRoom: number }>();
  for (const r of roomRows) {
    const key = r.room_type_id ?? "unassigned";
    const name = r.room_types?.name ?? "Unassigned";
    const capacity = r.room_types?.capacity ?? 1;
    if (!byType.has(key)) byType.set(key, { name, rooms: 0, capacityPerRoom: capacity });
    byType.get(key)!.rooms += 1;
  }

  const occupiedByType = new Map<string, number>();
  for (const t of tenantRows) {
    const key = t.room_type_id ?? "unassigned";
    occupiedByType.set(key, (occupiedByType.get(key) ?? 0) + 1);
  }

  const rowsOut = Array.from(byType.entries()).map(([key, v]) => {
    const bedsTotal = v.rooms * v.capacityPerRoom;
    const occupied = Math.min(occupiedByType.get(key) ?? 0, bedsTotal);
    return { roomType: v.name, rooms: v.rooms, bedsTotal, bedsOccupied: occupied };
  });

  const totalRooms = rowsOut.reduce((s, r) => s + r.rooms, 0);
  const totalBeds = rowsOut.reduce((s, r) => s + r.bedsTotal, 0);
  const totalOccupied = rowsOut.reduce((s, r) => s + r.bedsOccupied, 0);
  const vacant = totalBeds - totalOccupied;
  const occupancyPct = totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;

  return { rows: rowsOut, totalRooms, totalBeds, totalOccupied, vacant, occupancyPct };
}

/** A tenant whose move-in date is still in the future owes nothing that is due yet. */
function hasMovedIn(moveIn: string | null | undefined): boolean {
  if (!moveIn) return true;
  const d = new Date(moveIn.replace("Sept", "Sep"));
  if (Number.isNaN(d.getTime())) return true;
  const now = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()) <= new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

async function fetchOverdueRent(supabase: SupabaseClient, propertyId: string) {
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, owed_amount, days_overdue, guardian_name, guardian_phone, emergency_contacts, unit_label, move_in_date, room_id, rooms!tenants_room_id_fkey(number)")
    .eq("property_id", propertyId)
    .eq("active", true)
    .gt("owed_amount", 0);

  type Row = {
    name: string;
    owed_amount: number;
    days_overdue: number | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    move_in_date: string | null;
    unit_label: string | null;
    emergency_contacts: { name?: string; relation?: string; phones?: string[] }[] | null;
    rooms: { number: string } | null;
  };
  // The guardian lives in emergency_contacts; the old guardian_* columns are never filled in.
  const contactOf = (t: Row): string | null => {
    const c = (t.emergency_contacts ?? []).find((x) => x?.relation === "Guardian") ?? (t.emergency_contacts ?? [])[0];
    if (c && (c.name || c.phones?.[0])) return [c.name, c.phones?.[0]].filter(Boolean).join(", ");
    return t.guardian_name || t.guardian_phone ? [t.guardian_name, t.guardian_phone].filter(Boolean).join(", ") : null;
  };
  const rows = ((tenants ?? []) as Row[])
    .filter((t) => hasMovedIn(t.move_in_date))
    .map((t) => ({
      tenant: t.name,
      room: t.rooms?.number ?? t.unit_label ?? "Not assigned",
      daysOverdue: t.days_overdue ?? 0,
      owed: t.owed_amount,
      emergencyContact: contactOf(t),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.owed - a.owed);

  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);
  return { rows, totalOwed };
}

function recipientLabel(r: { type: string; provider: string | null; account_name: string | null; account_number: string | null; phone_number: string | null } | null): string {
  if (!r) return "Not set";
  if (r.type === "mobile-money") return `${(r.provider ?? "").toUpperCase()} xxxx ${(r.phone_number ?? "").slice(-4)}`;
  return `${r.account_name ?? "Bank"} xxxx ${(r.account_number ?? "").slice(-4)}`;
}

async function fetchPayoutsSent(supabase: SupabaseClient, propertyId: string, dateFrom: string, dateTo: string, status?: string) {
  let query = supabase
    .from("payouts")
    .select("amount, fee_amount, net_amount, status, created_at, failure_reason, payout_recipients(type, provider, account_name, account_number, phone_number)")
    .eq("property_id", propertyId)
    .gte("created_at", `${dateFrom}T00:00:00Z`)
    .lte("created_at", `${dateTo}T23:59:59Z`)
    .order("created_at", { ascending: false });
  if (status && PAYOUT_STATUSES.has(status)) query = query.eq("status", status);
  const { data } = await query;

  type Row = {
    amount: number;
    fee_amount: number | null;
    net_amount: number | null;
    status: string;
    created_at: string;
    failure_reason: string | null;
    payout_recipients: { type: string; provider: string | null; account_name: string | null; account_number: string | null; phone_number: string | null } | null;
  };
  const rows = ((data ?? []) as Row[]).map((r) => ({
    date: r.created_at.slice(0, 10),
    amount: r.amount,
    fee: r.fee_amount,
    net: r.net_amount,
    method: recipientLabel(r.payout_recipients),
    status: r.status,
    failureReason: r.failure_reason,
  }));

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const totalNet = rows.reduce((s, r) => s + (r.net ?? r.amount), 0);
  return { rows, totalAmount, totalNet, count: rows.length };
}

/** Every figure here is the RENT the tenant paid, never what their phone was debited. A portal
 * payment charges the tenant the rent plus the service fee on top (collections.amount is the
 * total, collections.fee_amount the fee), and the fee is not the landlord's money, so reporting
 * the gross overstated what was collected. Rent is amount minus fee, which is also what the
 * tenant's ledger payment rows hold, so this report now agrees with the income report. */
async function fetchPaymentsReceived(supabase: SupabaseClient, propertyId: string, dateFrom: string, dateTo: string, status?: string) {
  let query = supabase
    .from("collections")
    .select("amount, fee_amount, status, created_at, operator, phone, failure_reason, tenants(name)")
    .eq("property_id", propertyId)
    .gte("created_at", `${dateFrom}T00:00:00Z`)
    .lte("created_at", `${dateTo}T23:59:59Z`)
    .order("created_at", { ascending: false });
  if (status && COLLECTION_STATUSES.has(status)) query = query.eq("status", status);
  const { data } = await query;

  type Row = {
    amount: number;
    fee_amount: number | null;
    status: string;
    created_at: string;
    operator: string;
    phone: string;
    failure_reason: string | null;
    tenants: { name: string } | null;
  };
  const rows = ((data ?? []) as Row[]).map((r) => ({
    date: r.created_at.slice(0, 10),
    tenant: r.tenants?.name ?? "Not set",
    amount: Math.round((Number(r.amount) - Number(r.fee_amount ?? 0)) * 100) / 100,
    operator: (r.operator ?? "").toUpperCase(),
    phone: r.phone ? `xxxx ${r.phone.slice(-4)}` : "",
    status: r.status,
    failureReason: r.failure_reason,
  }));

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, totalAmount, count: rows.length };
}

// ---------------------------------------------------------------------------------------------
// PDF builders — one per report type.
// ---------------------------------------------------------------------------------------------

function buildIncomeVsExpensesPdf(
  ctx: Ctx,
  data: Awaited<ReturnType<typeof fetchIncomeVsExpenses>>,
  header: { logoDataUrl: string | null; logoFormat: "PNG" | "JPEG"; propertyName: string; propertyLocation: string; dateFrom: string; dateTo: string }
) {
  const { doc } = ctx;
  const createdOn = formatDMY(new Date().toISOString().slice(0, 10));
  let y = drawHeader(ctx, {
    logoDataUrl: header.logoDataUrl,
    logoFormat: header.logoFormat,
    propertyName: header.propertyName,
    propertyLocation: header.propertyLocation,
    reportType: "income_vs_expenses",
    createdOn,
    periodLine: `Time Period: ${data.periodLabel} (${formatDMY(header.dateFrom)} to ${formatDMY(header.dateTo)})`,
    audience: REPORT_AUDIENCE.income_vs_expenses,
  });

  // Summary cards
  y += 20;
  const gap = 12;
  const cardW = (CONTENT_W - gap * 2) / 3;
  drawCard(ctx, { x: MARGIN_X, y, w: cardW, h: 70, label: "Rent collected", value: formatKwacha(data.rentCollected), bg: COLOR.incomeBg, text: COLOR.incomeText });
  drawCard(ctx, { x: MARGIN_X + cardW + gap, y, w: cardW, h: 70, label: "Expenses", value: formatKwacha(data.totalExpenses), bg: COLOR.expenseBg, text: COLOR.expenseText });
  drawCard(ctx, { x: MARGIN_X + (cardW + gap) * 2, y, w: cardW, h: 70, label: "Net income", value: formatKwacha(data.net), bg: COLOR.netBg, text: COLOR.white });
  y += 70;

  const rowH = 24;
  const tableX = MARGIN_X;
  const drawCells = (
    columns: TableColumn[],
    cells: string[],
    style: { bg?: [number, number, number]; text?: [number, number, number]; bold?: boolean; muted?: number[] } = {},
  ) => {
    y = ensureRoom(ctx, y, rowH, () => drawTableHeader(ctx, tableX, MARGIN_TOP, columns, CONTENT_W));
    if (style.bg) {
      doc.setFillColor(...style.bg);
      doc.rect(tableX, y, CONTENT_W, rowH, "F");
    }
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.rect(tableX, y, CONTENT_W, rowH, "S");
    let cx = tableX;
    columns.forEach((col, ci) => {
      const w = CONTENT_W * col.width;
      const color = style.muted?.includes(ci) ? COLOR.grey : (style.text ?? COLOR.ink);
      setFont(ctx, style.bold ? "bold" : "normal", 13, color);
      const text = doc.splitTextToSize(cells[ci] ?? "", w - 20)[0] ?? "";
      if (col.align === "right") doc.text(text, cx + w - 10, y + 16, { align: "right" });
      else doc.text(text, cx + 10, y + 16);
      cx += w;
    });
    y += rowH;
  };
  const sectionTitle = (title: string) => {
    y = ensureRoom(ctx, y, 60, () => MARGIN_TOP);
    y += 28;
    setFont(ctx, "bold", 15, COLOR.ink);
    doc.text(title, MARGIN_X, y);
    y += 10;
  };

  // Month by month (only when the period spans more than one month)
  if (data.months.length > 1) {
    sectionTitle("Month by month");
    const mcols: TableColumn[] = [
      { label: "Month", width: 0.28 },
      { label: "Rent collected", width: 0.24, align: "right" },
      { label: "Expenses", width: 0.24, align: "right" },
      { label: "Net", width: 0.24, align: "right" },
    ];
    y = drawTableHeader(ctx, tableX, y, mcols, CONTENT_W);
    for (const mo of data.months) {
      drawCells(mcols, [mo.label, formatKwacha(mo.rent), formatKwacha(mo.expenses), formatKwacha(mo.net)]);
    }
    drawCells(mcols, ["Total", formatKwacha(data.rentCollected), formatKwacha(data.totalExpenses), formatKwacha(data.net)], { bg: COLOR.headerBandBg, bold: true });
  }

  // Breakdown
  sectionTitle("Breakdown");
  const columns: TableColumn[] = [
    { label: "Item", width: 0.5 },
    { label: "Category", width: 0.26 },
    { label: "Amount", width: 0.24, align: "right" },
  ];
  y = drawTableHeader(ctx, tableX, y, columns, CONTENT_W);
  drawCells(columns, ["Rent collected", "Income", formatKwacha(data.rentCollected)], { bg: COLOR.incomeBg, text: COLOR.incomeText, bold: true });

  for (const group of data.groups) {
    group.items.forEach((item, idx) => {
      const name = item.count > 1 ? `${item.name} (${item.count} payments)` : item.name;
      drawCells(columns, [name, idx === 0 ? group.category : "", formatKwacha(item.amount)], { muted: [1] });
    });
    const subtotal = group.items.reduce((s, i) => s + i.amount, 0);
    drawCells(columns, [`${group.category} subtotal`, "", formatKwacha(subtotal)], { bg: COLOR.headerBandBg, bold: true });
  }
  if (data.groups.length === 0) {
    drawCells(columns, ["No expenses logged in this period.", "", formatKwacha(0)]);
  }

  drawCells(columns, ["Total expenses", "Expenses", formatKwacha(data.totalExpenses)], { bg: COLOR.expenseBg, text: COLOR.expenseText, bold: true });
  drawCells(columns, [`Net for ${data.periodLabel}`, "Net income", formatKwacha(data.net)], { bg: COLOR.netBg, text: COLOR.white, bold: true });
}

function buildOccupancyPdf(
  ctx: Ctx,
  data: Awaited<ReturnType<typeof fetchOccupancy>>,
  header: { logoDataUrl: string | null; logoFormat: "PNG" | "JPEG"; propertyName: string; propertyLocation: string; asAt: string }
) {
  const { doc } = ctx;
  let y = drawHeader(ctx, {
    logoDataUrl: header.logoDataUrl,
    logoFormat: header.logoFormat,
    propertyName: header.propertyName,
    propertyLocation: header.propertyLocation,
    reportType: "occupancy",
    createdOn: formatDMY(new Date().toISOString().slice(0, 10)),
    periodLine: `As at: ${formatDMY(header.asAt)}`,
    audience: REPORT_AUDIENCE.occupancy,
  });

  y += 20;
  const cardW = (CONTENT_W - 24) / 3;
  const cardH = 64;
  drawCard(ctx, { x: MARGIN_X, y, w: cardW, h: cardH, label: "Occupied beds", value: `${data.totalOccupied} / ${data.totalBeds}`, bg: COLOR.incomeBg, text: COLOR.incomeText, border: COLOR.occupiedBorder });
  drawCard(ctx, { x: MARGIN_X + cardW + 12, y, w: cardW, h: cardH, label: "Vacant beds", value: String(data.vacant), bg: COLOR.vacantBg, text: COLOR.vacantText, border: COLOR.vacantBorder });
  drawCard(ctx, { x: MARGIN_X + (cardW + 12) * 2, y, w: cardW, h: cardH, label: "Occupancy rate", value: `${data.occupancyPct}%`, bg: COLOR.netBg, text: COLOR.white });
  y += cardH + 24;

  const columns: TableColumn[] = [
    { label: "Room type", width: 0.28 },
    { label: "Rooms", width: 0.14, align: "right" },
    { label: "Beds occupied", width: 0.2, align: "right" },
    { label: "Occupancy", width: 0.38 },
  ];
  y = drawTableHeader(ctx, MARGIN_X, y, columns, CONTENT_W);

  const rowH = 30;
  const drawRow = (roomType: string, rooms: string, beds: string, pct: number | null, bold = false) => {
    y = ensureRoom(ctx, y, rowH, () => drawTableHeader(ctx, MARGIN_X, MARGIN_TOP, columns, CONTENT_W));
    if (bold) {
      doc.setFillColor(...COLOR.headerBandBg);
      doc.rect(MARGIN_X, y, CONTENT_W, rowH, "F");
    }
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    setFont(ctx, bold ? "bold" : "normal", 13, COLOR.ink);
    const colW = columns.map((c) => CONTENT_W * c.width);
    let cx = MARGIN_X;
    doc.text(roomType, cx + 10, y + 19);
    cx += colW[0];
    doc.text(rooms, cx + colW[1] - 10, y + 19, { align: "right" });
    cx += colW[1];
    doc.text(beds, cx + colW[2] - 10, y + 19, { align: "right" });
    cx += colW[2];
    if (pct !== null) {
      const barW = 130;
      const barX = cx + 10;
      const barY = y + 11;
      doc.setFillColor(...COLOR.progressTrack);
      doc.roundedRect(barX, barY, barW, 8, 4, 4, "F");
      doc.setFillColor(...COLOR.progressFill);
      doc.roundedRect(barX, barY, Math.max((barW * pct) / 100, 8), 8, 4, 4, "F");
      setFont(ctx, "normal", 12, COLOR.ink);
      doc.text(`${pct}%`, barX + barW + 10, y + 19);
    }
    y += rowH;
  };

  if (data.rows.length === 0) {
    drawRow("No rooms have been added yet.", "", "", null);
  }
  for (const r of data.rows) {
    const pct = r.bedsTotal > 0 ? Math.round((r.bedsOccupied / r.bedsTotal) * 100) : 0;
    drawRow(r.roomType, String(r.rooms), `${r.bedsOccupied} / ${r.bedsTotal}`, pct);
  }
  drawRow("Total", String(data.totalRooms), `${data.totalOccupied} / ${data.totalBeds}`, data.occupancyPct, true);
}

function buildOverdueRentPdf(
  ctx: Ctx,
  data: Awaited<ReturnType<typeof fetchOverdueRent>>,
  header: { logoDataUrl: string | null; logoFormat: "PNG" | "JPEG"; propertyName: string; propertyLocation: string; asAt: string }
) {
  const { doc } = ctx;
  let y = drawHeader(ctx, {
    logoDataUrl: header.logoDataUrl,
    logoFormat: header.logoFormat,
    propertyName: header.propertyName,
    propertyLocation: header.propertyLocation,
    reportType: "overdue_rent",
    createdOn: formatDMY(new Date().toISOString().slice(0, 10)),
    periodLine: `As at: ${formatDMY(header.asAt)}`,
    audience: REPORT_AUDIENCE.overdue_rent,
  });

  y += 20;
  const cardW = (CONTENT_W - 12) / 2;
  const cardH = 64;
  drawCard(ctx, { x: MARGIN_X, y, w: cardW, h: cardH, label: "Tenants behind on rent", value: String(data.rows.length), bg: COLOR.headerBandBg, text: COLOR.ink });
  drawCard(ctx, { x: MARGIN_X + cardW + 12, y, w: cardW, h: cardH, label: "Total owed", value: formatKwacha(data.totalOwed), bg: COLOR.expenseText, text: COLOR.white });
  y += cardH + 24;

  const columns: TableColumn[] = [
    { label: "Tenant", width: 0.22 },
    { label: "Room", width: 0.15 },
    { label: "Days overdue", width: 0.15, align: "right" },
    { label: "Owed", width: 0.16, align: "right" },
    { label: "Emergency contact (parent / guardian)", width: 0.32 },
  ];
  y = drawTableHeader(ctx, MARGIN_X, y, columns, CONTENT_W);

  const rowH = 28;
  const colW = columns.map((c) => CONTENT_W * c.width);

  const drawEmptyRow = (text: string) => {
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    setFont(ctx, "normal", 13, COLOR.ink);
    doc.text(text, MARGIN_X + 10, y + 18);
    y += rowH;
  };

  if (data.rows.length === 0) {
    drawEmptyRow("No tenants are behind on rent.");
  }

  for (const r of data.rows) {
    y = ensureRoom(ctx, y, rowH, () => drawTableHeader(ctx, MARGIN_X, MARGIN_TOP, columns, CONTENT_W));
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    let cx = MARGIN_X;
    setFont(ctx, "normal", 13, COLOR.ink);
    doc.text(r.tenant, cx + 10, y + 18);
    cx += colW[0];
    doc.text(r.room, cx + 10, y + 18);
    cx += colW[1];

    const pillLabel = `${r.daysOverdue}d`;
    setFont(ctx, "bold", 11, COLOR.expenseText);
    const pillW = doc.getTextWidth(pillLabel) + 16;
    const pillX = cx + colW[2] - 10 - pillW;
    doc.setFillColor(...COLOR.expenseBg);
    doc.roundedRect(pillX, y + 6, pillW, 16, 8, 8, "F");
    doc.text(pillLabel, pillX + pillW / 2, y + 17, { align: "center" });
    cx += colW[2];

    setFont(ctx, "normal", 13, COLOR.ink);
    doc.text(formatKwacha(r.owed), cx + colW[3] - 10, y + 18, { align: "right" });
    cx += colW[3];

    if (r.emergencyContact) {
      setFont(ctx, "normal", 13, COLOR.ink);
      doc.text(r.emergencyContact, cx + 10, y + 18, { maxWidth: colW[4] - 20 });
    } else {
      setFont(ctx, "normal", 13, COLOR.grey);
      doc.text("Not provided", cx + 10, y + 18);
    }
    y += rowH;
  }

  if (data.rows.length > 0) {
    y = ensureRoom(ctx, y, rowH, () => drawTableHeader(ctx, MARGIN_X, MARGIN_TOP, columns, CONTENT_W));
    doc.setFillColor(...COLOR.expenseBg);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "F");
    doc.setDrawColor(...COLOR.border);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    setFont(ctx, "bold", 13, COLOR.expenseText);
    doc.text("Total owed", MARGIN_X + 10, y + 18);
    doc.text(formatKwacha(data.totalOwed), MARGIN_X + colW[0] + colW[1] + colW[2] + colW[3] - 10, y + 18, { align: "right" });
  }
}

const PAYOUT_STATUS_LABEL: Record<string, string> = { pending: "Pending", processing: "Processing", successful: "Completed", failed: "Failed" };
const COLLECTION_STATUS_LABEL: Record<string, string> = { pending: "Pending", "pay-offline": "Pay offline", successful: "Completed", failed: "Failed" };

function buildPayoutsSentPdf(
  ctx: Ctx,
  data: Awaited<ReturnType<typeof fetchPayoutsSent>>,
  header: { logoDataUrl: string | null; logoFormat: "PNG" | "JPEG"; propertyName: string; propertyLocation: string; dateFrom: string; dateTo: string }
) {
  const { doc } = ctx;
  let y = drawHeader(ctx, {
    logoDataUrl: header.logoDataUrl,
    logoFormat: header.logoFormat,
    propertyName: header.propertyName,
    propertyLocation: header.propertyLocation,
    reportType: "payouts_sent",
    createdOn: formatDMY(new Date().toISOString().slice(0, 10)),
    periodLine: `Time Period: ${formatDMY(header.dateFrom)} to ${formatDMY(header.dateTo)}`,
    audience: REPORT_AUDIENCE.payouts_sent,
  });

  y += 20;
  const cardW = (CONTENT_W - 12) / 2;
  const cardH = 64;
  drawCard(ctx, { x: MARGIN_X, y, w: cardW, h: cardH, label: "Transfers sent", value: String(data.count), bg: COLOR.headerBandBg, text: COLOR.ink });
  drawCard(ctx, { x: MARGIN_X + cardW + 12, y, w: cardW, h: cardH, label: "Total sent", value: formatKwacha(data.totalAmount), bg: COLOR.netBg, text: COLOR.white });
  y += cardH + 24;

  const columns: TableColumn[] = [
    { label: "Date", width: 0.16 },
    { label: "Method", width: 0.34 },
    { label: "Amount", width: 0.16, align: "right" },
    { label: "Status", width: 0.16 },
    { label: "Details", width: 0.18 },
  ];
  y = drawTableHeader(ctx, MARGIN_X, y, columns, CONTENT_W);
  const rowH = 26;
  const colW = columns.map((c) => CONTENT_W * c.width);

  if (data.rows.length === 0) {
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    setFont(ctx, "normal", 13, COLOR.ink);
    doc.text("No transfers in this period.", MARGIN_X + 10, y + 17);
    y += rowH;
  }

  for (const r of data.rows) {
    y = ensureRoom(ctx, y, rowH, () => drawTableHeader(ctx, MARGIN_X, MARGIN_TOP, columns, CONTENT_W));
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    let cx = MARGIN_X;
    setFont(ctx, "normal", 12, COLOR.ink);
    doc.text(formatDMY(r.date), cx + 10, y + 17);
    cx += colW[0];
    doc.text(doc.splitTextToSize(r.method, colW[1] - 20)[0] ?? r.method, cx + 10, y + 17);
    cx += colW[1];
    doc.text(formatKwacha(r.amount), cx + colW[2] - 10, y + 17, { align: "right" });
    cx += colW[2];
    doc.text(PAYOUT_STATUS_LABEL[r.status] ?? r.status, cx + 10, y + 17);
    cx += colW[3];
    setFont(ctx, "normal", 11, COLOR.grey);
    doc.text(r.failureReason ?? (r.net != null ? `Net ${formatKwacha(r.net)}` : "Not set"), cx + 10, y + 17, { maxWidth: colW[4] - 20 });
    y += rowH;
  }

  if (data.rows.length > 0) {
    y = ensureRoom(ctx, y, rowH, () => drawTableHeader(ctx, MARGIN_X, MARGIN_TOP, columns, CONTENT_W));
    doc.setFillColor(...COLOR.headerBandBg);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "F");
    doc.setDrawColor(...COLOR.border);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    setFont(ctx, "bold", 13, COLOR.ink);
    doc.text("Total sent", MARGIN_X + 10, y + 17);
    doc.text(formatKwacha(data.totalAmount), MARGIN_X + colW[0] + colW[1] + colW[2] - 10, y + 17, { align: "right" });
  }
}

function buildPaymentsReceivedPdf(
  ctx: Ctx,
  data: Awaited<ReturnType<typeof fetchPaymentsReceived>>,
  header: { logoDataUrl: string | null; logoFormat: "PNG" | "JPEG"; propertyName: string; propertyLocation: string; dateFrom: string; dateTo: string }
) {
  const { doc } = ctx;
  let y = drawHeader(ctx, {
    logoDataUrl: header.logoDataUrl,
    logoFormat: header.logoFormat,
    propertyName: header.propertyName,
    propertyLocation: header.propertyLocation,
    reportType: "payments_received",
    createdOn: formatDMY(new Date().toISOString().slice(0, 10)),
    periodLine: `Time Period: ${formatDMY(header.dateFrom)} to ${formatDMY(header.dateTo)}`,
    audience: REPORT_AUDIENCE.payments_received,
  });

  y += 20;
  const cardW = (CONTENT_W - 12) / 2;
  const cardH = 64;
  drawCard(ctx, { x: MARGIN_X, y, w: cardW, h: cardH, label: "Payments received", value: String(data.count), bg: COLOR.incomeBg, text: COLOR.incomeText, border: COLOR.occupiedBorder });
  drawCard(ctx, { x: MARGIN_X + cardW + 12, y, w: cardW, h: cardH, label: "Total received", value: formatKwacha(data.totalAmount), bg: COLOR.netBg, text: COLOR.white });
  y += cardH + 24;

  const columns: TableColumn[] = [
    { label: "Date", width: 0.14 },
    { label: "Tenant", width: 0.26 },
    { label: "Amount", width: 0.16, align: "right" },
    { label: "Paid from", width: 0.22 },
    { label: "Status", width: 0.22 },
  ];
  y = drawTableHeader(ctx, MARGIN_X, y, columns, CONTENT_W);
  const rowH = 26;
  const colW = columns.map((c) => CONTENT_W * c.width);

  if (data.rows.length === 0) {
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    setFont(ctx, "normal", 13, COLOR.ink);
    doc.text("No payments in this period.", MARGIN_X + 10, y + 17);
    y += rowH;
  }

  for (const r of data.rows) {
    y = ensureRoom(ctx, y, rowH, () => drawTableHeader(ctx, MARGIN_X, MARGIN_TOP, columns, CONTENT_W));
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    let cx = MARGIN_X;
    setFont(ctx, "normal", 12, COLOR.ink);
    doc.text(formatDMY(r.date), cx + 10, y + 17);
    cx += colW[0];
    doc.text(doc.splitTextToSize(r.tenant, colW[1] - 20)[0] ?? r.tenant, cx + 10, y + 17);
    cx += colW[1];
    doc.text(formatKwacha(r.amount), cx + colW[2] - 10, y + 17, { align: "right" });
    cx += colW[2];
    doc.text(`${r.operator} ${r.phone}`.trim(), cx + 10, y + 17);
    cx += colW[3];
    doc.text(COLLECTION_STATUS_LABEL[r.status] ?? r.status, cx + 10, y + 17);
    y += rowH;
  }

  if (data.rows.length > 0) {
    y = ensureRoom(ctx, y, rowH, () => drawTableHeader(ctx, MARGIN_X, MARGIN_TOP, columns, CONTENT_W));
    doc.setFillColor(...COLOR.headerBandBg);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "F");
    doc.setDrawColor(...COLOR.border);
    doc.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    setFont(ctx, "bold", 13, COLOR.ink);
    doc.text("Total received", MARGIN_X + 10, y + 17);
    doc.text(formatKwacha(data.totalAmount), MARGIN_X + colW[0] + colW[1] + colW[2] - 10, y + 17, { align: "right" });
  }
}

// ---------------------------------------------------------------------------------------------
// CSV builders
// ---------------------------------------------------------------------------------------------

function buildIncomeVsExpensesCsv(data: Awaited<ReturnType<typeof fetchIncomeVsExpenses>>, _dateFrom: string): string {
  const rows: (string | number)[][] = [];
  for (const mo of data.months) rows.push(["Month", mo.label, "", "Rent collected", mo.rent], ["Month", mo.label, "", "Expenses", mo.expenses], ["Month", mo.label, "", "Net", mo.net]);
  rows.push(["Income", data.periodLabel, "Income", "Rent collected", data.rentCollected]);
  for (const group of data.groups) {
    for (const item of group.items) rows.push(["Expense", data.periodLabel, group.category, item.count > 1 ? `${item.name} (${item.count} payments)` : item.name, item.amount]);
  }
  rows.push(["Total", data.periodLabel, "Expenses", "Total expenses", data.totalExpenses]);
  rows.push(["Total", data.periodLabel, "Net income", `Net for ${data.periodLabel}`, data.net]);
  return toCsv(["Section", "Period", "Category", "Item", "Amount_ZMW"], rows);
}

function buildOccupancyCsv(data: Awaited<ReturnType<typeof fetchOccupancy>>): string {
  const rows: (string | number)[][] = data.rows.map((r) => [
    r.roomType,
    r.rooms,
    r.bedsTotal,
    r.bedsOccupied,
    r.bedsTotal > 0 ? Math.round((r.bedsOccupied / r.bedsTotal) * 100) : 0,
  ]);
  rows.push(["Total", data.totalRooms, data.totalBeds, data.totalOccupied, data.occupancyPct]);
  return toCsv(["Room_Type", "Rooms", "Beds_Total", "Beds_Occupied", "Occupancy_Percent"], rows);
}

function buildOverdueRentCsv(data: Awaited<ReturnType<typeof fetchOverdueRent>>): string {
  const rows: (string | number)[][] = data.rows.map((r) => [r.tenant, r.room, r.daysOverdue, r.owed, r.emergencyContact ?? "Not provided"]);
  return toCsv(["Tenant", "Room", "Days_Overdue", "Amount_Owed_ZMW", "Emergency_Contact"], rows);
}

function buildPayoutsSentCsv(data: Awaited<ReturnType<typeof fetchPayoutsSent>>): string {
  const rows: (string | number)[][] = data.rows.map((r) => [
    formatDMY(r.date),
    r.amount,
    r.fee ?? "",
    r.net ?? "",
    r.method,
    PAYOUT_STATUS_LABEL[r.status] ?? r.status,
    r.failureReason ?? "",
  ]);
  rows.push(["", data.totalAmount, "", data.totalNet, "Total", "", ""]);
  return toCsv(["Date", "Amount_ZMW", "Fee_ZMW", "Net_ZMW", "Method", "Status", "Failure_Reason"], rows);
}

function buildPaymentsReceivedCsv(data: Awaited<ReturnType<typeof fetchPaymentsReceived>>): string {
  const rows: (string | number)[][] = data.rows.map((r) => [
    formatDMY(r.date),
    r.tenant,
    r.amount,
    r.operator,
    r.phone,
    COLLECTION_STATUS_LABEL[r.status] ?? r.status,
    r.failureReason ?? "",
  ]);
  rows.push(["", "", data.totalAmount, "", "", "Total", ""]);
  return toCsv(["Date", "Tenant", "Amount_ZMW", "Operator", "Phone", "Status", "Failure_Reason"], rows);
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const reportType = payload.report_type;
  const format = payload.format;
  const propertyId = payload.property_id?.trim() ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = payload.date_from?.trim() || `${today.slice(0, 7)}-01`;
  const dateTo = payload.date_to?.trim() || today;

  if (!reportType || !REPORT_TITLE[reportType]) return jsonResponse({ error: "A valid report_type is required" }, 400);
  if (format !== "pdf" && format !== "csv") return jsonResponse({ error: "format must be 'pdf' or 'csv'" }, 400);
  if (!propertyId) return jsonResponse({ error: "property_id is required" }, 400);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

  // Scoped to the caller's own session — every read below runs under their RLS policy, so a
  // property this session doesn't own simply returns no rows rather than needing an explicit check.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, name, address, slug")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError || !property) {
    // RLS makes "not yours" and "doesn't exist" look identical — same response either way, same
    // reasoning pay-portal/other functions in this codebase already use for this exact ambiguity.
    return jsonResponse({ error: "Property not found." }, 404);
  }

  // Instay Manage's own brand mark, not the property's — see the top-of-file note.
  let logoDataUrl: string | null = null;
  let logoFormat: "PNG" | "JPEG" = "PNG";
  const fetchedLogo = await fetchBase64(IPM_LOGO_URL);
  if (fetchedLogo) {
    logoFormat = fetchedLogo.contentType.includes("jpeg") || fetchedLogo.contentType.includes("jpg") ? "JPEG" : "PNG";
    logoDataUrl = `data:${fetchedLogo.contentType || "image/png"};base64,${fetchedLogo.base64}`;
  }

  // Fetched once regardless of format — the frontend's report-preview page (styled to match the
  // PDF exactly) renders straight off this same object instead of re-querying, so the preview and
  // the downloaded file can never show different numbers for the same generate click.
  let reportData: unknown;
  let fileBytes: Uint8Array | string;
  let contentType: string;
  let ext: string;

  try {
    if (reportType === "income_vs_expenses") reportData = await fetchIncomeVsExpenses(supabase, propertyId, dateFrom, dateTo);
    else if (reportType === "occupancy") reportData = await fetchOccupancy(supabase, propertyId);
    else if (reportType === "overdue_rent") reportData = await fetchOverdueRent(supabase, propertyId);
    else if (reportType === "payouts_sent") reportData = await fetchPayoutsSent(supabase, propertyId, dateFrom, dateTo, payload.status);
    else reportData = await fetchPaymentsReceived(supabase, propertyId, dateFrom, dateTo, payload.status);

    if (format === "csv") {
      ext = "csv";
      contentType = "text/csv; charset=utf-8";
      if (reportType === "income_vs_expenses") {
        fileBytes = buildIncomeVsExpensesCsv(reportData as Awaited<ReturnType<typeof fetchIncomeVsExpenses>>, dateFrom);
      } else if (reportType === "occupancy") {
        fileBytes = buildOccupancyCsv(reportData as Awaited<ReturnType<typeof fetchOccupancy>>);
      } else if (reportType === "overdue_rent") {
        fileBytes = buildOverdueRentCsv(reportData as Awaited<ReturnType<typeof fetchOverdueRent>>);
      } else if (reportType === "payouts_sent") {
        fileBytes = buildPayoutsSentCsv(reportData as Awaited<ReturnType<typeof fetchPayoutsSent>>);
      } else {
        fileBytes = buildPaymentsReceivedCsv(reportData as Awaited<ReturnType<typeof fetchPaymentsReceived>>);
      }
    } else {
      ext = "pdf";
      contentType = "application/pdf";
      const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [PAGE_W, PAGE_H] });
      const font = await registerInterFont(doc);
      const ctx: Ctx = { doc, font };
      const headerCommon = { logoDataUrl, logoFormat, propertyName: property.name ?? "", propertyLocation: property.address ?? "" };

      if (reportType === "income_vs_expenses") {
        buildIncomeVsExpensesPdf(ctx, reportData as Awaited<ReturnType<typeof fetchIncomeVsExpenses>>, { ...headerCommon, dateFrom, dateTo });
      } else if (reportType === "occupancy") {
        buildOccupancyPdf(ctx, reportData as Awaited<ReturnType<typeof fetchOccupancy>>, { ...headerCommon, asAt: dateTo });
      } else if (reportType === "overdue_rent") {
        buildOverdueRentPdf(ctx, reportData as Awaited<ReturnType<typeof fetchOverdueRent>>, { ...headerCommon, asAt: dateTo });
      } else if (reportType === "payouts_sent") {
        buildPayoutsSentPdf(ctx, reportData as Awaited<ReturnType<typeof fetchPayoutsSent>>, { ...headerCommon, dateFrom, dateTo });
      } else {
        buildPaymentsReceivedPdf(ctx, reportData as Awaited<ReturnType<typeof fetchPaymentsReceived>>, { ...headerCommon, dateFrom, dateTo });
      }
      fileBytes = new Uint8Array(doc.output("arraybuffer"));
    }
  } catch (e) {
    console.error("generate-report: build failed", e);
    return jsonResponse({ error: "Couldn't build that report. Try again in a moment." }, 500);
  }

  const propertySlug = property.slug || slugify(property.name ?? "property");
  const fileName = `IPM_${REPORT_SLUG[reportType]}_${propertySlug}_${today}.${ext}`;
  const filePath = `${propertyId}/${REPORT_SLUG[reportType]}-${today}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("reports").upload(filePath, fileBytes, { contentType });
  if (uploadError) {
    console.error("generate-report: upload failed", uploadError);
    return jsonResponse({ error: "Report generated, but couldn't be saved. Try again." }, 500);
  }

  await supabase.from("report_history").insert({
    property_id: propertyId,
    report_type: REPORT_SLUG[reportType],
    format,
    date_from: dateFrom,
    date_to: dateTo,
    file_path: filePath,
    file_name: fileName,
  });

  // The `download` option makes Storage respond with Content-Disposition: attachment — without it,
  // an <a download> pointing at a cross-origin signed URL is ignored by most browsers, which is
  // why clicking "Download" was opening the PDF in another preview tab instead of saving it.
  const { data: signed, error: signError } = await supabase.storage.from("reports").createSignedUrl(filePath, 300, { download: fileName });
  if (signError || !signed) {
    return jsonResponse({ error: "Report saved, but the download link couldn't be created." }, 500);
  }

  return jsonResponse(
    {
      ok: true,
      url: signed.signedUrl,
      filePath,
      fileName,
      reportType,
      dateFrom,
      dateTo,
      createdOn: formatDMY(today),
      property: { name: property.name, location: property.address, logoUrl: IPM_LOGO_URL },
      data: reportData,
    },
    200
  );
});
