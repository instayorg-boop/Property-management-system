# generate-report

Generates a landlord-facing PDF or CSV report and returns a short-lived signed URL to download it.

## Request

`POST` (via `supabase.functions.invoke("generate-report", { body })`), Authorization header required
(the caller's own session JWT — forwarded automatically by `supabase.functions.invoke`).

```json
{
  "report_type": "income_vs_expenses" | "occupancy" | "overdue_rent" | "payouts_sent" | "payments_received",
  "format": "pdf" | "csv",
  "property_id": "uuid",
  "date_from": "YYYY-MM-DD",
  "date_to": "YYYY-MM-DD",
  "status": "successful"
}
```

- `date_from`/`date_to` are used in full for `income_vs_expenses`, `payouts_sent`, and
  `payments_received`. For `occupancy` and `overdue_rent` only `date_to` is used, treated as "as
  at" that date (current state, not a range).
- Both default to the current calendar month if omitted.
- `status` is only read by `payouts_sent` (payout status: pending/processing/successful/failed) and
  `payments_received` (collection status: pending/pay-offline/successful/failed) — omit it, or pass
  an unrecognized value, to include every status. Used by the Payouts page's "Export" modal so the
  landlord's status/date filters are enforced server-side rather than trusted from the front end.

## Response

Success (200):

```json
{
  "ok": true,
  "url": "https://.../reports/...?token=...",
  "fileName": "IPM_income-expenses_my-property_2026-09-30.pdf",
  "reportType": "income_vs_expenses",
  "dateFrom": "2026-09-01",
  "dateTo": "2026-09-30",
  "createdOn": "30/09/2026",
  "property": { "name": "...", "location": "...", "logoUrl": "..." },
  "data": { "...": "report_type-specific shape — see fetchIncomeVsExpenses/fetchOccupancy/fetchOverdueRent" }
}
```

`url` is a 5-minute signed URL into the private `reports` storage bucket — a real file the frontend
can hand straight to a browser download. `data` (plus `property`/`dateFrom`/`dateTo`/`createdOn`) is
the exact same object the PDF/CSV were built from, included so the frontend's report-preview screen
can render an HTML replica of the report without a second query — the preview and the downloaded
file are guaranteed to show the same numbers because they come from one fetch, not two. Failure is
always `{ "error": "<message>" }` with a 4xx/5xx status — never a raw exception or stack trace.

## What it does

1. Verifies the Authorization header is present, then reads everything (property, collections,
   expenses, tenants, rooms) through a Supabase client scoped to that session — RLS decides what the
   caller can see, `property_id` from the request body is never trusted on its own.
2. Builds the PDF (jsPDF, Inter font fetched and embedded per-request with a Helvetica fallback if
   that fetch fails) or CSV (hand-rolled, UTF-8 BOM) for the requested report type.
3. Uploads it to the private `reports` bucket at `${property_id}/${report_type}-${date}-${uuid}.${ext}`.
4. Inserts a row into `report_history` (backs the Reports hub's "Report history" tab).
5. Returns a 5-minute signed URL. The frontend re-signs on demand for anything older, straight from
   the client — the `reports_storage_select` RLS policy is what makes that safe without another
   round trip through this function.

## Schema this relies on

`properties(name, address, slug)` — logo on the report is Instay Manage's own brand mark, not
`properties.logo_url`. `collections(amount, status, created_at, property_id)`,
`expenses(name, amount, date, category_id, property_id)`, `expense_categories(name)`,
`rooms(room_type_id, property_id)`, `room_types(name, capacity)`,
`tenants(name, owed_amount, days_overdue, guardian_name, guardian_phone, room_id, room_type_id, active, property_id)`.
See `supabase/migrations/20261006000000_report_generation.sql` for `report_history` and the
`reports` storage bucket + policies this function writes to.
