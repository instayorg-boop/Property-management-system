# Archetype: Dashboard / Overview

Applies to: `Dashboard.tsx` (landlord home).

## Grid / layout structure
- Lives inside the persistent `DashboardLayout` shell (fixed left sidebar, ~240–260px
  wide; scrollable `<main>` to its right; top `Header` bar spanning the main column).
- Content max-width: fluid within the main column, no artificial narrow cap — the
  teardown confirms Gusto dashboards run information-dense, so use the available
  width rather than a centered 800px column.
- Vertical structure, top to bottom:
  1. Page header row: greeting/title (left) + primary quick-action button(s)
     (right), same row, not stacked.
  2. Metric card row: 3–4 `Card`s in a responsive grid (`grid-cols-2 md:grid-cols-4`),
     each a single stat + label + optional trend delta.
  3. Primary content row: a two-column split on desktop — main chart/table (left,
     ~65% width) + activity/notification feed (right, ~35% width, in a `Card`).
     Collapses to single column (chart first, feed second) below `md`.
- This mirrors the one confirmed structural fact from the teardown: most-recent/
  most-important info front-and-center with a clear CTA, secondary info
  (reminders, upcoming items) in a side rail, not competing for primary weight.

## Where primary actions live
- Page-level primary action (e.g. "Record payment," "Add tenant"): top-right of the
  page header row, solid `bg-primary` button.
- Card-level actions (e.g. "View all"): top-right of that card's header, ghost/link
  style, not a full button.

## Information hierarchy
1. Greeting/context (who/what/when) — small, `text-muted-foreground`.
2. Metric cards — the day's headline numbers, largest visual weight after the page
   title.
3. Primary chart/table — the main analytical content.
4. Activity feed — recency-ordered, secondary weight, smaller type.

## Component composition
- `Card` for every metric tile and the activity feed container.
- `recharts` (already in use) for the bar chart, restyled with `chart.series*`
  tokens.
- `Skeleton` (shadcn) for the loading state of each metric card and the chart area
  independently — don't block the whole page behind one spinner.
- `Avatar` for any user/staff references in the activity feed.

## Responsive collapse
- `md` and below: metric cards go 2-up then 1-up; main content column stacks above
  the activity feed; header row's quick actions wrap below the title if needed
  rather than shrinking to icon-only.
