# Gusto Product UI Teardown

Research basis: web search + article/portfolio fetches (Appcues "Gusto's delightful
user interface" teardown, SaaSUI.design Gusto collection, nicelydone.club Gusto app
screen index, Dribbble's official Gusto Design team account). Direct fetches of
gusto.com and brandfetch.com were blocked by bot protection (403), so this document
leans on secondary sources plus well-established general knowledge of Gusto's brand
(trained knowledge, not observed this session). **Every specific value below is
labeled CONFIRMED (found in a fetched source this session) or INFERRED (reasonable
reconstruction, not directly observed this session) — treat INFERRED values as a
starting point to sanity-check against real screenshots before pixel-perfect work.**

---

## 1. Color palette

**INFERRED** (could not pull real hex values from gusto.com; blocked by bot protection):
- Primary brand accent: warm green (Gusto's signature "payroll = money = green" cue),
  approx `#F87171`-free — use a confident grass/emerald green, not a cold SaaS blue.
  Approximate: `#2C6E49` to `#3D8B5F` range for interactive primary, since Gusto's
  actual product button green trends deeper/more muted than a bright lime.
- Secondary/marketing accent colors: warm coral/orange and soft pink appear in
  Gusto's illustration work (per Appcues teardown: "colorful illustrations... fun
  additions"), used for feature-tagging and empty-state illustrations, not for
  interactive UI chrome.
- Neutrals: warm off-white/cream page background (not stark white or cold gray) —
  Gusto's brand is warmer-toned than typical enterprise SaaS. Text: near-black
  (`#111827`-ish) rather than pure black.
- Semantic colors: conventional green=success (coincides with brand color, so
  success states likely use a distinct, more saturated green to differentiate from
  brand-green chrome), amber=warning, red=error.

**CONFIRMED** (from Appcues teardown): the interface leans playful and colorful via
illustration rather than saturated UI chrome — large flat color fields are used
sparingly; color shows up mostly in icons, illustrations, and small accent moments,
not as full-bleed brand-colored panels.

Recommendation for our token spec: treat the green as the primary interactive color,
warm cream/off-white as the page background (distinct from pure-white card
background), near-black as text — and flag this whole section for a follow-up
screenshot-based check before shipping final brand colors.

## 2. Typography

**INFERRED**: Gusto's marketing and product surfaces use a clean geometric/humanist
sans-serif (product UI) with a friendlier, slightly rounded display face for
marketing headlines. No confirmed exact family name from sources fetched this
session — do not hardcode a specific commercial font name as "confirmed."
Recommendation: use a widely-available geometric sans (e.g. "Inter" or "Figtree")
for UI text as a practical substitute, reserving a warmer serif/rounded display face
only for marketing headlines, mirroring the product/marketing split Gusto itself
uses.

Type scale (INFERRED, standard SaaS scale, not Gusto-specific):
- Display/H1: 32–40px / bold
- H2: 24–28px / semibold
- H3: 18–20px / semibold
- Body: 14–15px / regular
- Small/caption: 12–13px / regular or medium

## 3. Spacing scale

**INFERRED**: standard 4px base unit, multiples of 4 (4/8/12/16/24/32/48/64).
No Gusto-specific confirmation available.

## 4. Radius scale

**CONFIRMED (qualitative)**: Gusto's UI reads as soft/friendly, not sharp-cornered
enterprise software (consistent with "delightful," "playful" language across every
source). **INFERRED (values)**: generous radii — inputs/buttons ~8px, cards ~12px,
modals ~16px. Avoid 0–2px sharp corners anywhere.

## 5. Shadows / elevation

**INFERRED**: light, low-contrast shadows for cards (barely-there separation from
the cream background); a stronger, clearly-lifted shadow for modals/popovers/
dropdowns to signal a distinct interaction layer.

## 6. Borders vs. shadows

**INFERRED**: cards on the cream background likely rely on a subtle shadow or a
very light border rather than a strong border, matching the "soft/warm" read.
Tables use thin hairline row dividers.

## 7. Buttons

**CONFIRMED (qualitative)**: "Clear call-to-action buttons guide users to key
functions" (Appcues) — primary actions are visually unambiguous.
**INFERRED**: primary = solid brand-green fill, white text, rounded (~8px);
secondary = outline or soft-fill neutral; ghost = text-only for low-emphasis
actions; destructive = red, used sparingly (e.g., "waive," "delete," "terminate").
Icon placement: leading icon for action buttons where an icon reinforces meaning
(add, download, etc.), not decorative-only.

## 8. Forms

**CONFIRMED (qualitative, from nicelydone.club index)**: password fields show a
visible strength meter (progressive validation feedback); setup forms are broken
into small, task-specific steps rather than one long form (e.g., company legal
info, then mailing address, then EIN — as separate steps/modals).
**INFERRED**: label-above-input pattern, inline help text below the input (not
tooltip-only), required-field convention via a subtle asterisk or "(required)"
label rather than heavy red asterisks everywhere, error text directly below the
field in red with an icon.

## 9. Cards

**INFERRED**: generous internal padding (20–24px), a clear optional header (title +
optional right-aligned action), body content, optional footer for actions — a
fairly standard but generously-spaced card.

## 10. Tables

**CONFIRMED (qualitative)**: tables are a core recurring pattern (SaaSUI collection
tags "Table" explicitly). **INFERRED**: comfortable row height (not dense/compact),
header row in a muted neutral (not heavy black), hairline row dividers rather than
zebra striping (consistent with the "soft" aesthetic), row hover highlight, sort
indicator as a small caret in the header cell.

## 11. Empty states

**CONFIRMED (qualitative)**: Gusto uses a distinctive illustrated loading state — a
masked piggy bank animation described as creating "a delightful experience"
(Appcues). This signals illustration-driven empty/loading states generally, not
plain spinners.
**INFERRED structure**: centered illustration (on-brand, colorful) + heading + one
line of supporting body copy + a single primary CTA button. Friendly, not clinical,
copy tone.

## 12. Loading states

**CONFIRMED**: branded illustrated/animated loading sequence used at least for
sidebar/app-shell load (piggy bank animation + skeleton placeholders in the sidebar
per nicelydone.club). So: skeleton placeholders for structural/layout loading
(sidebar, list rows), a friendlier branded animation reserved for a small number of
"big moment" loads (e.g., first load, running payroll) — not used for every minor
spinner.

## 13. Toast / notification patterns

**INFERRED** (no direct confirmation found): compact, corner-anchored toasts,
auto-dismissing, single-line for simple confirmations with an optional action link;
stacking behavior is standard (newest on top/bottom, older ones pushed and
auto-dismissed). Flag as a real gap to verify against real screenshots — toast
sizing/position is explicitly called out as a brand decision worth getting right.

## 14. Modal / dialog patterns

**CONFIRMED (qualitative)**: modals are used for focused single-purpose
interactions (address entry, feature announcements, referral sharing) per
nicelydone.club and SaaSUI. **INFERRED**: centered modal, moderate max-width
(~480–560px for simple confirmations, wider for multi-field forms), header with
title + close icon, footer with secondary action (left/ghost) + primary action
(right/solid), consistent right-aligned primary-button convention.

## 15. Navigation

**CONFIRMED**: "a side panel menu on the left of the screen" (Appcues) — persistent
left sidebar navigation, not top nav, for the core app. Sidebar shows skeleton
placeholders while loading (nicelydone.club).
**INFERRED**: active nav item indicated by a filled/tinted background plus icon
color change (not just a text color change); items grouped by function (Payroll,
People/Team, Benefits, Reports, Settings-style groupings).

## 16. Dashboard layout

**CONFIRMED (qualitative, Appcues)**: dashboard is information-dense but organized
so nothing feels overwhelming; most-recent/most-important info (e.g. most recent
payment) is front and center with a clear CTA; secondary info (upcoming payment
status, reminders) lives to the side, not competing for primary visual weight.
**INFERRED structure**: primary "hero" card/module top-left or full-width top,
secondary modules in a right rail or below, in a responsive grid that collapses to
single-column on narrow viewports.

## 17. Iconography

**INFERRED**: outline-style icon set (not heavy filled/glyph icons), consistent
stroke width, used alongside — not instead of — the illustration system for
whimsical moments (empty states, loading, onboarding).

## 18. Motion

**INFERRED**: short, purposeful transitions for hover/press (120–180ms), a longer
branded animation reserved for loading "big moments" (the piggy bank sequence).
Nothing aggressively bouncy elsewhere — motion supports the "delightful but not
distracting" read that every source echoes.

---

## Summary judgment for our migration

Gusto's product UI reads as: **warm, soft-cornered, illustration-forward, and calm**
— an intentional contrast to colder enterprise-SaaS conventions (hard corners, cold
blue/gray palettes, dense chrome). The single most load-bearing, actually-confirmed
takeaway across every source is the *tone*: information-dense screens kept legible
through clear hierarchy, generous whitespace, and friendly illustration rather than
heavy UI chrome — with a persistent left sidebar as the one confirmed structural
constant. Color specifics, exact type scale, and exact spacing/radius numbers in
this document are our best reconstruction and are flagged INFERRED throughout;
treat `/design-system/tokens/tokens.json` as a "Gusto-inspired, not Gusto-verified"
starting point.
