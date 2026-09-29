# Archetype: Settings / Account

Applies to: `Settings.tsx`.

## Grid / layout structure
- Inside `DashboardLayout`'s main column.
- Two-level navigation: a `Tabs` row (or left-side vertical tab list on wider
  screens — see below) across the top-level sections (Property/Billing/
  Reminders/Notifications/Subscription/Account), matching the existing tabbed
  structure.
- Prefer a **left vertical tab list** (not top horizontal tabs) once viewport is
  `lg`+: a narrow (~200px) list of section names down the left of the content
  area, content to the right in a single `Card`-free column of grouped setting
  rows. This is a deliberate archetype-level structural change from the current
  top-tab layout — settings pages with 6 sections read better as a left list than
  a wide horizontal tab bar (avoids the tab bar wrapping/scrolling). Fall back to
  the existing horizontal `Tabs` below `lg`.
- Within a section: grouped rows, each row = label + description (left) + control
  (right) — toggle, stepper, select, or a "Edit" link that opens a `Sheet`/`Dialog`
  for anything more than one field.

## Where primary actions live
- Per-row controls act immediately (toggles, steppers) — no page-level "Save"
  button for those.
- Multi-field edits (e.g. changing property address) open a `Dialog`/`Sheet` with
  its own footer Save/Cancel, per the create-edit-form archetype.
- Any section-level destructive action (e.g. "Cancel subscription," "Delete
  account") sits at the bottom of its section, visually separated by a
  `Separator`, styled as an outline/destructive button — never as the first thing
  in a section.

## Information hierarchy
1. Section name (nav).
2. Section description (one line, optional, `text-muted-foreground`, under the
   section's own heading in the content area).
3. Grouped rows, each visually separated by a hairline `border-border` divider,
   not individual cards per row (a full section is one visual group, not N
   floating cards).

## Component composition
- `Tabs` (horizontal, below `lg`) or a plain vertical nav list (`lg`+) for section
  switching.
- `Switch` for booleans, `Select` for enumerated choices, a small +/- `stepper`
  (custom, token-styled) for numeric settings — matches what's already there.
- `Dialog`/`Sheet` for any row that needs a multi-field edit flow.
- `Badge` for plan/subscription status.

## Responsive collapse
- `lg`+: left vertical section nav + content, two columns.
- Below `lg`: horizontal `Tabs`, single column, section content full-width below
  the tab row.
