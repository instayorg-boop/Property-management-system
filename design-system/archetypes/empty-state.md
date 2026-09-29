# Archetype: Empty State

Not a standalone page — a state rendered in place of content within the
list-table-view, dashboard, and detail archetypes whenever there's no data yet
(no tenants, no expenses, no maintenance requests, a report with no transactions
in range, etc.). `Accounting.tsx` already has an existing empty-state illustration
to reference for tone.

## Structure
- Centered within the content area that would otherwise hold the table/list
  (not the whole page — toolbar/filters/page header stay visible above it so the
  user can still search or change filters).
- Vertical stack, centered:
  1. Illustration or icon — per the teardown's confirmed illustration-forward
     pattern, prefer a simple on-brand illustration over a generic outline icon
     where one exists for this content type; fall back to a large (48–64px)
     outline icon in `text-muted-foreground` otherwise.
  2. Heading — short, specific ("No tenants yet," not "No data").
  3. One line of body copy — friendly, action-oriented ("Add your first tenant to
     start tracking rent."), `text-muted-foreground`.
  4. Primary CTA button — the same action as the page's header "+" button (don't
     introduce a second, differently-worded way to do the same thing).

## Tone
- Friendly, encouraging, never clinical ("No records found" is wrong; "No tenants
  yet" is right) — per the confirmed "delightful," "playful" read from every
  research source.

## Filtered-empty variant
- When emptiness is due to an active filter/search (not genuine zero-data), skip
  the illustration — show just a heading ("No results for 'x'") + a "Clear
  filters" link-style action instead of the primary CTA. Don't tell someone to
  "add a tenant" when they simply searched for a name that doesn't match.
