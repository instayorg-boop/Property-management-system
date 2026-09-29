# Archetype: Create / Edit Form

Applies to: `AddTenant.tsx` (add + edit via route param), `StaffEmployees.tsx`
slide-over add/edit form, `StaffClock.tsx` modal form, `Contact.tsx` (marketing
contact form — lighter-weight variant, see note).

## Grid / layout structure
- Full-page forms (`AddTenant`) live inside `DashboardLayout`'s main column,
  content capped at a comfortable reading/editing width (~640–720px), centered in
  the available space — full table-width is wrong for a form, per the confirmed
  "task-specific, broken into small steps" form pattern from the teardown.
- Slide-over/modal forms (`Sheet`/`Dialog`) use the same internal structure at
  their own width (`Sheet` ~420–480px, `Dialog` ~480–560px).
- Vertical structure, top to bottom:
  1. Title (+ back link if full-page) — "Add tenant" / "Edit tenant".
  2. Form broken into labeled sections with a `Separator` or clear heading between
     each (e.g. "Room assignment," "Contact details," "Documents") — never one
     undifferentiated field list, matching the teardown's staged-form pattern.
  3. Sticky footer action row: secondary action (Cancel, ghost/outline) left,
     primary action (Save/Add tenant, solid `bg-primary`) right — for full-page
     forms this footer can be inline at the bottom rather than sticky; for
     `Sheet`/`Dialog` it should stick to the bottom of the panel.

## Where primary actions live
- Bottom footer only. Never a save button floating mid-form or only at the very
  top — per teardown's "clear CTA" pattern, the primary action should be the last
  thing the user reaches after completing the fields above it.

## Information hierarchy
1. Section heading.
2. Field label (above input, not inline-left) — matches teardown's confirmed
   label-above-input convention.
3. Input.
4. Help text (below input, small, `text-muted-foreground`) where needed.
5. Error text (below input, replaces help text, `text-destructive`, with a small
   leading icon) when the field is invalid.

## Component composition
- `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` (shadcn,
  built on top of the existing `react-hook-form`-style pattern if one is in use —
  check before assuming; if not present, plain controlled inputs are fine as long
  as the visual structure matches).
- `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup`, `Switch` per field type.
- `Separator` between sections.
- Required-field convention: a small `*` immediately after the label text, plus one
  line near the top of the form noting "* required" — not a red asterisk on every
  field with no legend.
- Password fields (auth forms share this form archetype's field conventions): a
  visible strength meter component below the field, per the confirmed teardown
  pattern — this already exists in `GetStarted.tsx`/similar; keep it, restyle to
  tokens.

## Contact form variant (Contact.tsx)
- Lighter-weight: no multi-section staging needed for a 3–4 field contact form.
  Single section is fine. Still: label-above-input, footer-right submit button,
  same field/error styling as the full archetype.

## Responsive collapse
- Any two-column field rows (e.g. first/last name side by side) stack to one
  column below `sm`. Footer action row stays right-aligned but both buttons can go
  full-width stacked (primary above secondary) below `sm` if the panel is narrow
  (this matters most for the `Sheet` variant on mobile).
