# Shared component migration — Phase 5 diff summary

All 14 files in `src/landlord/components/` kept their exact existing public prop interfaces
(component name, prop names, prop types) — no interface changes anywhere, so no call sites (across
`src/landlord/pages/*` and other landlord components) needed edits; only each component's internal
markup/styling changed to delegate to a shadcn/ui primitive and use the shadcn token surface
(`bg-background`/`bg-card`/`bg-surface-muted`/`text-foreground`/`text-muted-foreground`/`bg-primary`/
`text-primary`/`border-border`/`bg-destructive`) in place of the legacy `ink`/`paper`/`mist`/`muted`/
`brand`/`line` classes, with radius/shadow/motion brought in line with tokens.md (`rounded-md` for
inputs/buttons, `rounded-lg` for cards, `rounded-xl` for modals/sheets/popovers; `shadow-xs`/`sm` for
resting cards, `shadow-md` for popovers/dropdowns, `shadow-lg` for modals/sheets).

- **Button.tsx** — now a thin wrapper around `components/ui/button.tsx`'s `Button`, mapping the
  app's existing `variant` (`primary`/`secondary`/`outline`/`danger`/`dangerSolid`/`warning`/`ghost`)
  and `size` (`sm`/`md`) vocabulary onto shadcn's `variant`/`size` plus small token-based className
  overrides for `dangerSolid`/`warning`. No interface change (0 call sites affected; ~122 usages).
- **Modal.tsx** — rebuilt on `components/ui/dialog.tsx` (`Dialog`/`DialogContent`/`DialogHeader`/
  `DialogTitle`/`DialogDescription`), replacing the hand-rolled `framer-motion` overlay/panel with
  Radix's built-in open/close animation and focus trap; `disableBackdropClose` now prevents Radix's
  outside-click/escape dismissal instead of swallowing the manual backdrop `onClick`. Same
  `onClose`/`title`/`description`/`footer`/`maxWidth`/`disableBackdropClose` props (0 call sites
  affected; 27 usages).
- **SlideOver.tsx** — rebuilt on `components/ui/sheet.tsx` (`Sheet`/`SheetContent`/`SheetHeader`/
  `SheetTitle`/`SheetDescription`), same approach as Modal. Same `onClose`/`title`/`description`/
  `footer`/`headerActions`/`maxWidth` props (0 call sites affected; 10 usages).
- **Select.tsx** — wraps `components/ui/select.tsx`. Added a friendly empty-options message
  ("Nothing to choose from yet.") in place of an empty dropdown panel, per the empty-state tone
  rules (never "No data"). Same `value`/`onChange`/`options`/`placeholder`/`className` props (0 call
  sites affected; 15 usages, plus internal use by Pagination and BankSelect's search input pattern).
- **DatePicker.tsx** — wraps `components/ui/popover.tsx`; no `calendar` primitive exists in
  `src/components/ui/`, so the month grid is still hand-built (as before) but now token-compliant
  (`border-border`, `bg-card`, `bg-primary`/`text-primary-foreground` for the selected day,
  `hover:bg-surface-muted`). Same `value`/`onChange`/`className`/`placeholder` props (0 call sites
  affected; 13 usages).
- **Pagination.tsx** — page-number row now uses `components/ui/pagination.tsx`
  (`Pagination`/`PaginationContent`/`PaginationItem`/`PaginationLink`); the "go to page" input uses
  `components/ui/input.tsx`. When `pageCount <= 1` the page-button row is replaced with a plain
  "Page 1 of 1" label and the jump-to-page input is disabled, instead of rendering a single
  clickable "1" button or a broken-looking control. Same `page`/`pageCount`/`pageSize`/
  `totalItems`/`onPageChange`/`onPageSizeChange` props (0 call sites affected; 6 usages).
- **MetricCard.tsx** — all three layouts (`default`/`compact`/`flat`) now render on
  `components/ui/card.tsx`'s `Card` for the outer surface (border/radius/shadow), keeping the
  existing tone/trend/icon logic. Same full prop set (0 call sites affected; 20 usages).
- **PageHeader.tsx** — no shadcn primitive to wrap (pure layout); token-compliant typography
  (`text-foreground`, `text-muted-foreground`) per the list-table-view archetype's header spec
  (title left, actions right). Same props (0 call sites affected; 20 usages).
- **SectionLabel.tsx** — token-compliant (`text-primary`), no shadcn primitive applicable. Same
  props (0 call sites affected).
- **FieldLabel.tsx** — token-compliant (`text-muted-foreground`, `text-destructive`), asterisk
  placement matches the create-edit-form archetype's "asterisk immediately after label text"
  convention (unchanged from before, now confirmed against the archetype doc). Same
  `FieldLabel`/`FieldError` props (0 call sites affected; 50 usages).
- **Avatar.tsx** — wraps `components/ui/avatar.tsx`'s `Avatar`/`AvatarFallback` (which already used
  `bg-surface-muted` per the tokens.md collision note — confirmed, left as-is). Same `name`/`size`
  (pixel number) props (0 call sites affected; 1 usage).
- **Skeleton.tsx** — base `Skeleton` now wraps `components/ui/skeleton.tsx`; all derived helpers
  (`SkeletonText`/`SkeletonSwap`/`SkeletonRow`/`SkeletonCard`/`SkeletonList`/`Spinner`) kept, moved
  to `border-border`/`bg-card` tokens, and `SkeletonSwap`/`SkeletonList` transition durations pinned
  to the `base` (180ms) motion token rather than an arbitrary 250ms — none use the 1600ms "loading"
  duration, matching the "skeletons should just be present/absent" guidance. Same exported names and
  props throughout (0 call sites affected; 100 usages).
- **BankSelect.tsx** — rebuilt on `components/ui/popover.tsx` + `components/ui/input.tsx` in place
  of raw Radix `Popover`-style hand-rolled markup, same trigger/search/select interaction. Same
  `banks`/`selectedCode`/`onSelect`/`placeholder` props (0 call sites affected; 1 usage).
- **PhoneNumberInput.tsx** — country picker rebuilt on `components/ui/popover.tsx`, both the country
  search field and the local-number field now use `components/ui/input.tsx`. Same
  `value`/`onChange`/`placeholder`/`error` props, plus the unchanged `parsePhone`/`formatPhone`/
  `validatePhone` exports (0 call sites affected; 2 usages).

**Icons**: several components previously used `@phosphor-icons/react` (`CaretDown`, `CalendarBlank`,
`Bank`, etc.); since the shadcn primitives they now wrap are built against `lucide-react`, those
icons were swapped to their `lucide-react` equivalents inside the migrated files only (`ChevronDown`,
`CalendarIcon`, `Landmark`, `TrendingUp`/`TrendingDown`, `ArrowRight`). `@phosphor-icons/react` is
untouched elsewhere in the app.

**Verification**: `npx tsc -b --noEmit` and `npx vite build` both run clean after the migration. The
only TypeScript errors present are the pre-existing, explicitly-known ones in `Tenants.tsx` (5 unused
imports/vars, plus a `size` prop passed to the `lucide-react` `SearchIcon` which doesn't accept it)
and none in `Accounting.tsx` beyond the pre-existing unused `categoryBadgeStyle` — none of these are
at call sites of the 14 migrated components, and none were introduced by this migration. `vite build`
completes with the same pre-existing chunk-size warning only.
