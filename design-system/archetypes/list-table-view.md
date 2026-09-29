# Archetype: List / Table View

Applies to: `Tenants.tsx`, `Rent.tsx`, `Rooms.tsx`, `Accounting.tsx`, `Payouts.tsx`,
`Maintenance.tsx`, `StaffEmployees.tsx`, `StaffPayroll.tsx`, `StaffClock.tsx`.
(`Rooms.tsx` is a card-grid variant of this archetype — see note at the end.)

## Grid / layout structure
- Inside `DashboardLayout`'s main column, full available width (tables need room).
- Vertical structure, top to bottom:
  1. Page header row: title (left) + primary action, e.g. "Add tenant"/"Record
     expense" (right), same row.
  2. Optional metric card row (only on pages that had one already: Rent, Rooms,
     Accounting, StaffPayroll) — same spec as the dashboard archetype's metric row,
     but treat it as optional context here, not the page's main content.
  3. Toolbar row: status filter tabs (left, shadcn `Tabs`) + search input and any
     secondary filters (right), same row, wrapping to two rows only below `md`.
  4. The table itself, in a `Card` with no extra padding around the `Table`
     (the card border *is* the table's border).
  5. `Pagination` (shadcn), bottom, right-aligned or centered — pick one and keep
     it consistent across every table page.

## Where primary actions live
- Page-level create action: top-right of the page header, solid `bg-primary`
  button, consistent icon (`+`) across all list pages.
- Row-level actions: right-aligned in the row, either a compact icon-button cluster
  (2 actions) or a `DropdownMenu` "⋯" trigger (3+ actions) — pick `DropdownMenu` as
  the default so it scales without per-page layout differences.
- Bulk actions (Maintenance has these today): appear in a contextual toolbar that
  replaces the filter toolbar when ≥1 row is checked, not a floating action bar.

## Information hierarchy
1. Page title + primary action.
2. Filters/search — must be visible without scrolling, always above the table.
3. Table headers — `text-muted-foreground`, `bg-surface-muted`, not heavy/black
   (per teardown: muted header treatment, not dense enterprise-black headers).
4. Table rows — comfortable height (not compact/dense), hairline dividers between
   rows (`border-border`), row hover state (`hover:bg-surface-muted/50`), no zebra
   striping.

## Component composition
- `Tabs` for status filters where the page has a small fixed set of statuses
  (Active/Moved out, etc.); a `Select` instead only when the filter list is long or
  dynamic.
- `Input` with a leading search icon for the search box.
- `Table`/`TableHeader`/`TableRow`/`TableCell` (shadcn) for the data grid itself.
- `Badge` for status pills (payment status, TPIN status, etc.) — colors drawn from
  `semantic` tokens (success/warning/error/info), never ad hoc.
- `Pagination` (shadcn) at the bottom.
- `Skeleton` rows (same row height as real rows) for the loading state — not a
  centered spinner, so the table shape doesn't jump on load.
- Empty state: see `empty-state.md` — rendered in place of the table body, toolbar
  stays visible so the user can still search/filter/clear.

## Row-action drawers/modals
- Several of these pages open a `Sheet` (slide-over) or `Dialog` for row actions
  (log payment, adjust, waive penalty, reserve room). Keep using `Sheet` for
  multi-field edits/detail (matches current UX) and `Dialog` only for short
  confirm/single-field interactions — don't mix the two for the same action type
  across pages.

## Responsive collapse
- Below `md`: metric card row (if present) goes to 2-up; toolbar's filters and
  search stack into two rows; table either horizontally scrolls in its own
  `overflow-x-auto` container (preferred — keeps all columns) or collapses to a
  card-per-row list only if the table has more than ~5 columns.

## Grid-board variant (Rooms.tsx)
- Same header/toolbar structure as above, but the table body is replaced by a
  responsive card grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4+`) of room/bed
  cards, plus a list-view toggle to switch back to the plain table. Keep both
  views' filter/search toolbar identical so switching views doesn't relocate
  controls.
