# Design tokens — usage guide

Source of truth: [`tokens.json`](./tokens.json). It is consumed as CSS custom
properties in `src/index.css`'s `@theme` block (Tailwind v4 is CSS-first — this repo
has no `tailwind.config.ts`, so the `@theme` block *is* the Tailwind config).
Treat any value hardcoded outside these two files as a bug to report in the Phase 5
audit.

Full research backing these choices: [`../research/gusto-teardown.md`](../research/gusto-teardown.md).
Color/spacing/radius specifics there are labeled INFERRED (reconstructed, not
screenshot-verified) — this token set is a locked, internally-consistent starting
point, not a pixel-perfect Gusto clone. If real Gusto screenshots surface later,
diff them against this file before making changes, don't patch pages ad hoc.

## Naming: two layers, same values

1. **Legacy app tokens** (`--color-ink`, `--color-paper`, `--color-mist`,
   `--color-line`, `--color-muted`, `--color-brand`, `--color-brand-soft`,
   `--color-success`, `--color-danger`) — pre-existing names used across ~90 files
   via `text-ink`, `bg-paper`, `text-muted`, etc. Kept unrenamed so migration doesn't
   require touching every call site; their *values* now point at the Gusto-derived
   palette.
2. **shadcn token surface** (`--color-background`, `--color-foreground`,
   `--color-primary`, `--color-card`, `--color-border`, `--color-ring`, etc.) — the
   names `src/components/ui/*` expect. New pages built against shadcn components
   should use these (`bg-background`, `text-foreground`, `bg-primary`, ...), not the
   legacy names.

**Known collision, resolved:** shadcn's `bg-muted` (a light background surface) and
the app's pre-existing `text-muted` (a muted gray *text* color) would both compile
from one `--color-muted` variable if named identically — since Tailwind generates
`bg-*`/`text-*` utilities from a single `--color-<name>` var. shadcn's background
variant was renamed to `--color-surface-muted` / `bg-surface-muted` inside the 3
`components/ui/*.tsx` files that used it (avatar, tabs, table) to keep the two
concepts separate. `--color-muted-foreground` (shadcn's muted *text*) has no such
collision and is safe to use directly.

As pages migrate to shadcn components (Phase 4), prefer `text-muted-foreground`
over the legacy `text-muted` where it's a like-for-like swap — they use nearly
identical gray values today, but `muted-foreground` is the forward-looking name.

## When to use which token

**Color**
- `bg-background` / `page` background — the warm cream page canvas, never pure
  white. Use for `<body>` and full-page containers.
- `bg-card` — pure white, for any card, panel, table, or modal surface sitting on
  the page background. This is what creates the "soft, layered" read from the
  teardown (cream page, white cards, light shadow — not white-on-white).
- `bg-surface-muted` — light neutral fill for zebra-free table headers, subtle
  section dividers, disabled/inactive chrome.
- `text-foreground` / legacy `text-ink` — primary text.
- `text-muted-foreground` / legacy `text-muted` — secondary/supporting text,
  timestamps, helper copy.
- `bg-primary` / `text-primary` — the brand green. Reserve for primary CTAs, active
  nav state, links, and focus rings. Don't use as a large background fill (per the
  teardown: color shows up in accents/icons/CTAs, not full-bleed panels).
- `bg-destructive` — red, only for genuinely destructive or error actions (delete,
  terminate, waive), never for routine "clear" or "cancel" buttons.
- `chart.series1`–`series8` — categorical chart palette. Fixed hue order, never
  reassigned per filter/dataset. Series 1 (green) and series 8 (red) double as
  income/expense identity on the Accounting page — preserve that pairing.

**Typography**
- `font-sans` (Inter) for all UI text. `font-display` (Fraunces) only for marketing
  headlines and large display numbers — never body copy or form labels.
- Type scale: `4xl`/`5xl`/`6xl` for page-level H1s (marketing vs. product H1s differ
  in scale — product H1s should sit at the lower end, `3xl`/`4xl`, since dashboards
  are information-dense per the teardown, not headline-driven).
- `sm`/`base` for body and form text; `xs` for captions, table meta, timestamps.

**Spacing**
- `4px` base unit. Use `2`–`3` (8–12px) for tight internal component spacing (icon-
  to-label gaps, badge padding), `4`–`6` (16–24px) for card/section internal
  padding, `8`+ (32px+) for spacing between major page sections.

**Radius**
- `sm` (6px): checkboxes, small badges, chips.
- `md` (8px): inputs, buttons — the default (`--radius`).
- `lg` (12px): cards, table containers.
- `xl` (16px): modals, sheets, large popovers.
- Never use 0–2px anywhere; sharp corners contradict the "soft/friendly" brand read
  that's the one qualitatively confirmed constant from every research source.

**Shadow**
- `shadow-xs`/`sm`: cards resting on the page — barely-there, just enough to
  separate from the cream background.
- `shadow-md`: hover-lifted cards, dropdown menus.
- `shadow-lg`: modals, sheets — the one place a clearly "lifted" shadow is
  appropriate, signaling a distinct interaction layer.
- `shadow-focus`: focus rings (paired with `--color-ring`), not a resting-state
  shadow.

**Motion**
- `fast` (120ms): hover/press micro-interactions.
- `base` (180ms): modal/sheet open-close, dropdown open.
- `slow` (280ms): page-level transitions, toast enter/exit.
- `loading` (1600ms): only for the one branded "big moment" loading animation
  (first load / running payroll equivalent) — don't reuse this duration for routine
  skeletons, which should just be present/absent, not animating on a fixed clock
  longer than needed.

## Dark mode

The landlord dashboard has a scoped dark theme (`.theme-dark` class), never applied
to the public marketing site. Dark-mode token values live in the `.theme-dark`
block in `src/index.css`, mirroring `tokens.json`'s `color.dark` object. When adding
a new token, add both the light value (in `@theme`) and, if the token is
visually load-bearing in the dashboard, its dark override (in `.theme-dark`).
