# Archetype: Marketing / Content Page

Not in the prompt's minimum archetype list, but added because it's the largest
single group of pages in this codebase: `Landing.tsx`, `Pricing.tsx`, `About.tsx`,
`HowItWorks.tsx`, `FeatureDetail.tsx`, `Docs.tsx`, `Help.tsx`, `Careers.tsx`,
`Status.tsx`, `Terms.tsx`, `Privacy.tsx`. Forcing these into "dashboard" or "list
view" would misrepresent the actual structural spec they need.

## Grid / layout structure
- Shared chrome: `Nav` (top) + `Footer` (bottom), or the `PageShell` wrapper
  (check which of the two a given page currently uses — both should converge on
  the same visual chrome, `PageShell` is likely the thinner/newer wrapper).
- Content max-width: ~1120–1200px, centered, with side gutters — never full
  viewport width for text-heavy pages (readability).
- Two content shapes recur:
  1. **Landing/feature-rich** (`Landing`, `Pricing`, `FeatureDetail`, `About`):
     full-width alternating sections (hero, feature grid, comparison/pricing
     table, FAQ, CTA banner), each section can break the max-width for its
     background but keep inner content within it.
  2. **Simple content/list** (`HowItWorks`, `Docs`, `Help`, `Careers`, `Status`,
     `Terms`, `Privacy`): single narrower column (~720–800px) of stacked
     text/list content, centered. `Help.tsx`'s topic-card grid is the one
     exception — a 2-column card grid within this otherwise single-column group.

## Where primary actions live
- Landing/pricing pages: one clear primary CTA repeated at natural break points
  (hero, mid-page, footer banner) — not a different CTA wording each time.
- Content pages (Docs/Help/Careers/Status/Terms/Privacy): no primary CTA
  required; Careers' role cards link out via `mailto`, Help's topic cards link to
  article lists.

## Information hierarchy
- Hero: headline (`font-display`, large) + one-line subhead + primary CTA, always
  above the fold.
- Feature/content sections: heading + short body, consistent heading scale across
  every marketing page (don't let one page's H2 be visually a different size than
  another's).

## Component composition
- `Card` for feature tiles, pricing tiers, help topic cards, role cards, status
  rows.
- `Badge` for plan labels ("Most popular"), status indicators (Status.tsx).
- `Accordion`-style pattern for FAQ (not in the installed base set — add via
  `npx shadcn add accordion` if FaqSection.tsx needs it structurally).
- `Table` for the pricing comparison grid.

## Responsive collapse
- Hero CTA and nav collapse per existing `Nav.tsx` mobile menu pattern (keep this
  — it's chrome, not per-page).
- Multi-column feature/pricing grids go to 1-column below `sm`, 2-column below
  `lg` where a 3+ column grid exists.
