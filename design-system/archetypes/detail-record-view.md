# Archetype: Detail / Record View

Applies to: `TenantProfile.tsx`, `StaffPayroll.tsx` run-detail slide-over, report
pages under `landlord/pages/reports/` (a printable-statement variant — see note).

## Grid / layout structure
- Inside `DashboardLayout`'s main column.
- Vertical structure, top to bottom:
  1. Back link (`← Back to tenants`), small, top-left, `text-muted-foreground`.
  2. Record header: identity block (avatar/name/key facts) left, status actions
     (move-out, reactivate, delete) right, same row on desktop, stacked on mobile.
  3. `Tabs` row immediately below the header (Financial ledger / Information /
     Maintenance / Documents), full-width underline-style tabs, not pills.
  4. Tab content area — each tab is its own scoped layout (a ledger tab is a table,
     an information tab is a two-column label/value grid, etc.) but all share the
     same content max-width and top padding so switching tabs doesn't jump content
     vertically.

## Where primary actions live
- Destructive/status-change actions (delete, move-out) live in the header, in a
  `DropdownMenu` off a "⋯" trigger — not as loose buttons next to the name, to keep
  the header from feeling action-heavy.
- Tab-scoped actions (e.g. "Log payment" inside the ledger tab) live inside that
  tab's own content, top-right of that tab's content block.

## Information hierarchy
1. Identity (name, unit/room, status badge) — largest text on the page after
   nothing (there's no separate page title; the identity block *is* the title).
2. Status/relationship facts (move-in date, balance) as small label/value pairs
   directly under the identity block.
3. Tabbed detail content, ordered by how often each is checked day-to-day
   (financial ledger first, matching current order).

## Component composition
- `Avatar` for the identity block.
- `Badge` for status.
- `DropdownMenu` for header actions.
- `Tabs` for section switching.
- Ledger tab: same `Table` spec as the list-table-view archetype.
- Information tab: two-column definition-list layout (`grid-cols-2`, label in
  `text-muted-foreground text-sm`, value in `text-foreground`).

## Report-page variant (reports/*)
- Reports are a read-mostly, printable sub-variant: single centered column (not
  full-width), month switcher at top, sectioned line items with subtotals, no
  tabs. Keep this narrower/print-friendly shape rather than forcing the full
  detail-record layout onto reports — the archetype's shared piece is "identity/
  context header + structured content below," not the tab bar.

## Responsive collapse
- Header's identity block and action menu stack (identity above, actions below,
  full-width) below `md`.
- Tabs become horizontally scrollable rather than wrapping.
